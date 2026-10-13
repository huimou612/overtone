'use strict'

/*
 * 泛音 / Overtone —— AI 歌词分词的编排层
 *
 * 本文件是新代码，不是从 Folia 移植的。它把三个移植过来的模块缝在一起：
 *
 *   textClient.cjs        ← Folia 的 HTTP 客户端（OpenAI 兼容 / Gemini 两条路）
 *   segmentation.cjs      ← Folia 的提示词与响应校验（realignSegmentsToText 在这里）
 *   credentialStore.cjs   ← Folia 的 API Key 加密落盘
 *
 * 相对 Folia 的服务端实现，这里多做了两件桌面端才需要的事：
 *
 *   1. **分批**。Folia 是一次请求打 400 行（它的部署自己控模型）。桌面端用户填的
 *      可能是任何模型，一次丢几百行的失败面太大；而且没有进度可报，长歌会让界面
 *      干等。按 100 行一批 —— 依据是 upstream 注释里的实测：约 18 tokens/行，
 *      100 行 ≈ 1800 tokens，远在 8192 输出预算内。
 *
 *   2. **单批失败不牵连全局**。Folia 的 parseSegmentationResponse 是「整批结构不对
 *      就抛」。桌面端把它收窄到「本批作废，其余批次照常」：一首 200 行的歌，
 *      第二批撞上限流不该让前 100 行的成果白费。
 *
 * 本文件不碰任何 LX 全局对象（global.lx / electron），便于单独测试。
 */

const {
  runAiConnectionTest,
  runAiJsonCompletion,
  validateAiConnectionTestInput,
} = require('./textClient.cjs')
const {
  SEGMENTATION_GEMINI_GENERATION_CONFIG,
  SEGMENTATION_GEMINI_SCHEMA,
  SEGMENTATION_JSON_SCHEMA,
  SEGMENTATION_MAX_OUTPUT_TOKENS,
  SEGMENTATION_SCHEMA_NAME,
  buildSegmentationManualPrompt,
  buildSegmentationSourcePrompt,
  buildSegmentationSystemPrompt,
  parseSegmentationResponse,
  realignSegmentsToText,
} = require('./segmentation.cjs')
const {
  AI_API_KEYS_CONFIGURED_KEY,
  AI_CREDENTIAL_KEYS,
  createAiCredentialStore,
  isAiCredentialKey,
} = require('./credentialStore.cjs')

/** 每批送给模型的行数。见文件头说明。 */
const SEGMENTATION_BATCH_SIZE = 100

/** 单曲行数上限。Folia 的服务端也守 400，这里保持一致。 */
const MAX_SEGMENTATION_LINES = 400

/** 渲染层可以写、但不是密钥的设置项。 */
const WRITABLE_SETTINGS = Object.freeze([
  'AI_PROVIDER',
  'OPENAI_API_URL',
  'OPENAI_API_MODEL',
  'OPENAI_API_TEMPERATURE',
  'OPENAI_API_STREAM',
])

const describeError = (error) => (error instanceof Error ? error.message : String(error))

/**
 * 取一个 fetch 实现。
 *
 * 移植过来的 textClient 把 customFetch 作为必填参数（上游的 Electron 主进程直接传
 * 全局 fetch），但本项目不能这么假定：
 *
 *   - 主版本跑 Electron 42（Node 22），有全局 fetch
 *   - **Win7 版本跑 Electron 22（Node 16），没有全局 fetch**
 *     （CI 的 Windows_7 job 会 npm install electron@22 undici@5）
 *
 * 优先用 undici 而不是全局 fetch，是为了**顺带拿到代理支持**：LX 自己的
 * common/utils/request 模块在用户配置代理时调用 undici 的 setGlobalDispatcher，
 * 而 webpack 会把 undici 打成同一份实例，所以这里 require 出来的 fetch 会走
 * 同一个 dispatcher —— 也就是走用户配的代理。
 */
let fetchImplCache
const resolveFetch = () => {
  if (fetchImplCache) return fetchImplCache
  try {
    const undici = require('undici')
    if (typeof undici?.fetch === 'function') {
      fetchImplCache = undici.fetch
      return fetchImplCache
    }
  } catch {
    // 没有 undici 就退回全局实现
  }
  if (typeof globalThis.fetch === 'function') {
    fetchImplCache = globalThis.fetch
    return fetchImplCache
  }
  throw new Error('当前运行环境没有可用的 fetch（Win7 构建需要 undici@5，请确认依赖已安装）')
}

