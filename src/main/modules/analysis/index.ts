import { app, BrowserWindow } from 'electron'
import { randomBytes } from 'node:crypto'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { ANALYSIS_EVENT_NAME } from '@common/ipcNames'
import { mainHandle, mainSend } from '@common/mainIpc'
import { log } from '@common/utils'

// 下面三个 .cjs 都是从 Folia（AGPL-3.0）移植的，保持与上游同构以便日后 diff，
// 所以用 .cjs 而不是 .ts。这里用 require 引入（返回 any，不做类型检查）。
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createModelStore } = require('./modelStore.cjs')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { runStems } = require('./sidecar.cjs')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { modelsPresent, resolveModelFile, resolveRuntime, PLATFORM } = require('./modelPaths.cjs')

// src/main/modules/analysis/index.ts
// 音源分离：下载模型、跑 htdemucs、把整曲导出成人声 + 伴奏两个 WAV。
//
// 分工（为什么长这样）：
//   - 解码在**渲染进程**。Chromium 的 Web Audio 能解 mp3/flac/m4a/wav，Node 侧一个都不能，
//     而给主进程塞一个 WASM 解码器等于多一个依赖去养。渲染层解出 PCM 后直接落盘，
//     因为渲染层是 `nodeIntegration: true` + webpack target `electron-renderer`，fs 本来就在。
//   - 推理在**Python sidecar**。onnxruntime 的 enable_mem_reuse 只有 Python 绑定能设，
//     这条决定了整条链路必须有那个 36MB 的运行时，理由写在 stems_runner.py 顶部。
//   - 落盘与编排在**主进程**（本文件）。临时目录、最终文件名、进度事件都归这里，
//     渲染层只负责「给我 PCM」。

/** 模型与运行时落在 userData 下的这个目录；与 Folia 的 getDownloadDir 是同一个角色。 */
const MODELS_DIR_NAME = 'stems'
/** 分离的中间产物（.in / 两条 wav）放系统临时目录下这里，用完即删。 */
const JOB_DIR_NAME = 'overtone-stems'
/** 导出目录的默认名字，建在用户的下载目录（或音乐目录）下面。 */
const EXPORT_DIR_NAME = '泛音分离'

interface Job {
  workDir: string
  inputPath: string
  createdAt: number
  controller: AbortController
}

const modelDirs = (): string[] => [path.join(app.getPath('userData'), MODELS_DIR_NAME)]

/**
 * 导出目录。
 *
 * 优先用应用自己的下载目录设置 —— 那里是用户已经告诉过我们「我的音乐放哪」的地方，
 * 再问一遍是多余的。没设置过就落到系统音乐目录。
 */
const exportDir = (): string => {
  const savePath = global.lx.appSetting['download.savePath']
  const root = typeof savePath === 'string' && savePath.trim() ? savePath : app.getPath('music')
  return path.join(root, EXPORT_DIR_NAME)
}

/**
 * 文件名里不能出现的字符。
 *
 * 控制字符这一段是**本意**而不是手误（no-control-regex 针对的是后者），
 * 所以在这里就地关掉那条规则。
 */
// eslint-disable-next-line no-control-regex
const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g

/**
 * 清理歌名，让它能当文件名。
 *
 * 歌名来自各个音源，什么都可能有 —— 斜杠会让 path.join 静默换目录，点号结尾的名字在
 * 资源管理器里会被吃掉尾点。截断按字符而不是字节：一个中文字在 NTFS 上占一个字符位。
 */
const sanitizeName = (raw: unknown): string => {
  const text = String(raw ?? '').replace(ILLEGAL_FILENAME_CHARS, ' ').replace(/\s+/g, ' ').trim()
  return text.slice(0, 80).replace(/[. ]+$/, '')
}

/** 目标已存在时让路，而不是覆盖 —— 覆盖掉的是用户上一次的导出。 */
const uniquePath = async(dir: string, base: string, ext: string): Promise<string> => {
  for (let index = 1; index < 1000; index += 1) {
    const suffix = index === 1 ? '' : ` (${index})`
    const candidate = path.join(dir, `${base}${suffix}${ext}`)
    if (!(await fsp.stat(candidate).then(() => true).catch(() => false))) return candidate
  }
  return path.join(dir, `${base} ${Date.now()}${ext}`)
}

/**
 * 把临时目录里的成品搬到导出目录。
 *
 * 先试 rename：同盘时它是原子的、零拷贝。临时目录和下载目录通常不在同一个盘
 * （系统盘 vs 音乐盘），那时 rename 会以 EXDEV 失败，退回 copyFile。
 * 不做「直接让 Python 写进导出目录」这种省事方案：那样用户会先看到一个中文名下的
 * 半截文件，而且 Python 侧的路径就得处理非 ASCII 文件名。
 */
const moveOut = async(from: string, to: string): Promise<void> => {
  try {
    await fsp.rename(from, to)
  } catch {
    await fsp.copyFile(from, to)
    await fsp.rm(from, { force: true })
  }
}

