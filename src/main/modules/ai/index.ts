import { BrowserWindow, safeStorage } from 'electron'
import { AI_EVENT_NAME } from '@common/ipcNames'
import { mainHandle, mainSend } from '@common/mainIpc'
import { STORE_NAMES } from '@common/constants'
import { log } from '@common/utils'
import getStore from '@main/utils/store'

// 下面两个 .cjs 里，segmentation / textClient / credentialStore / openAICompatibleRequest
// 是从 Folia 移植过来的（AGPL-3.0），保持与上游同构以便日后 diff，所以用 .cjs 而不是 .ts。
// 本文件用 require 引入（返回 any，不做类型检查）：对这四个逐字移植的文件，
// 让 TS 去推导它们的类型只会把上游的写法当成错误，得不偿失。
// 真正需要保证的行为由 build-config/test-lxlrc.cjs 与 test-ai-service.cjs 覆盖。
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { MAX_SEGMENTATION_LINES, createAiService, parseManualSegmentation } = require('./service.cjs')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildLxlrc, isLxlrc, parseLyricLines } = require('./lxlrc.cjs')

interface LyricLine {
  startTime: number
  text: string
}

/**
 * 取一首歌的歌词行（带行起始时间）。
 *
 * 优先用 lxlrc：它带的逐字时间更细，但这里只取「行起始时间 + 行文本」这两样，
 * 所以两条来源拼出来的结构是一样的。分词只关心文本，时间只是给 lxlrc 构造器
 * 做时间轴基座。
 *
 * 注意 dbService 是 worker RPC，所有方法都是异步的。
 */
const readLyricLines = async(musicId: string): Promise<{ lines: LyricLine[], source: 'lxlrc' | 'lrc' | 'none' }> => {
  const lyricInfo = await global.lx.worker.dbService.getPlayerLyric(musicId)
  const candidates: Array<{ source: 'lxlrc' | 'lrc', text?: string | null }> = [
    { source: 'lxlrc', text: lyricInfo?.lxlyric },
    { source: 'lrc', text: lyricInfo?.lyric },
  ]
  for (const candidate of candidates) {
    if (typeof candidate.text !== 'string' || !candidate.text.trim()) continue
    const lines = parseLyricLines(candidate.text) as LyricLine[]
    if (lines.length) return { lines, source: candidate.source }
  }
  return { lines: [], source: 'none' }
}

export default () => {
  const service = createAiService({
    store: getStore(STORE_NAMES.AI),
    safeStorage,
    platform: process.platform,
    logger: {
      info: (...args: any[]) => log.info(...args),
      warn: (...args: any[]) => log.warn(...args),
      error: (...args: any[]) => log.error(...args),
      log: (...args: any[]) => log.info(...args),
    } as any,
  })

  // =========================配置与凭据=========================

  mainHandle(AI_EVENT_NAME.get_status, async() => {
    return service.getStatus()
  })

  mainHandle(AI_EVENT_NAME.set_setting, async({ params }: any) => {
    return service.setSetting(params.key, params.value)
  })

  mainHandle(AI_EVENT_NAME.set_credential, async({ params }: any) => {
    // 明文 key 只在这一跳里存在，之后由 safeStorage 加密落盘；
    // 返回值只有「配没配」，渲染层永远拿不到密钥本身
    return service.setCredential(params.key, params.value)
  })

  mainHandle(AI_EVENT_NAME.test_connection, async({ params }: any) => {
    return service.testConnection(params)
  })

  // =========================歌词读取=========================

  mainHandle(AI_EVENT_NAME.get_lyric_lines, async({ params }: any) => {
    const musicId = String(params?.musicId ?? '')
    if (!musicId) throw new Error('缺少歌曲 id')
    const { lines, source } = await readLyricLines(musicId)
    return {
      lines,
      source,
      // 已经带逐字歌词的歌，分词后能直接用真实时间对轴（见 lxlrc.cjs 末尾 TODO）
      hasWordByWord: source === 'lxlrc',
      maxLines: MAX_SEGMENTATION_LINES,
    }
  })

  // =========================分词=========================

  mainHandle(AI_EVENT_NAME.segment_lyric, async({ event, params }: any) => {
    const lines = params?.lines
    if (!Array.isArray(lines)) throw new Error('缺少歌词行')
    const window = BrowserWindow.fromWebContents(event.sender)
    const result = await service.segmentLines(lines, (progress: any) => {
      if (window && !window.isDestroyed()) mainSend(window, AI_EVENT_NAME.segment_progress, progress)
    })
    return result
  })

  mainHandle(AI_EVENT_NAME.get_manual_prompt, async({ params }: any) => {
    return service.getManualPrompt(params?.lines ?? [])
  })

  mainHandle(AI_EVENT_NAME.parse_manual_result, async({ params }: any) => {
    const lines = params?.lines
    if (!Array.isArray(lines)) throw new Error('缺少歌词行')
    return parseManualSegmentation(params?.raw ?? '', lines)
  })

  // =========================写回歌词=========================

  mainHandle(AI_EVENT_NAME.apply_lxlrc, async({ params }: any) => {
    const musicId = String(params?.musicId ?? '')
    if (!musicId) throw new Error('缺少歌曲 id')
    const lines = params?.lines
    if (!Array.isArray(lines) || !lines.length) throw new Error('缺少歌词行')

    const { lxlrc, stats, usedFallback } = buildLxlrc({
      lines,
      boundaries: params?.boundaries ?? null,
      options: params?.options,
    })
    if (!isLxlrc(lxlrc)) throw new Error('生成的逐字歌词未通过校验')

    const lyricInfo = await global.lx.worker.dbService.getPlayerLyric(musicId)
    // 只替换 lxlyric，原文 / 翻译 / 音译原样带回去，避免把用户已有的歌词覆盖掉
    await global.lx.worker.dbService.editedLyricUpdateAddAndUpdate(musicId, {
      ...(lyricInfo ?? { lyric: '' }),
      lxlyric: lxlrc,
    })

    const message = `逐字歌词已保存：${stats.lines} 行 / ${stats.totalSegments} 段` +
      `（AI 命中 ${stats.fromAi} 行，兜底切分 ${stats.fromFallback} 行）`
    log.info(`[ai] ${message}`)

    // 把 lxlrc 本身也带回去：渲染层拿到后 emit 给播放器，界面立刻能看到逐字效果，
    // 不必等下一次从数据库读回来
    return { ok: true, stats, usedFallback, message, lxlrc }
  })
}
