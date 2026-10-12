'use strict'

/*
 * AI 分词编排层（service.cjs）的测试。
 *
 * 全部离线：用一个假的 fetch 顶掉网络，于是能确定性地验证那些真正容易出错的
 * 编排行为 —— 分批边界、进度回调顺序、单批失败是否牵连全局、凭据是否泄漏。
 *
 * 跑法：node build-config/test-ai-service.cjs
 */

const assert = require('node:assert/strict')
const {
  MAX_SEGMENTATION_LINES,
  SEGMENTATION_BATCH_SIZE,
  createAiService,
  parseManualSegmentation,
} = require('../src/main/modules/ai/service.cjs')

let passed = 0
let failed = 0
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed += 1; console.log(`  ok   ${name}`) })
    .catch((error) => {
      failed += 1
      console.log(`  FAIL ${name}`)
      console.log(`       ${String(error.message).split('\n')[0]}`)
    })
}

// ---------------------------------------------------------------------------
// 测试替身
// ---------------------------------------------------------------------------
const silentLogger = { info() {}, warn() {}, error() {}, log() {} }

function fakeStore(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    get: (key) => data.get(key),
    set: (key, value) => { data.set(key, value) },
    has: (key) => data.has(key),
    delete: (key) => { data.delete(key) },
    _data: data,
  }
}

/** 假 safeStorage：前缀加解密，用来验证密文不会以明文落盘。 */
const fakeSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`SEALED:${value}`, 'utf8'),
  decryptString: (buffer) => buffer.toString('utf8').replace(/^SEALED:/, ''),
}

function responseStub(status, payload) {
  const body = JSON.stringify(payload)
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => JSON.parse(body),
    text: async () => body,
    clone: () => responseStub(status, payload),
  }
}

/**
 * 假 fetch：从 user prompt 里读出编号歌词行，每行对半切成两段返回。
 * 于是分词结果必然能拼回原文，可以被 parseSegmentationResponse 接受。
 */
function makeFetch({ failBatches = [], failEveryRequest = false } = {}) {
  const calls = []
  const impl = async (url, init) => {
    const body = JSON.parse(init.body)
    const userPrompt = (body.messages || []).find(m => m.role === 'user')?.content ?? ''
    const lines = userPrompt
      .split('\n')
      .filter(line => /^\d+\.\s?/.test(line))
      .map(line => line.replace(/^\d+\.\s?/, ''))
    calls.push({ url, body, lineCount: lines.length })

    if (failEveryRequest) return responseStub(500, { error: { message: 'upstream is down' } })
    if (failBatches.includes(calls.length)) return responseStub(500, { error: { message: `batch ${calls.length} down` } })

    const rows = lines.map((text) => {
      if (!text.trim()) return [text]
      const mid = Math.ceil(text.length / 2)
      return [text.slice(0, mid), text.slice(mid)]
    })
    return responseStub(200, {
      choices: [{ message: { content: JSON.stringify({ lines: rows }) }, finish_reason: 'stop' }],
      usage: {},
      model: 'fake-model',
    })
  }
  impl.calls = calls
  return impl
}

function makeService({ fetchImpl, storeInit = {}, logger = silentLogger } = {}) {
  const store = fakeStore({
    AI_PROVIDER: 'openai',
    OPENAI_API_URL: 'https://api.example.com/v1/chat/completions',
    OPENAI_API_KEY: 'sk-test-key',
    ...storeInit,
  })
  const service = createAiService({
    store,
    safeStorage: fakeSafeStorage,
    platform: 'win32',
    logger,
    fetchImpl: fetchImpl ?? makeFetch(),
  })
  return { service, store }
}

const makeLines = (count) => Array.from({ length: count }, (_, i) => `第${i}行的歌词内容`)

