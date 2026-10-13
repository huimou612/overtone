declare namespace LX {
  /**
   * 音源分离（泛音 / Overtone 新增能力，实现见 src/main/modules/analysis/）。
   *
   * 命名空间里的结构与主进程该模块的对外返回严格对应，
   * 改动任何一侧都要同步另一侧。
   */
  namespace Analysis {
    /** 目前只有一个模型：htdemucs。运行时是另一个下载项，但共用同一个名字空间。 */
    type ModelName = 'htdemucs' | 'runtime'

    interface ModelEntry {
      name: ModelName
      /** 下载文件名；运行时是按平台选的变体，所以这里可能是 null（平台不支持时）。 */
      file: string | null
      bytes: number
      /** 这个下载项解锁的能力，目前只有 'stems'。 */
      enables: string
      license: string
      /** 本机能不能装。false 只出现在没有运行时构建的平台上（如 macOS x64）。 */
      supported: boolean
      /** 已安装的绝对路径；没装或平台不支持时为 null。 */
      path: string | null
      downloading: boolean
    }

    interface Status {
      /** 形如 `win32-x64`，运行时变体就是按它选的。 */
      platform: string
      /** 模型落在哪个目录。 */
      modelsDir: string
      /** 分离结果会导出到这里。 */
      outputDir: string
      /** 所有镜像都失败时才展示的网盘链接。 */
      manual: {
        links: Array<{ label: string, url: string, code?: string }>
        note?: string
      }
      models: ModelEntry[]
      /**
       * 能不能真的跑分离。
       *
       * 注意这不等同于「权重文件在不在」：权重（109MB）和跑它的 Python 运行时（36MB）
       * 是两次独立下载，只有两个都在才为 true。界面该按它决定「开始分离」亮不亮。
       */
      ready: boolean
    }

    interface DownloadProgress {
      name: ModelName
      status: 'downloading' | 'ready' | 'failed'
      received: number
      total: number
      /** 当前在从哪个镜像取；还没开始时为 null。 */
      host: string | null
    }

    interface DownloadResult {
      ok: boolean
      /** 每个镜像失败的原因，按尝试顺序。ok 为 true 时是成功之前被放弃的那些。 */
      skipped?: string[]
      path?: string
    }

    interface JobProgress {
      /** 0..1 */
      progress: number
      chunk: number
      chunks: number
    }

    /** htdemucs 自己报的资源占用，用来判断这台机器吃不吃得下整曲分离。 */
    interface RunnerStats {
      total: number
      /** 音频时长（秒）。 */
      sec: number
      segment: number
      segments: number
      load_s: number
      infer_s: number
      peak_ws_mb: number
      peak_commit_mb: number
      /** 为避免削波施加的统一增益，<= 1。两条产物共用，保证还能混在一起。 */
      gain: number
      peak_sample: number
      cpus: number
      fast_cores: number
    }

    interface JobResult {
      ok: boolean
      /** 人声轨的绝对路径。 */
      vocals: string
      /** 伴奏轨的绝对路径。 */
      accompaniment: string
      stats: RunnerStats
      message: string
      elapsed: number
    }
  }
}
