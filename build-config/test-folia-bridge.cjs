'use strict'

/*
 * Folia 数据桥（路线 B 阶段二收尾）定点修复的单元测试。
 *
 * 覆盖两个修复：
 *   D2-1  slice/folia-viewer/src/lyricIndex.ts —— Folia **秒级**时间轴的行索引查找
 *         （修复前误把秒值 *1000 传给泛音 ms 域的 findActiveLineIndex，索引恒为最后一行）
 *   D2-2  src/common/foliaProtocol.ts —— 字段白名单：buildFoliaPayload / pickFoliaFields
 *         （修复前 player_status 增量整份透传，collect/lyricLineText 等无关字段混入消息与缓存）
 *
 * 被测模块均为零运行时依赖的纯函数，沿用 test-immersive-lyric.cjs 的加载方式：
 * module.stripTypeScriptTypes + data: URL ESM import，不引入构建工具。
 *
 * 跑法：node build-config/test-folia-bridge.cjs（已接入 npm test 的 test:folia）
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { stripTypeScriptTypes } = require('node:module')

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

const srcPath = rel => path.join(__dirname, '..', rel)
const loadTs = async rel => {
  const js = stripTypeScriptTypes(fs.readFileSync(srcPath(rel), 'utf8'), { mode: 'strip' })
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}

async function main() {
  const { findActiveLineIndexSeconds } = await loadTs('slice/folia-viewer/src/lyricIndex.ts')
  const adapter = await loadTs('slice/folia-viewer/src/latticeAdapter.ts')
  const { buildFoliaLines, buildTile, FOLIA_THEME, strHash, buildLyricFingerprint } = adapter
  const protocol = await loadTs('src/common/foliaProtocol.ts')
  const tl = await loadTs('src/renderer/core/immersiveLyric/timeline.ts')
  const { buildFoliaPayload, pickFoliaFields, SNAPSHOT_FIELDS, FIELD_ALIAS, isValidFoliaMessage, FOLIA_PROTOCOL_VERSION } = protocol
  const { buildLyricTimeline, findActiveLineIndex } = tl

  // ── D2-1：秒域行索引 ──────────────────────────────────────────
  // 用真实解析路径造时间轴：lrc 行 [00:10] [00:20] [00:30]，ms→秒转换与 main.tsx 一致
  const timeline = buildLyricTimeline({ lrc: '[00:10.00]第一行\n[00:20.00]第二行\n[00:30.00]第三行' })
  const lines = timeline.lines.map(l => ({ startTime: l.time / 1000 })) // 秒（同 main.tsx 转换）
  assert.equal(lines.length, 3)
  assert.deepEqual(lines.map(l => l.startTime), [10, 20, 30])

  test('D2-1 空歌词 → -1', () => {
    assert.equal(findActiveLineIndexSeconds([], 0), -1)
    assert.equal(findActiveLineIndexSeconds([], 123), -1)
  })

  test('D2-1 播放时间为 0：首行在 0s 时命中第一行', () => {
    const zero = [{ startTime: 0 }, { startTime: 5 }]
    assert.equal(findActiveLineIndexSeconds(zero, 0), 0)
  })

  test('D2-1 播放时间为 0：首行未到（前奏）→ -1', () => {
    assert.equal(findActiveLineIndexSeconds(lines, 0), -1)
  })

  test('D2-1 第一行之前 → -1', () => {
    assert.equal(findActiveLineIndexSeconds(lines, 9.999), -1)
  })

  test('D2-1 第一行：行起点即命中（含整数/小数秒）', () => {
    assert.equal(findActiveLineIndexSeconds(lines, 10), 0)
    assert.equal(findActiveLineIndexSeconds(lines, 10.5), 0)
    assert.equal(findActiveLineIndexSeconds(lines, 19.9), 0)
  })

  test('D2-1 中间行：行起点即命中', () => {
    assert.equal(findActiveLineIndexSeconds(lines, 20), 1)
    assert.equal(findActiveLineIndexSeconds(lines, 25), 1)
  })

  test('D2-1 最后一行：行起点即命中', () => {
    assert.equal(findActiveLineIndexSeconds(lines, 30), 2)
  })

  test('D2-1 超出末尾：停在最后一行（与泛音语义一致）', () => {
    assert.equal(findActiveLineIndexSeconds(lines, 300), 2)
    assert.equal(findActiveLineIndexSeconds(lines, 9999), 2)
  })

  test('D2-1 与泛音 ms 域 findActiveLineIndex 语义逐点一致', () => {
    // 同一份歌词：泛音侧用 ms 时间轴 + ms 时刻；Folia 侧用秒时间轴 + 秒时刻。
    // 两侧结果必须逐点相同（这是 D2-1 的核心断言：只换单位，不改语义）。
    const msLines = timeline.lines // ImmersiveLyricLine（ms）
    for (const sec of [0, 5, 9.999, 10, 15, 19.999, 20, 29.999, 30, 45, 120]) {
      assert.equal(
        findActiveLineIndexSeconds(lines, sec),
        findActiveLineIndex(msLines, sec * 1000),
        `t=${sec}s 两侧索引不一致`,
      )
    }
  })

  // ── D2-2：字段白名单 ──────────────────────────────────────────
  const PROTOCOL_KEYS = ['status', 'name', 'singer', 'album', 'pic', 'progress', 'duration', 'playbackRate', 'lyric', 'tlyric', 'lxlyric']

  test('D2-2 快照：白名单取字段 + 别名映射 + 缺省归一为空串', () => {
    const payload = buildFoliaPayload({
      status: 'playing', name: '歌名', singer: '歌手', albumName: '专辑', picUrl: 'http://p',
      progress: 12.5, duration: 200, playbackRate: 1.25,
      lyric: '[00:01]x', tlyric: null, lxlyric: undefined,
      // 无关字段必须不出现：
      collect: true, rlyric: 'rr', lyricLineText: 'line', lyricLineAllText: 'all',
    })
    assert.deepEqual(Object.keys(payload).sort(), [...PROTOCOL_KEYS].sort())
    assert.equal(payload.album, '专辑')
    assert.equal(payload.pic, 'http://p')
    assert.equal(payload.tlyric, '')
    assert.equal(payload.lxlyric, '')
    assert.equal(payload.progress, 12.5)
    assert.equal(payload.playbackRate, 1.25)
  })

  test('D2-2 增量：无关字段（collect/rlyric/lyricLineText/lyricLineAllText）被丢弃', () => {
    const patch = pickFoliaFields({ collect: true, rlyric: 'rr', lyricLineText: 'line', lyricLineAllText: 'all' })
    assert.deepEqual(patch, {})
  })

  test('D2-2 增量：必要字段保留且做别名映射，数值型不被字符串化', () => {
    const patch = pickFoliaFields({
      progress: 33.5, duration: 200, name: '新歌', albumName: '新专辑', picUrl: '', status: 'paused',
      lyricLineText: 'noise', collect: false, // 噪声
    })
    assert.deepEqual(patch, {
      progress: 33.5, duration: 200, name: '新歌', album: '新专辑', pic: '', status: 'paused',
    })
  })

  test('D2-2 增量：null/undefined 归一为空串（与快照语义一致）', () => {
    const patch = pickFoliaFields({ picUrl: null, name: undefined })
    assert.deepEqual(patch, { pic: '', name: '' })
  })

  test('D2-2 窗口关闭期间缓存可用于重开后的最新快照（index.ts 的纯逻辑复现）', () => {
    // 复现 folia/index.ts 的三步：建缓存 → 关窗期间的增量合入 → 重开窗口回快照
    let cache = null // latestPayload
    // 首个事件（窗口未开也要建缓存）
    if (!cache) cache = buildFoliaPayload({ status: 'playing', name: 'A', singer: 's', progress: 0, duration: 100 })
    // 关窗期间到达的 player_status 增量（含无关字段）：
    const patch1 = pickFoliaFields({ progress: 40, lyricLineText: 'noise1' })
    Object.assign(cache, patch1)
    const patch2 = pickFoliaFields({ name: 'B', albumName: 'AB', status: 'paused', collect: true })
    Object.assign(cache, patch2)
    // 重开窗口：快照 = 缓存 + v/seq
    const snapshot = { v: 1, seq: 3, ...cache }
    assert.equal(snapshot.name, 'B')
    assert.equal(snapshot.album, 'AB')
    assert.equal(snapshot.progress, 40)
    assert.equal(snapshot.status, 'paused')
    // 快照里没有任何白名单外字段
    assert.deepEqual(Object.keys(snapshot).filter(k => !['v', 'seq'].includes(k)).sort(), [...PROTOCOL_KEYS].sort())
  })

  test('D2-2 下行 update 消息只含协议字段（index.ts 的纯逻辑复现）', () => {
    const params = { progress: 1, collect: true, lyricLineText: 'x', lyricLineAllText: 'y', rlyric: 'z' }
    const patch = pickFoliaFields(params)
    const update = { v: 1, seq: 7, ...patch }
    assert.deepEqual(Object.keys(update).filter(k => !['v', 'seq'].includes(k)), ['progress'])
  })

  test('D2-2 白名单常量与别名映射 sanity（协议文档即代码）', () => {
    assert.equal(SNAPSHOT_FIELDS.length, PROTOCOL_KEYS.length)
    assert.deepEqual(FIELD_ALIAS, { albumName: 'album', picUrl: 'pic' })
  })

  // ── D2-3：下行消息校验（校验位置与真实形状一致）─────────────────
  test('D2-3 合法快照/增量消息通过校验', () => {
    assert.equal(isValidFoliaMessage({ type: 'snapshot', data: { v: FOLIA_PROTOCOL_VERSION, seq: 1, name: 'x' } }), true)
    assert.equal(isValidFoliaMessage({ type: 'update', data: { v: FOLIA_PROTOCOL_VERSION, seq: 2, progress: 3.5 } }), true)
  })

  test('D2-3 协议版本不符（含缺失/非当前版本）被拒', () => {
    assert.equal(isValidFoliaMessage({ type: 'snapshot', data: { v: 99, seq: 1 } }), false)
    assert.equal(isValidFoliaMessage({ type: 'snapshot', data: { seq: 1 } }), false)
    assert.equal(isValidFoliaMessage({ type: 'snapshot', data: { v: '1', seq: 1 } }), false)
  })

  test('D2-3 序号缺失/非有限数值被拒', () => {
    assert.equal(isValidFoliaMessage({ type: 'update', data: { v: 1 } }), false)
    assert.equal(isValidFoliaMessage({ type: 'update', data: { v: 1, seq: '2' } }), false)
    assert.equal(isValidFoliaMessage({ type: 'update', data: { v: 1, seq: Number.NaN } }), false)
    assert.equal(isValidFoliaMessage({ type: 'update', data: { v: 1, seq: Number.POSITIVE_INFINITY } }), false)
  })

  test('D2-3 非法类型/空值/反形状被拒（顶层 v/seq 不再放行）', () => {
    assert.equal(isValidFoliaMessage(null), false)
    assert.equal(isValidFoliaMessage('snapshot'), false)
    assert.equal(isValidFoliaMessage({ type: 'other', data: { v: 1, seq: 1 } }), false)
    assert.equal(isValidFoliaMessage({ type: 'snapshot', data: null }), false)
    // D2-3 修复前的反例：v/seq 在顶层而 data 内层没有 —— 必须拒绝
    assert.equal(isValidFoliaMessage({ type: 'snapshot', v: 1, seq: 1, data: { name: 'x' } }), false)
    // 完全没有任何 v/seq 的裸消息
    assert.equal(isValidFoliaMessage({ type: 'snapshot', data: {} }), false)
  })

  test('D2-3 页面去重逻辑：快照不回滚、重复与晚到被丢弃（main.tsx 纯逻辑复现）', () => {
    let lastSeq = -1
    const pageAccept = (msg) => {
      const seq = msg.data.seq
      if (seq <= lastSeq) return false
      lastSeq = seq
      return true
    }
    assert.equal(pageAccept({ type: 'snapshot', data: { seq: 1 } }), true)   // 初始快照
    assert.equal(pageAccept({ type: 'snapshot', data: { seq: 1 } }), false)  // 重复
    assert.equal(pageAccept({ type: 'update', data: { seq: 5 } }), true)     // 正常推进
    assert.equal(pageAccept({ type: 'update', data: { seq: 3 } }), false)    // 晚到
    assert.equal(pageAccept({ type: 'snapshot', data: { seq: 9 } }), true)   // 重开快照
  })

  // ── 第三阶段：Lattice 视觉模式适配层 ──────────────────────────
  test('S3 逐字歌词：ms→秒转换 + 词级绝对时间 + endTime=末词终点', () => {
    const tl = buildLyricTimeline({ lrc: '[00:10.00]你好', lxlrc: '[00:10.00]<0,500>你<500,500>好' })
    assert.equal(tl.lines.length, 1)
    const [line] = buildFoliaLines(tl)
    assert.equal(line.startTime, 10)
    assert.equal(line.words.length, 2)
    assert.deepEqual(line.words[0], { text: '你', startTime: 10, endTime: 10.5 })
    assert.deepEqual(line.words[1], { text: '好', startTime: 10.5, endTime: 11 })
    assert.equal(line.endTime, 11)
    assert.equal(line.fullText, '你好')
  })

  test('S3 整句歌词：words 空、endTime=行起点+4s 兜底（不伪造逐字）', () => {
    const tl = buildLyricTimeline({ lrc: '[00:30.50]只有整句' })
    const [line] = buildFoliaLines(tl)
    assert.equal(line.startTime, 30.5)
    assert.deepEqual(line.words, [])
    assert.equal(line.endTime, 34.5)
    assert.equal(line.fullText, '只有整句')
  })

  test('S3 翻译：tlrc 配对进 translation，缺失为 undefined', () => {
    const withT = buildFoliaLines(buildLyricTimeline({ lrc: '[00:05.00]hello', tlrc: '[00:05.00]你好' }))
    assert.equal(withT[0].translation, '你好')
    const withoutT = buildFoliaLines(buildLyricTimeline({ lrc: '[00:05.00]hello' }))
    assert.equal(withoutT[0].translation, undefined)
  })

  test('S3 空时间轴 → 空数组（页面由 hasLyric 走暂无歌词降级）', () => {
    assert.deepEqual(buildFoliaLines(buildLyricTimeline({ lrc: null })), [])
  })

  test('S3 buildTile：标识、展示名兜底', () => {
    assert.deepEqual(buildTile('歌名', '歌手'), { id: '歌名|歌手', queueIndex: 0, title: '歌名', artist: '歌手' })
    assert.equal(buildTile('', '').title, 'Folia Lattice')
    assert.equal(buildTile('', '').artist, 'Overtone')
  })

  test('S3 FOLIA_THEME：Theme 必填字段齐备且值合法', () => {
    for (const k of ['name', 'backgroundColor', 'primaryColor', 'accentColor', 'secondaryColor']) {
      assert.equal(typeof FOLIA_THEME[k], 'string')
      assert.ok(FOLIA_THEME[k].length > 0, `theme.${k} 为空`)
    }
    assert.ok(['sans', 'serif', 'mono'].includes(FOLIA_THEME.fontStyle))
    assert.ok(['calm', 'normal', 'chaotic'].includes(FOLIA_THEME.animationIntensity))
  })

  // ── 阶段四：歌词代次指纹收紧（name|singer|内容哈希）──────────────
  const FP_INPUT = { lyric: 'abcdef', lxlyric: '<0,100>abc', tlyric: '译' }

  test('S4 同名、不同 singer → 指纹不同（D2 复审发现①的修复）', () => {
    const a = buildLyricFingerprint({ ...FP_INPUT, name: '同一首歌', singer: '歌手A' })
    const b = buildLyricFingerprint({ ...FP_INPUT, name: '同一首歌', singer: '歌手B' })
    assert.notEqual(a, b)
  })

  test('S4 同名同 singer、长度相同但内容不同 → 指纹不同（哈希消除长度碰撞）', () => {
    const a = buildLyricFingerprint({ name: '歌', singer: 's', lyric: 'aaaa', lxlyric: '', tlyric: '' })
    const b = buildLyricFingerprint({ name: '歌', singer: 's', lyric: 'aaab', lxlyric: '', tlyric: '' })
    assert.equal(a.split('|')[2], strHash('aaaa'))
    assert.notEqual(a, b, '同长度不同内容碰撞了')
  })

  test('S4 同一首歌信息一致 → 指纹稳定', () => {
    const s = { name: '歌', singer: 's', ...FP_INPUT }
    assert.equal(buildLyricFingerprint(s), buildLyricFingerprint(s))
  })

  test('S4 singer/歌词缺失或空：计算稳定、与空串等价、不崩溃', () => {
    assert.equal(buildLyricFingerprint({ name: '歌', singer: undefined }), buildLyricFingerprint({ name: '歌', singer: '' }))
    assert.equal(buildLyricFingerprint({ name: '歌' }), buildLyricFingerprint({ name: '歌', singer: '', lyric: '', tlyric: '', lxlyric: '' }))
    assert.equal(typeof buildLyricFingerprint({}), 'string')
  })

  test('S4 歌词内容变化（长度恰好相同）→ 新代次触发重解析（main.tsx effect 纯逻辑复现）', () => {
    let lastFingerprint = ''
    let lines = null
    const apply = (state) => {
      const fp = buildLyricFingerprint(state)
      if (fp === lastFingerprint) return
      lastFingerprint = fp
      lines = state.lyric && state.lyric.length ? `parsed:${strHash(state.lyric)}` : []
    }
    apply({ name: '歌', singer: 's', lyric: 'aaaa' })
    const old = lines
    apply({ name: '歌', singer: 's', lyric: 'aaab' }) // 同长度不同内容：旧设计会跳过
    assert.notEqual(lines, old, '内容变了却没重解析')
    // 切到无歌词歌 → 清空
    apply({ name: '纯音乐', singer: 's', lyric: '', lxlyric: '' })
    assert.deepEqual(lines, [])
  })

  test('S4 strHash 基本性质：稳定、区分、空串稳定', () => {
    assert.equal(strHash('abc'), strHash('abc'))
    assert.notEqual(strHash('abc'), strHash('abd'))
    assert.equal(strHash(''), strHash('')) // 空串稳定（djb2 初始值 5381 的 base36）
    assert.match(strHash(''), /^[0-9a-z]+$/)
  })

  console.log(`\nfolia-bridge: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch(err => {
  console.error('fatal:', err)
  process.exit(1)
})