export default () => {
  const store = createModelStore({
    getModelsDirs: modelDirs,
    getDownloadDir: () => modelDirs()[0],
    logger: {
      info: (...args: any[]) => log.info(...args),
      warn: (...args: any[]) => log.warn(...args),
    },
  })

  const jobs = new Map<string, Job>()

  /**
   * 下载进度发给谁。
   *
   * 进度事件来自 store 的回调，而 store 是模块级的、回调里没有发起方；
   * 所以记住最近一次发起下载的 webContents。多窗口同时下载同一个文件本来也不允许
   * （store 里有 running 闸），所以这不会串台。
   */
  let progressTarget: Electron.WebContents | null = null

  const send = (name: string, params: any) => {
    const target = progressTarget
    if (!target || target.isDestroyed()) return
    const window = BrowserWindow.fromWebContents(target)
    if (window) mainSend(window, name, params)
  }

  // 上次崩溃留下的中间产物。放在启动时清，而不是退出时清 —— 退出路径有好几条
  // （托盘退出、任务管理器、断电），只有启动是必然会发生的那个时刻。
  void fsp.rm(path.join(app.getPath('temp'), JOB_DIR_NAME), { recursive: true, force: true })
    .catch(() => { /* 清不掉就算了，它只是临时文件 */ })

  // =========================模型=========================

  mainHandle(ANALYSIS_EVENT_NAME.get_status, async() => {
    const status = store.status()
    return {
      platform: PLATFORM,
      modelsDir: status.downloadDir,
      outputDir: exportDir(),
      manual: status.manual,
      models: status.models,
      // 「能不能跑」而不是「文件在不在」：权重没有解释器就是 109MB 的摆设，这两件事
      // 在界面上长得一模一样，但只有前一个该让「开始分离」亮起来。
      ready: modelsPresent(modelDirs()).htdemucs === true,
    }
  })

  mainHandle(ANALYSIS_EVENT_NAME.download_model, async({ event, params }: any) => {
    progressTarget = event.sender
    const name = String(params?.name ?? 'htdemucs')
    log.info(`[analysis] 开始下载模型 ${name}`)
    const result = await store.download(name)
    if (!result.ok) log.warn(`[analysis] 模型 ${name} 下载失败：${result.skipped?.join(' | ')}`)
    return result
  })

  mainHandle(ANALYSIS_EVENT_NAME.cancel_download, async({ params }: any) => {
    return store.cancel(String(params?.name ?? 'htdemucs'))
  })

  mainHandle(ANALYSIS_EVENT_NAME.remove_models, async() => {
    return store.removeAll()
  })

  // =========================分离作业=========================

  mainHandle(ANALYSIS_EVENT_NAME.begin_job, async() => {
    const jobId = randomBytes(8).toString('hex')
    const workDir = path.join(app.getPath('temp'), JOB_DIR_NAME, jobId)
    await fsp.mkdir(workDir, { recursive: true })
    const inputPath = path.join(workDir, 'mix.in')
    jobs.set(jobId, { workDir, inputPath, createdAt: Date.now(), controller: new AbortController() })
    log.info(`[analysis] 作业 ${jobId} 工作目录 ${workDir}`)
    return { jobId, inputPath }
  })

  mainHandle(ANALYSIS_EVENT_NAME.abort_job, async({ params }: any) => {
    const job = jobs.get(String(params?.jobId ?? ''))
    if (!job) return false
    job.controller.abort()
    return true
  })

  mainHandle(ANALYSIS_EVENT_NAME.run_job, async({ event, params }: any) => {
    const jobId = String(params?.jobId ?? '')
    const job = jobs.get(jobId)
    if (!job) throw new Error('分离作业已失效，请重新开始')

    const total = Number(params?.total)
    if (!Number.isFinite(total) || total <= 0) throw new Error('缺少有效的采样数')

    try {
      const dirs = modelDirs()
      const pythonExe = resolveRuntime(dirs)
      const modelPath = resolveModelFile(dirs, 'htdemucs')
      // 这两条分开报，因为它们是两次独立的下载，用户能修的也是不同的那一个
      if (!modelPath) throw new Error('还没下载音源分离模型')
      if (!pythonExe) throw new Error('还没下载音源分离运行时')

      const stat = await fsp.stat(job.inputPath).catch(() => null)
      const expected = total * 2 * 4
      if (!stat?.isFile() || stat.size !== expected) {
        throw new Error(`音频数据不完整（${stat?.size ?? 0}/${expected} 字节）`)
      }

      progressTarget = event.sender
      const vocalsTmp = path.join(job.workDir, 'vocals.wav')
      const accompanimentTmp = path.join(job.workDir, 'accompaniment.wav')

      const startedAt = Date.now()
      const { stats } = await runStems({
        pythonExe,
        modelPath,
        inputPath: job.inputPath,
        vocalsPath: vocalsTmp,
        accompanimentPath: accompanimentTmp,
        total,
        signal: job.controller.signal,
        onProgress: (progress: any) => { send(ANALYSIS_EVENT_NAME.job_progress, progress) },
      })

      const dir = exportDir()
      await fsp.mkdir(dir, { recursive: true })
      const base = sanitizeName(params?.name) || `未命名-${jobId}`
      const vocalsOut = await uniquePath(dir, `${base} - 人声`, '.wav')
      const accompanimentOut = await uniquePath(dir, `${base} - 伴奏`, '.wav')
      await moveOut(vocalsTmp, vocalsOut)
      await moveOut(accompanimentTmp, accompanimentOut)

      const message = `分离完成：${stats.sec}s 音频，推理 ${stats.infer_s}s` +
        `（峰值内存 ${stats.peak_ws_mb}MB）`
      log.info(`[analysis] ${message}`)

      return { ok: true, vocals: vocalsOut, accompaniment: accompanimentOut, stats, message, elapsed: Date.now() - startedAt }
    } finally {
      jobs.delete(jobId)
      await fsp.rm(job.workDir, { recursive: true, force: true }).catch(() => { })
    }
  })
}
