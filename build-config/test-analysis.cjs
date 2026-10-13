'use strict'

/*
 * 音源分离内核的测试：manifest 自洽性、模型解析、超时策略、sidecar 入参校验。
 *
 * 为什么不测「分离结果好不好听」：那需要 109MB 权重和一个 36MB 的运行时，跑一次几分钟，
 * 而它该由真机验收（docs/development/04）覆盖。这里锁的是那些**错了也不报错**的地方：
 *   - 平台没有运行时构建时，权重也不该被报成「可安装」（否则用户下了 109MB 才发现跑不了）
 *   - 只有权重没有解释器时，modelsPresent 必须是 false（这是「答应了却做不到」的经典形状）
 *   - 一个叫 htdemucs.onnx 的**目录**不能被当成模型文件
 *   - manifest 里的 size/sha256 是下载唯一的正确性依据，缺一个就等于没有校验
 *
 * 跑法：node build-config/test-analysis.cjs
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const manifest = require('../src/main/modules/analysis/modelManifest.json')
const {
  downloadables, modelsPresent, resolveModelFile, resolveRuntime, PLATFORM,
} = require('../src/main/modules/analysis/modelPaths.cjs')
const { timeoutFor, runStems } = require('../src/main/modules/analysis/sidecar.cjs')

let passed = 0
let failed = 0
function test(name, fn) {
  try {
    fn()
    passed += 1
    console.log(`  ok   ${name}`)
  } catch (error) {
    failed += 1
    console.log(`  FAIL ${name}`)
    console.log(`       ${error.message.split('\n')[0]}`)
  }
}

async function testAsync(name, fn) {
  try {
    await fn()
    passed += 1
    console.log(`  ok   ${name}`)
  } catch (error) {
    failed += 1
    console.log(`  FAIL ${name}`)
    console.log(`       ${error.message.split('\n')[0]}`)
  }
}

const HEX64 = /^[0-9a-f]{64}$/

// ---------------------------------------------------------------------------
console.log('\n[1] modelManifest 自洽性')

test('每个模型都有 name 与 enables', () => {
  for (const model of manifest.models) {
    assert.ok(model.name, 'missing name')
    assert.ok(model.enables, `${model.name}: missing enables`)
  }
})

test('下载项都有 bytes>0 与 64 位 sha256（这是唯一的正确性依据）', () => {
  for (const model of manifest.models) {
    if (model.platforms) {
      for (const [platform, variant] of Object.entries(model.platforms)) {
        assert.ok(variant.file, `${model.name}/${platform}: missing file`)
        assert.ok(variant.bytes > 0, `${model.name}/${platform}: bytes=${variant.bytes}`)
        assert.match(variant.sha256, HEX64, `${model.name}/${platform}: bad sha256`)
      }
      continue
    }
    assert.ok(model.file, `${model.name}: missing file`)
    assert.ok(model.bytes > 0, `${model.name}: bytes=${model.bytes}`)
    assert.match(model.sha256, HEX64, `${model.name}: bad sha256`)
  }
})

test('所有 sha256 互不相同（同一个哈希服务不了两个文件）', () => {
  const digests = []
  for (const model of manifest.models) {
    if (model.platforms) digests.push(...Object.values(model.platforms).map(v => v.sha256))
    else digests.push(model.sha256)
  }
  assert.equal(new Set(digests).size, digests.length)
})

test('镜像模板里都有 {file} 占位符', () => {
  assert.ok(manifest.mirrors.length > 0)
  for (const template of manifest.mirrors) {
    assert.ok(template.includes('{file}'), `no {file} in ${template}`)
    assert.doesNotThrow(() => new URL(template.replace('{file}', 'x')), `not a URL: ${template}`)
  }
})

// ---------------------------------------------------------------------------
console.log('\n[2] downloadables：平台变体与「能力互锁」')

test('win32-x64：两个下载项都可用，运行时变体已折叠进来', () => {
  const entries = downloadables(manifest, 'win32-x64')
  const runtime = entries.find(entry => entry.name === 'runtime')
  assert.equal(runtime.supported, true)
  assert.equal(runtime.platforms, undefined, 'platforms should be folded away')
  assert.match(runtime.file, /win32-x64/)
  assert.ok(runtime.bytes > 0)
  assert.match(runtime.sha256, HEX64)
  assert.equal(entries.find(entry => entry.name === 'htdemucs').supported, true)
})

test('没有运行时构建的平台：权重也一并不可用（enables 互锁）', () => {
  // macOS x64 上每一个能加载这个模型的 onnxruntime 都是 arm64 的，所以没有构建可做。
  // 这时**不能**只把运行时标成不支持——那会让人以为还能下 109MB 的权重来用。
  for (const platform of ['darwin-x64', 'plan9-x64', 'win32-arm64']) {
    const entries = downloadables(manifest, platform)
    const runtime = entries.find(entry => entry.name === 'runtime')
    const weights = entries.find(entry => entry.name === 'htdemucs')
    assert.equal(runtime.supported, false, `${platform}: runtime should be unsupported`)
    assert.equal(weights.supported, false, `${platform}: weights must be blocked too`)
  }
})

test('不支持的平台仍然被**返回**而不是被过滤掉', () => {
  // 界面要画一行「这台机器跑不了」，条目被丢掉就变成「功能不存在」，两者对用户完全不同
  assert.equal(downloadables(manifest, 'darwin-x64').length, manifest.models.length)
})

test('PLATFORM 是 `平台-架构` 的形状，正是 manifest 的键', () => {
  assert.match(PLATFORM, /^[a-z0-9]+-[a-z0-9]+$/)
})

// ---------------------------------------------------------------------------
console.log('\n[3] modelsPresent：只有权重不算「能跑」')

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'overtone-analysis-test-'))
const MODELS = path.join(sandbox, 'stems')
fs.mkdirSync(MODELS, { recursive: true })

test('空目录 → false', () => {
  assert.deepEqual(modelsPresent([MODELS]), { htdemucs: false })
})

test('只有权重、没有解释器 → false（分离会以「未下载」拒绝，而不是加载一张半截的图）', () => {
  fs.writeFileSync(path.join(MODELS, 'htdemucs.onnx'), 'weights')
  assert.equal(modelsPresent([MODELS]).htdemucs, false)
  assert.ok(resolveModelFile([MODELS], 'htdemucs'))
  assert.equal(resolveRuntime([MODELS]), null)
})

test('解释器缺失的 runtime 目录不算已安装', () => {
  fs.mkdirSync(path.join(MODELS, 'runtime'), { recursive: true })
  assert.equal(modelsPresent([MODELS]).htdemucs, false)
})

test('权重 + 解释器 → true', () => {
  fs.writeFileSync(path.join(MODELS, 'runtime', process.platform === 'win32' ? 'python.exe' : 'python3'),
    Buffer.alloc(0))
  assert.equal(modelsPresent([MODELS]).htdemucs, true)
  assert.ok(resolveRuntime([MODELS]))
})

test('一个叫 htdemucs.onnx 的目录不被当成模型文件', () => {
  const decoy = path.join(sandbox, 'decoy')
  fs.mkdirSync(path.join(decoy, 'htdemucs.onnx'), { recursive: true })
  assert.equal(resolveModelFile([decoy], 'htdemucs'), null)
})

test('目录按顺序优先，先命中的那个赢', () => {
  const first = path.join(sandbox, 'first')
  const second = path.join(sandbox, 'second')
  for (const dir of [first, second]) {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'htdemucs.onnx'), dir)
  }
  assert.equal(resolveModelFile([first, second], 'htdemucs'), path.join(first, 'htdemucs.onnx'))
})

fs.rmSync(sandbox, { recursive: true, force: true })

// ---------------------------------------------------------------------------
console.log('\n[4] sidecar 超时策略')

test('随音频长度增长，且对上游用到的最长窗口仍然不低于它原来的 120s', () => {
  const tiny = timeoutFor(44100 * 2)
  const window40 = timeoutFor(44100 * 40)
  const song = timeoutFor(44100 * 240)
  const long = timeoutFor(44100 * 900)

  assert.ok(tiny >= 60000, `2s 的片段只给了 ${tiny}ms`)
  // 上游最长的窗口是 40 秒，那边给的是 120s；我们换成整曲之后没有理由比它更紧
  assert.ok(window40 >= 120000, `40s 的窗口只给了 ${window40}ms`)
  assert.ok(song > window40 && long > song, '没有随长度增长')
})

test('四分钟的歌留出的是「分钟」级，不是「秒」级', () => {
  // 实测推理约 0.6 倍实时（本机 4 线程），四分钟的歌要两分半左右；
  // 超时是「进程已经不动了」这条线，不是性能目标，所以必须留够
  assert.ok(timeoutFor(44100 * 240) > 900000)
})

// ---------------------------------------------------------------------------
console.log('\n[5] runStems 入参校验（不真的起进程）')

async function asyncTests() {
  await testAsync('没有运行时 → 明确拒绝', async () => {
    await assert.rejects(
      () => runStems({ pythonExe: '', total: 1000, inputPath: 'x', vocalsPath: 'y', accompanimentPath: 'z', modelPath: 'm' }),
      /no python runtime installed/,
    )
  })

  await testAsync('采样数非法 → 明确拒绝', async () => {
    for (const total of [0, -1, NaN, undefined]) {
      await assert.rejects(
        () => runStems({ pythonExe: 'python', total, inputPath: 'x', vocalsPath: 'y', accompanimentPath: 'z', modelPath: 'm' }),
        /bad sample count/,
      )
    }
  })

  await testAsync('解释器不存在 → 以 spawn 错误拒绝，而不是静默挂住', async () => {
    await assert.rejects(() => runStems({
      pythonExe: path.join(sandbox, 'nope', 'python.exe'),
      total: 44100,
      inputPath: 'x',
      vocalsPath: 'y',
      accompanimentPath: 'z',
      modelPath: 'm',
    }))
  })

  await testAsync('runner 脚本路径已经过 asar 改写（打包后要指向 unpacked 目录）', async () => {
    const { RUNNER_SCRIPT } = require('../src/main/modules/analysis/sidecar.cjs')
    assert.ok(RUNNER_SCRIPT.endsWith('stems_runner.py'))
    assert.ok(!/app\.asar[\\/]/.test(RUNNER_SCRIPT), 'asar 路径没有被改写')
  })
}

// ---------------------------------------------------------------------------
asyncTests().then(() => {
  console.log(`\n结果：${passed} 通过，${failed} 失败\n`)
  process.exit(failed ? 1 : 0)
}).catch((error) => {
  console.error(error)
  process.exit(1)
})
