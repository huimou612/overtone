import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { playMusicInfo } from '@renderer/store/player/state'
import { getMusicUrl } from '@renderer/core/music'
import { beginAnalysisJob, abortAnalysisJob } from '@renderer/utils/ipc'

// src/renderer/core/analysis/stems.ts
// 把「当前正在播的这首歌」变成 htdemucs 能吃的裸 PCM。
//
// 为什么解码在渲染层：Chromium 的 Web Audio 能解 mp3 / flac / m4a / wav / ogg，
// 而 Node 侧一个都不能 —— 主进程要解码就得再养一个 WASM 解码器。所以这里解完，
// 直接把裸 float32 写进主进程给的 mix.in，主进程只拿到「路径 + 采样数」。
//
// 这条路可行是因为主窗口是 `nodeIntegration: true` + webpack target `electron-renderer`：
// fs 在渲染层本来就在（worker/download 一直在用）。
//
// 一次 85MB 的数据不上 IPC 也是同一个理由 —— 那只是白搬一趟。

/**
 * htdemucs 写死的采样率。不是偏好，是导出图的形状决定的：
 * 这里建 OfflineAudioContext 时就按它建，`decodeAudioData` 会把源音频重采样到这个值，
 * 于是后面不需要再做任何重采样。
 */
export const STEM_SAMPLE_RATE = 44100

export interface PreparedSong {
  jobId: string
  /** 每声道的采样数，正是主进程用来核对 mix.in 长度的那个数。 */
  total: number
  durationSec: number
  sampleRate: number
}

/** 当前播放歌曲，没有就 null。 */
export const currentSong = () => playMusicInfo.musicInfo ?? null

/** 导出文件名用的标题。`歌名 - 歌手`，歌手缺失就只要歌名。 */
export const currentSongTitle = (): string => {
  const info = currentSong()
  if (!info) return ''
  // 播放器里的 musicInfo 有两种形状：普通列表项，和「已下载」的进度包装
  // （后者真正的歌曲信息在 metadata.musicInfo 里）。两种都要认，否则从下载列表
  // 播起来的歌会导出一个没有名字的文件。
  const raw = 'progress' in info ? info.metadata.musicInfo : info
  const name = String(raw.name ?? '').trim()
  const singer = String(raw.singer ?? '').trim()
  return singer ? `${name} - ${singer}` : name
}

/**
 * 取音频字节。
 *
 * 本地文件走 fs 而不是 fetch：`file://` 的 fetch 依赖 `webSecurity: false` 这个开关，
 * 而 fs 直读没有任何前提，也不经过 URL 编码那一层。
 */
const readAudioBytes = async(url: string): Promise<ArrayBuffer> => {
  if (url.startsWith('file:')) {
    const buffer = await fs.readFile(fileURLToPath(url))
    // readFile 对小文件可能给的是一个共享池里的视图，所以只有在它正好覆盖整个 buffer
    // 时才直接用；否则切一份出来交给 decodeAudioData（它会接管这个 buffer）。
    return buffer.byteOffset === 0 && buffer.byteLength === buffer.buffer.byteLength
      ? buffer.buffer
      : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  }
  const response = await fetch(url)
  if (!response.ok) throw new Error(`取音频失败：HTTP ${response.status}`)
  return await response.arrayBuffer()
}

/**
 * 解码成 44100 的 AudioBuffer。
 *
 * 长度写 1 是惯例：decodeAudioData 只关心 sampleRate，前两个参数对解码没有意义
 * （Chromium 也一样，Folia 用的是同一个写法）。
 */
const decodeAudio = async(bytes: ArrayBuffer): Promise<AudioBuffer> => {
  const context = new OfflineAudioContext(1, 1, STEM_SAMPLE_RATE)
  return await context.decodeAudioData(bytes)
}

/**
 * 把解码结果写成 htdemucs 的输入格式：一个裸 float32 文件，`[ 左声道全部, 右声道全部 ]`。
 *
 * 不是交错（LRLRLR）：轨道顺序与布局在 runner 的契约里，交错与分块会互相打架 ——
 * 分块是按整段切的，交错之后每块的第 0 个 float 是哪个声道就取决于块长的奇偶。
 */
const writeMix = async(inputPath: string, audio: AudioBuffer): Promise<void> => {
  const total = audio.length
  const left = audio.getChannelData(0)
  // 单声道源（有些音源就是 mono）复制一份，而不是补零：补零会变成「右声道静音」，
  // 模型会把整首歌判成只在左边，分离出来的人声也是单边的。
  const right = audio.numberOfChannels > 1 ? audio.getChannelData(1) : left

  const flat = new Float32Array(total * 2)
  flat.set(left, 0)
  flat.set(right, total)

  await fs.writeFile(inputPath, Buffer.from(flat.buffer, flat.byteOffset, flat.byteLength))
}

/**
 * 从「当前播放」一路做到「mix.in 已落盘」，返回主进程需要的两个数。
 *
 * 失败时会中止刚开的作业，避免临时目录留在盘上 —— 主进程只在 run_job 的 finally 里清理，
 * 没走到那一步的作业得由这里收尾。
 */
export const prepareCurrentSong = async(): Promise<PreparedSong> => {
  const info = currentSong()
  if (!info) throw new Error('当前没有正在播放的歌曲')

  const url = await getMusicUrl({ musicInfo: info })
  if (!url) throw new Error('拿不到这首歌的音频地址')

  const bytes = await readAudioBytes(url)
  const audio = await decodeAudio(bytes)
  if (!audio.length) throw new Error('这首歌解出来是空的')

  const { jobId, inputPath } = await beginAnalysisJob()
  try {
    await writeMix(inputPath, audio)
  } catch (error) {
    await abortAnalysisJob(jobId).catch(() => {})
    throw error
  }

  return {
    jobId,
    total: audio.length,
    durationSec: audio.duration,
    sampleRate: audio.sampleRate,
  }
}