// ---------------------------------------------------------------------------
async function main() {
  console.log('\n[1] 构造与设置')

  await test('没有 store 直接报错', () => {
    assert.throws(() => createAiService({ safeStorage: fakeSafeStorage }), /electron-store/)
  })

  await test('setSetting 只接受白名单字段', () => {
    const { service } = makeService()
    assert.doesNotThrow(() => service.setSetting('AI_PROVIDER', 'gemini'))
    assert.throws(() => service.setSetting('AI_API_KEYS_CONFIGURED', {}), /不允许写入/)
    assert.throws(() => service.setSetting('OPENAI_API_KEY', 'x'), /不允许写入/)
    assert.throws(() => service.setSetting('AI_PROVIDER', 'nonsense'), /未知的 provider/)
  })

  await test('setCredential 只接受 AI 凭据字段', () => {
    const { service } = makeService()
    assert.throws(() => service.setCredential('OPENAI_API_URL', 'http://x'), /不是 AI 凭据字段/)
    assert.doesNotThrow(() => service.setCredential('OPENAI_API_KEY', 'sk-new'))
  })

  await test('getStatus 不含密钥明文，只报「配没配」', () => {
    const { service } = makeService()
    const status = service.getStatus()
    const serialized = JSON.stringify(status)
    assert.equal(status.credentials.OPENAI_API_KEY, true)
    assert.equal(status.credentials.GEMINI_API_KEY, false)
    assert.equal(status.encrypted, true)
    assert.ok(!serialized.includes('sk-test-key'), '状态里泄漏了明文密钥')
    assert.equal(status.limits.batchSize, SEGMENTATION_BATCH_SIZE)
    assert.equal(status.limits.maxLines, MAX_SEGMENTATION_LINES)
  })

  await test('密钥以密文落盘，明文键被清掉', () => {
    const { service, store } = makeService()
    // 初始值来自 makeService 的明文写入，setCredential 之后应变成 _SEALED
    service.setCredential('OPENAI_API_KEY', 'sk-brand-new')
    assert.equal(store.get('OPENAI_API_KEY'), undefined, '明文键没被删除')
    assert.ok(String(store.get('OPENAI_API_KEY_SEALED')).startsWith('U0VBT'), '应该存的是 base64 密文')
    assert.equal(service.credentials.get('OPENAI_API_KEY'), 'sk-brand-new')
  })

  console.log('\n[2] 分批与进度')

  await test('250 行 -> 3 批，每条请求行数不超过批大小', async () => {
    const fetchImpl = makeFetch()
    const { service } = makeService({ fetchImpl })
    const lines = makeLines(250)
    const result = await service.segmentLines(lines)

    assert.equal(fetchImpl.calls.length, 3, '应有 3 次请求')
    assert.deepEqual(fetchImpl.calls.map(c => c.lineCount), [100, 100, 50])
    assert.equal(result.boundaries.length, 250)
    assert.equal(result.stats.total, 250)
    assert.equal(result.stats.batches, 3)
    assert.equal(result.stats.succeededBatches, 3)
  })

  await test('进度回调按序推进，最后 processed === total', async () => {
    const fetchImpl = makeFetch()
    const { service } = makeService({ fetchImpl })
    const events = []
    await service.segmentLines(makeLines(150), (progress) => events.push(progress))

    const phases = events.map(e => e.phase)
    assert.deepEqual(phases, ['request', 'progress', 'request', 'progress'])
    assert.equal(events[0].batch, 1)
    assert.equal(events[1].processed, 100)
    assert.equal(events.at(-1).processed, 150)
    assert.equal(events.at(-1).total, 150)
    assert.ok(events.every(e => e.provider === 'openai'))
  })

  await test('每一行都拿到了边界，且拼回等于原文', async () => {
    const fetchImpl = makeFetch()
    const { service } = makeService({ fetchImpl })
    const lines = makeLines(7)
    const { boundaries } = await service.segmentLines(lines)
    boundaries.forEach((boundary, index) => {
      assert.ok(Array.isArray(boundary), `第 ${index + 1} 行没有边界`)
      assert.equal(boundary.join(''), lines[index], `第 ${index + 1} 行拼不回原文`)
    })
  })

  await test('请求体带上了抑制推理的阶梯第一级', async () => {
    const fetchImpl = makeFetch()
    const { service } = makeService({ fetchImpl })
    await service.segmentLines(makeLines(3))
    const body = fetchImpl.calls[0].body
    assert.equal(body.reasoning_effort, 'none',
      '没有发送 reasoning_effort: none，模型可能把预算烧在推理上')
    // 只有 openai 本体接受 json_schema，其余兼容服务退化为 json_object
    assert.equal(body.response_format.type, 'json_object')
    const tokenField = body.max_tokens ?? body.max_completion_tokens
    assert.ok(typeof tokenField === 'number' && tokenField > 0, '没有设置输出上限')
    assert.ok(Array.isArray(body.messages) && body.messages.length === 2, '应是 system + user 两条消息')
  })

  await test('指向 OpenAI 本体时使用 json_schema 强约束', async () => {
    const fetchImpl = makeFetch()
    const { service } = makeService({ fetchImpl, storeInit: { OPENAI_API_URL: 'https://api.openai.com/v1/chat/completions' } })
    await service.segmentLines(makeLines(3))
    const body = fetchImpl.calls[0].body
    assert.equal(body.response_format.type, 'json_schema')
    assert.equal(body.response_format.json_schema.strict, true)
  })

  console.log('\n[3] 失败隔离')

  await test('单批失败不牵连其余批次', async () => {
    const fetchImpl = makeFetch({ failBatches: [2] })
    const { service } = makeService({ fetchImpl })
    const result = await service.segmentLines(makeLines(250))

    assert.equal(result.stats.succeededBatches, 2)
    assert.equal(result.stats.matched, 150, '第一批和第三批的各 100/50 行应当保住')
    assert.equal(result.stats.rejected, 100)
    assert.equal(result.rejections.length, 1)
    assert.match(result.rejections[0], /第 101–200 行/)
    // 失败的那批留 null，交给 lxlrc 构造器退回兜底切分
    assert.equal(result.boundaries[100], null)
    assert.ok(Array.isArray(result.boundaries[0]))
    assert.ok(Array.isArray(result.boundaries[249]))
  })

  await test('全部批次失败时抛出真实错误', async () => {
    const fetchImpl = makeFetch({ failEveryRequest: true })
    const { service } = makeService({ fetchImpl })
    let caught = null
    try {
      await service.segmentLines(makeLines(10))
    } catch (error) {
      caught = error
    }
    assert.ok(caught, '应当抛出错误')
    // 错误文本来自上游的 formatOpenAICompatibleError，把服务端返回的 message 带出来
    assert.match(caught.message, /upstream is down/, `实际错误：${caught.message}`)
  })

  console.log('\n[4] 输入守卫')

  await test('未配置凭据时给出可执行的提示', async () => {
    const { service } = makeService({ storeInit: { OPENAI_API_KEY: '' } })
    // 先清掉 makeService 注入的明文 key
    service.setCredential('OPENAI_API_KEY', '')
    await assert.rejects(
      () => service.segmentLines(makeLines(3)),
      /还没有配置 OPENAI_API_KEY/,
    )
  })

  await test('超过行数上限时拒绝', async () => {
    const { service } = makeService()
    await assert.rejects(
      () => service.segmentLines(makeLines(MAX_SEGMENTATION_LINES + 1)),
      /超过上限/,
    )
  })

  await test('空行数组被拒绝', async () => {
    const { service } = makeService()
    await assert.rejects(() => service.segmentLines([]), /没有需要处理的歌词行/)
  })

  await test('GEMINI 路径未配置时提示 GEMINI_API_KEY', async () => {
    const { service } = makeService({ storeInit: { AI_PROVIDER: 'gemini' } })
    await assert.rejects(
      () => service.segmentLines(makeLines(2)),
      /还没有配置 GEMINI_API_KEY/,
    )
  })

  console.log('\n[5] 手动模式')

  await test('提示词包含分隔符说明与编号歌词', () => {
    const { service } = makeService()
    const prompt = service.getManualPrompt(['把回忆拼好给你', '第二行'])
    assert.match(prompt, /separating words/)
    assert.match(prompt, /1\. 把回忆拼好给你/)
    assert.match(prompt, /2\. 第二行/)
  })

  await test('parseManualSegmentation 解析 / 分隔的纯文本', () => {
    const lines = ['把回忆拼好给你', '第二行歌词']
    const { boundaries, rejections } = parseManualSegmentation('把/回忆/拼好/给/你\n第二行/歌词', lines)
    assert.deepEqual(boundaries[0], ['把', '回忆', '拼好', '给', '你'])
    assert.deepEqual(boundaries[1], ['第二行', '歌词'])
    assert.equal(rejections.length, 0)
  })

  await test('容忍末尾多出的空行', () => {
    const lines = ['一', '二']
    const { boundaries } = parseManualSegmentation('一\n二\n\n', lines)
    assert.equal(boundaries.length, 2)
  })

  await test('行数对不上时明确报错', () => {
    assert.throws(() => parseManualSegmentation('一\n二\n三', ['一', '二']), /行数对不上/)
  })

  await test('没有一行能拼回原文时报错并提示分隔符', () => {
    assert.throws(() => parseManualSegmentation('完全/不同的/内容', ['把回忆拼好给你']), /分隔符/)
  })

  await test('某几行拼不回时只丢那几行', () => {
    const lines = ['abcdef', 'xyz']
    const { boundaries, rejections } = parseManualSegmentation('abc/def\n完全不同', lines)
    assert.deepEqual(boundaries[0], ['abc', 'def'])
    assert.equal(boundaries[1], null)
    assert.equal(rejections.length, 1)
  })

  console.log('\n[6] 连接测试')

  await test('连接成功时返回模型回复（字段名是 text）', async () => {
    const fetchImpl = async () => responseStub(200, {
      choices: [{ message: { content: 'hello there' }, finish_reason: 'stop' }],
      model: 'fake-model',
    })
    const { service } = makeService({ fetchImpl })
    const result = await service.testConnection({
      provider: 'openai', apiKey: 'sk-x', apiUrl: 'https://api.example.com/v1/chat/completions', model: '',
    })
    assert.equal(result.ok, true)
    assert.equal(result.text, 'hello there')
    assert.equal(result.model, 'fake-model')
  })

  await test('连接失败时返回 ok:false 而不是抛异常', async () => {
    const fetchImpl = async () => responseStub(401, { error: { message: 'bad key' } })
    const { service } = makeService({ fetchImpl })
    const result = await service.testConnection({
      provider: 'openai', apiKey: 'sk-bad', apiUrl: 'https://api.example.com/v1/chat/completions', model: '',
    })
    assert.equal(result.ok, false)
    assert.ok(result.error)
    assert.equal(result.errorKind, 'http')
  })

  await test('非法 provider 被挡住', async () => {
    const { service } = makeService()
    const result = await service.testConnection({ provider: 'claude', apiKey: 'x' })
    assert.equal(result.ok, false)
    assert.match(result.error, /provider/i)
  })

  await test('表单没填 key 时复用已保存的 key', async () => {
    let seenAuth = null
    const fetchImpl = async (url, init) => {
      seenAuth = init.headers?.Authorization ?? init.headers?.authorization
      return responseStub(200, { choices: [{ message: { content: 'hi' } }], model: 'm' })
    }
    const { service } = makeService({ fetchImpl })
    const result = await service.testConnection({
      provider: 'openai', apiKey: '', apiUrl: 'https://api.example.com/v1/chat/completions', model: '',
    })
    assert.equal(result.ok, true)
    assert.equal(seenAuth, 'Bearer sk-test-key')
  })

  await test('改了 URL 就不再复用已保存的 key', async () => {
    const { service } = makeService()
    const result = await service.testConnection({
      provider: 'openai', apiKey: '', apiUrl: 'https://evil.example.net/v1/chat/completions', model: '',
    })
    assert.equal(result.ok, false, '密钥被发到了未授权的主机')
  })

  console.log(`\n结果：${passed} 通过，${failed} 失败\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((error) => {
  console.error('测试自身崩了：', error)
  process.exit(1)
})