const chunk = (items, size) => {
  const batches = []
  for (let start = 0; start < items.length; start += size) {
    batches.push({ start, items: items.slice(start, start + size) })
  }
  return batches
}

/**
 * 手动模式的回复解析。
 *
 * 没有 API Key 的用户走这条：提示词让模型用 `/` 分隔词、一行一句地纯文本作答。
 * 解析后仍然过一遍 realignSegmentsToText —— 于是「信任边界、不信任模型返回的
 * 文本」这条原则对两条路都成立，模型顺手规范化空白也不会毁掉整首。
 */
const parseManualSegmentation = (raw, lines) => {
  const text = String(raw == null ? '' : raw).replace(/\r\n?/g, '\n').trim()
  if (!text) throw new Error('没有内容可以解析')

  const rows = text.split('\n')
  // 只容忍末尾多出一个空行（复制粘贴几乎总会带上）
  while (rows.length > lines.length && !rows[rows.length - 1].trim()) rows.pop()
  if (rows.length !== lines.length) {
    throw new Error(`行数对不上：收到 ${rows.length} 行，歌词有 ${lines.length} 行`)
  }

  const boundaries = []
  const rejections = []
  rows.forEach((row, index) => {
    const pieces = row.trim().split('/').map(piece => piece.trim()).filter(piece => piece.length)
    const realigned = pieces.length
      ? realignSegmentsToText(pieces, lines[index])
      : null
    if (realigned) {
      boundaries.push(realigned)
      return
    }
    boundaries.push(null)
    rejections.push(`第 ${index + 1} 行拼不回原文`)
  })

  if (boundaries.every(row => row == null) && boundaries.length) {
    throw new Error(`没有一行能拼回原文，先看看分隔符用的是不是 "/"。第一行：${JSON.stringify(rows[0].slice(0, 60))}`)
  }
  return { boundaries, rejections }
}

/**
 * 创建一个 AI 服务实例。
 *
 * @param {object} input
 * @param {object} input.store   electron-store 兼容实例（需有 get/set）
 * @param {object} input.safeStorage  Electron 的 safeStorage
 * @param {string} [input.platform]
 * @param {object} [input.logger] 默认 console
 * @param {Function} [input.fetchImpl]  自定义 fetch，测试或特殊网络环境用
 */
