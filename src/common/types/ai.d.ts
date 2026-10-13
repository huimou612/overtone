declare namespace LX {
  /**
   * AI 歌词分词（泛音 / Overtone 新增能力，来源见 src/main/modules/ai/）。
   *
   * 命名空间里的结构与主进程 src/main/modules/ai/ 的对外返回严格对应，
   * 改动任何一侧都要同步另一侧。
   */
  namespace Ai {
    /** 目前支持的两条协议路线：OpenAI 兼容 与 Gemini。 */
    type Provider = 'openai' | 'gemini'

    /** 会被加密落盘的字段。渲染层永远只能读到「配没配」，读不到明文。 */
    type CredentialKey = 'OPENAI_API_KEY' | 'GEMINI_API_KEY'

    /** 非密钥设置项。写这些走 set_setting，写密钥走 set_credential。 */
    type WritableSettingKey =
      | 'AI_PROVIDER'
      | 'OPENAI_API_URL'
      | 'OPENAI_API_MODEL'
      | 'OPENAI_API_TEMPERATURE'
      | 'OPENAI_API_STREAM'

    interface Settings {
      AI_PROVIDER: Provider
      OPENAI_API_URL: string
      OPENAI_API_MODEL: string
      /** 允许空串：空表示用模型默认温度。 */
      OPENAI_API_TEMPERATURE: string | number
      OPENAI_API_STREAM: boolean
    }

    interface Status {
      provider: Provider
      /** 凭据是否由 safeStorage 加密（部分 Linux 桌面环境拿不到后端，会是 false）。 */
      encrypted: boolean
      credentials: Record<CredentialKey, boolean>
      settings: Settings
      limits: {
        batchSize: number
        maxLines: number
      }
    }

    /** 一行歌词。startTime 是行首毫秒时间，text 是不含时间标签的纯文本。 */
    interface LyricLine {
      startTime: number
      text: string
    }

    interface LyricLinesResult {
      lines: LyricLine[]
      /** 歌词来自哪一层：lxlrc（已逐字）/ lrc（普通行歌词）/ none（没有歌词）。 */
      source: 'lxlrc' | 'lrc' | 'none'
      /**
       * 源歌词本身已经是逐字歌词。为 true 时，理论上可以沿用它的真实词级时间，
       * 而不是按字数权重估算（当前 buildLxlrc 还没走这条分支）。
       */
      hasWordByWord: boolean
      maxLines: number
    }

    interface TestConnectionInput {
      provider: Provider
      /** 表单里刚填的明文 key；留空则复用已保存的那把。 */
      apiKey?: string
      apiUrl?: string
      model?: string
    }

    interface TestConnectionResult {
      ok: boolean
      error?: string
      errorKind?: string
      status?: number
      /** 模型回显的文本。注意主进程侧字段名是 text 而不是 reply。 */
      text?: string
      model?: string
      durationMs?: number
      /** 模型把预算全烧在思考上、ok 但没有内容时的原因说明。 */
      emptyReason?: string
    }

    interface SegmentProgress {
      phase: 'request' | 'progress' | 'batch-failed'
      batch: number
      batchCount: number
      processed?: number
      total?: number
      provider?: Provider
      message?: string
    }

    interface SegmentStats {
      total: number
      matched: number
      rejected: number
      batches: number
      succeededBatches: number
      provider: Provider
    }

    interface SegmentResult {
      /**
       * 与传入的 lines 等长。每一项是该行切出来的词（按顺序拼接必须**逐字等于**
       * 原行文本，否则视为无效）。模型没给出有效结果的行是 null —— 交由构建
       * 阶段用字数权重兜底。
       */
      boundaries: Array<string[] | null>
      rejections: string[]
      stats: SegmentStats
    }

    interface ManualPrompt {
      /** 直接展示给用户复制走的提示词全文。 */
      prompt: string
      delimiter: string
    }

    interface ManualParseResult {
      boundaries: Array<string[] | null>
      rejections: string[]
    }

    interface ApplyLxlrcInput {
      musicId: string
      lines: LyricLine[]
      boundaries?: Array<string[] | null> | null
      options?: Partial<BuildOptions>
    }

    interface BuildOptions {
      /** 相邻两行的间距取不到时，按这个毫秒数兜底。 */
      fallbackSpanMs: number
      /** 单行最长按多少毫秒算，防止间奏后一行霸占整段。 */
      maxLineSpanMs: number
      /** 单个字/词的最小显示毫秒，保证不被压成 0。 */
      minSegmentMs: number
    }

    interface BuildStats {
      lines: number
      fromAi: number
      fromFallback: number
      empty: number
      totalSegments: number
      /** 原文里出现了形如 <123,456> 的子串，无法安全编码的行数。 */
      textWithFakeTag: number
    }

    interface ApplyLxlrcResult {
      ok: boolean
      stats: BuildStats
      /** 走了字数权重兜底的行号（从 0 开始）。 */
      usedFallback: number[]
      message: string
      /** 生成的逐字歌词全文，渲染层拿它直接刷新播放器。 */
      lxlrc: string
    }
  }
}