const createAiService = ({ store, safeStorage, platform, logger = console, fetchImpl }) => {
  if (!store || typeof store.get !== 'function') {
    throw new TypeError('createAiService 需要一个 electron-store 兼容实例')
  }

  const getFetch = () => (typeof fetchImpl === 'function' ? fetchImpl : resolveFetch())

  const credentials = createAiCredentialStore({
    store,
    safeStorage,
    platform,
    warn: (...args) => logger.warn(...args),
  })

  /** 传给 textClient 的只读视图：它用 store.get 取配置，密钥在这里被透明解密。 */
  const settingsView = credentials.settingsView

  /**
   * 默认提供方。
   *
   * 上游 Folia 默认 gemini（`textClient.cjs` 里 `store.get('AI_PROVIDER') || 'gemini'`，
   * 逐字移植、保持同构，不动它），但对国内用户来说 OpenAI 兼容接口才是主流
   * （中转站、DeepSeek、Kimi、本地 Ollama / One API 全走这条），所以这里选 openai。
   *
   * 关键：默认值必须**落到 store 里**，不能只在读取时兜底 —— 否则 textClient
   * 自己读不到值会又兜底成 gemini，两边看到的值就不一样了。
   */
  const DEFAULT_PROVIDER = 'openai'
  if (store.get('AI_PROVIDER') !== 'openai' && store.get('AI_PROVIDER') !== 'gemini') {
    store.set('AI_PROVIDER', DEFAULT_PROVIDER)
  }

  const getProvider = () => (store.get('AI_PROVIDER') === 'gemini' ? 'gemini' : DEFAULT_PROVIDER)

  /** 给渲染层的状态：只有「配没配」，永远没有密钥明文。 */
  const getStatus = () => {
    const configured = {}
    for (const key of AI_CREDENTIAL_KEYS) configured[key] = credentials.isConfigured(key)

    return {
      provider: getProvider(),
      encrypted: credentials.isEncrypted(),
      credentials: configured,
      settings: {
        AI_PROVIDER: getProvider(),
        OPENAI_API_URL: store.get('OPENAI_API_URL') ?? '',
        OPENAI_API_MODEL: store.get('OPENAI_API_MODEL') ?? '',
        OPENAI_API_TEMPERATURE: store.get('OPENAI_API_TEMPERATURE') ?? '',
        OPENAI_API_STREAM: store.get('OPENAI_API_STREAM') === true,
      },
      limits: {
        batchSize: SEGMENTATION_BATCH_SIZE,
        maxLines: MAX_SEGMENTATION_LINES,
      },
    }
  }

  /**
   * 写入非密钥设置。白名单之外的一律拒绝 —— 否则渲染层可以借这个入口
   * 覆写 AI_API_KEYS_CONFIGURED 之类的派生字段。
   */
  const setSetting = (key, value) => {
    if (!WRITABLE_SETTINGS.includes(key)) {
      throw new Error(`不允许写入的设置项：${String(key)}`)
    }
    if (key === 'AI_PROVIDER' && value !== 'openai' && value !== 'gemini') {
      throw new Error(`未知的 provider：${String(value)}`)
    }
    store.set(key, key === 'OPENAI_API_STREAM' ? value === true : value)
    return getStatus().settings
  }

  /** 写入密钥。空串表示清除。明文只在这一次调用里出现，之后只进 safeStorage。 */
  const setCredential = (key, value) => {
    if (!isAiCredentialKey(key)) throw new Error(`不是 AI 凭据字段：${String(key)}`)
    credentials.set(key, value)
    return getStatus().credentials
  }

  /**
   * 测试连接。用的是表单里当前这组值，而不是已保存的 —— 这样「测试通过」
   * 才真的意味着「接下来能跑通」。
   */
  const testConnection = async (input) => {
    const validated = validateAiConnectionTestInput(input)
    if (validated.error) return { ok: false, error: validated.error }

    const { provider, apiKey, apiUrl } = validated.config
    // 表单没填 key 时复用已保存的那把；但只在该 URL 与保存的一致时才给，
    // 免得用户改了 URL 后密钥被发到从未授权过的主机（判断在 credentialStore 里）
    const resolved = credentials.resolveTestApiKey(provider, apiKey, apiUrl)
    if (resolved.error) return { ok: false, error: resolved.error }
    if (!resolved.apiKey) return { ok: false, error: '请先填写 API Key' }

    try {
      // runAiConnectionTest 内部会再校验一次，并且失败时返回 ok:false 而不是抛
      const result = await runAiConnectionTest(
        { ...input, apiKey: resolved.apiKey },
        { customFetch: getFetch() },
      )
      if (!result.ok) return { ok: false, error: result.error, errorKind: result.errorKind, status: result.status }
      return {
        ok: true,
        // 注意上游把回复放在 result.text，不是 reply
        text: result.text ?? '',
        model: result.model ?? '',
        status: result.status,
        durationMs: result.durationMs,
        // 模型思考把预算烧光时会 ok 但无内容，要如实告诉用户
        emptyReason: result.emptyReason,
      }
    } catch (error) {
      return { ok: false, error: describeError(error), errorKind: 'unexpected' }
    }
  }

  /**
   * 对歌词行做分词。
   *
   * @param {string[]} lines 纯歌词文本（不含时间标签）
   * @param {(progress: object) => void} [onProgress]
   * @returns {Promise<{boundaries: Array<string[]|null>, rejections: string[], stats: object}>}
   */
  const segmentLines = async (lines, onProgress) => {
    if (!Array.isArray(lines) || !lines.length) throw new Error('没有需要处理的歌词行')
    if (lines.length > MAX_SEGMENTATION_LINES) {
      throw new Error(`歌词行数超过上限（${lines.length} > ${MAX_SEGMENTATION_LINES}）`)
    }
    const provider = getProvider()
    const credentialKey = provider === 'openai' ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY'
    if (!credentials.isConfigured(credentialKey)) {
      throw new Error(`还没有配置 ${credentialKey}，请先到设置里填写`)
    }

    const texts = lines.map(line => String(line ?? ''))
    const rows = new Array(texts.length).fill(null)
    const rejections = []
    const batches = chunk(texts, SEGMENTATION_BATCH_SIZE)

    let firstError = null
    let succeededBatches = 0

    for (let index = 0; index < batches.length; index += 1) {
      const { start, items } = batches[index]
      const label = items.length > 1 ? `第 ${start + 1}–${start + items.length} 行` : `第 ${start + 1} 行`
      onProgress?.({
        phase: 'request',
        batch: index + 1,
        batchCount: batches.length,
        processed: start,
        total: texts.length,
        provider,
      })

      let raw
      try {
        raw = await runAiJsonCompletion({
          store: settingsView,
          systemPrompt: buildSegmentationSystemPrompt(),
          sourcePrompt: buildSegmentationSourcePrompt(items),
          schema: SEGMENTATION_JSON_SCHEMA,
          schemaName: SEGMENTATION_SCHEMA_NAME,
          geminiResponseSchema: SEGMENTATION_GEMINI_SCHEMA,
          geminiGenerationConfig: SEGMENTATION_GEMINI_GENERATION_CONFIG,
          maxTokens: SEGMENTATION_MAX_OUTPUT_TOKENS,
          customFetch: getFetch(),
          // 分词是机械任务，推理只会烧预算：上游实测开着思考 9.0s、关掉 1.6s，
          // 输出字节完全相同；不加抑制的模型甚至会把预算全烧在推理上返回空答案
          disableReasoning: true,
        })
      } catch (error) {
        firstError ??= error
        const message = `${label}的请求失败：${describeError(error)}`
        rejections.push(message)
        logger.warn(`[ai] ${message}`)
        onProgress?.({ phase: 'batch-failed', batch: index + 1, batchCount: batches.length, message })
        continue
      }

      try {
        const parsed = parseSegmentationResponse(raw, items)
        parsed.boundaries.forEach((boundary, offset) => { rows[start + offset] = boundary })
        for (const rejection of parsed.rejections) rejections.push(rejection)
        succeededBatches += 1
      } catch (error) {
        firstError ??= error
        const message = `${label}的返回无法解析：${describeError(error)}`
        rejections.push(message)
        logger.warn(`[ai] ${message}`)
      }

      onProgress?.({
        phase: 'progress',
        batch: index + 1,
        batchCount: batches.length,
        processed: Math.min(start + items.length, texts.length),
        total: texts.length,
        provider,
      })
    }

    // 一批都没成，说明是配置或网络问题，把真实错误抛出去让用户看到
    if (!succeededBatches) throw firstError ?? new Error('AI 没有返回可用的结果')

    const matched = rows.filter(row => Array.isArray(row)).length
    const stats = {
      total: texts.length,
      matched,
      rejected: texts.length - matched,
      batches: batches.length,
      succeededBatches,
      provider,
    }
    logger.info(`[ai] 分词完成 ${matched}/${texts.length} 行，${succeededBatches}/${batches.length} 批成功`)
    return { boundaries: rows, rejections, stats }
  }

  /** 手动模式：把提示词原样给用户，让他贴到任意模型网页去。 */
  const getManualPrompt = (lines) => {
    if (!Array.isArray(lines) || !lines.length) throw new Error('没有需要处理的歌词行')
    if (lines.length > MAX_SEGMENTATION_LINES) {
      throw new Error(`歌词行数超过上限（${lines.length} > ${MAX_SEGMENTATION_LINES}）`)
    }
    return buildSegmentationManualPrompt(lines.map(line => String(line ?? '')))
  }

  return {
    credentials,
    getManualPrompt,
    getProvider,
    getStatus,
    parseManualSegmentation,
    segmentLines,
    setCredential,
    setSetting,
    testConnection,
  }
}

module.exports = {
  AI_API_KEYS_CONFIGURED_KEY,
  MAX_SEGMENTATION_LINES,
  SEGMENTATION_BATCH_SIZE,
  WRITABLE_SETTINGS,
  createAiService,
  parseManualSegmentation,
}
