'use strict'

/*
 * 沉浸式歌词「时间轴解析 + 定位 + 填充」的单元测试（第六阶段补测）。
 *
 * 覆盖 src/renderer/core/immersiveLyric/ 下的两个**纯函数**模块：
 *   - timeline.ts：buildLyricTimeline / findActiveLineIndex / getWordState
 *   - fill.ts：getWordFill / getLineFill
 *
 * 这两块此前只有 CDP 端到端脚本覆盖（见 .git/verify-immersive-*.js），没有独立单测；
 * 它们又恰恰是「错了也不报错」的重灾区：时间戳解析、offset 叠加、逐字/整句降级、
 * 填充比例边界（0/1/零时长/负时长）。这里用真实输入把当前设计**钉死**。
 *
 * ⚠️ 测的是**现有语义**，不是「我觉得应该怎样」。若发现语义本身可疑，只在注释里标注、不改代码。
 *
 * 加载方式：这两个 .ts 是纯函数、无运行时依赖（fill.ts 只 `import type`）。
 * 用 Node 内置 module.stripTypeScriptTypes 去掉类型后再以 data: URL 当 ESM 载入，
 * **不引入任何构建工具或运行期依赖**。
 *
 * 跑法：node build-config/test-immersive-lyric.cjs
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
  const tl = await loadTs('src/renderer/core/immersiveLyric/timeline.ts')
  const fill = await loadTs('src/renderer/core/immersiveLyric/fill.ts')
  const { buildLyricTimeline, findActiveLineIndex, getWordState } = tl
  const { getWordFill, getLineFill } = fill

  const build = input => buildLyricTimeline({ lrc: null, lxlrc: null, tlrc: null, ...input })

  // =========================================================================
  console.log('\n[1] 时间轴解析')
  // -------------------------------------------------------------------------

  test('正常整句 LRC：source=lrc、无逐字、时间/正文正确、按时间升序', () => {
    const t = build({ lrc: '[ti:标题]\n[00:01.500]第一句\n[00:04.000]第二句' })
    assert.equal(t.source, 'lrc')
    assert.equal(t.hasWordTiming, false)
    assert.equal(t.lines.length, 2)
    assert.deepEqual(t.lines.map(l => l.time), [1500, 4000])
    assert.deepEqual(t.lines.map(l => l.text), ['第一句', '第二句'])
    assert.ok(t.lines.every(l => l.words === null), '整句歌词的 words 必须是 null（界面据此走整句动画）')
    assert.ok(t.lines.every(l => l.translation === null))
  })

  test('两位小数按厘秒、三位按毫秒（整份统一，沿用上游判定）', () => {
    const cs = build({ lrc: '[00:01.50]x\n[00:02.25]y' }) // 全是两位 → 厘秒
    assert.deepEqual(cs.lines.map(l => l.time), [1500, 2250])
    const ms = build({ lrc: '[00:01.500]x\n[00:02.00]y' }) // 出现过三位 → 整份按毫秒
    assert.deepEqual(ms.lines.map(l => l.time), [1500, 2000])
  })

  test('正常逐字 LXLRC：source=lxlrc、词用绝对时间、正文剥离标签、无标签行降级整句', () => {
    const t = build({ lxlrc: '[00:01.000]<0,500>把<500,300>回忆\n[00:03.000]整句无词' })
    assert.equal(t.source, 'lxlrc')
    assert.equal(t.hasWordTiming, true)
    assert.equal(t.lines.length, 2)
    const [l0, l1] = t.lines
    assert.equal(l0.text, '把回忆', '词时间标签必须从正文里剥掉')
    assert.equal(l0.words.length, 2)
    assert.deepEqual(l0.words[0], { text: '把', start: 1000, duration: 500 }, '首段 start 相对行首、需换算成绝对时间')
    assert.deepEqual(l0.words[1], { text: '回忆', start: 1500, duration: 300 })
    assert.equal(l1.words, null, '同一份 lxlrc 里没有 <d,d> 的行应降级为整句')
    assert.equal(l1.text, '整句无词')
  })

  test('同一时间戳的多行（拼接型）：保留先到的一行，不产生重复行', () => {
    const t = build({ lrc: '[00:01.00]先到\n[00:01.00]后到\n[00:02.00]第三' })
    assert.equal(t.lines.length, 2)
    assert.equal(t.lines[0].text, '先到')
    assert.deepEqual(t.lines.map(l => l.time), [1000, 2000])
  })

  test('offset 正/负偏移都叠加进行时间，并原样导出 offset', () => {
    const pos = build({ lrc: '[offset:200]\n[00:01.000]a' })
    assert.equal(pos.offset, 200)
    assert.equal(pos.lines[0].time, 1200)
    const neg = build({ lrc: '[offset:-300]\n[00:01.000]a' })
    assert.equal(neg.offset, -300)
    assert.equal(neg.lines[0].time, 700)
  })

  test('空歌词 / null / 只有元数据：source=none、lines 为空', () => {
    assert.deepEqual(build({ lrc: '' }).lines, [])
    assert.equal(build({ lrc: '' }).source, 'none')
    assert.equal(build({}).source, 'none', 'lrc/lxlrc/tlrc 全空 → none')
    assert.equal(build({ lrc: '[ti:标题]\n[ar:歌手]\n[offset:0]' }).source, 'none')
  })

  test('空行 / 只有时间戳无正文 / 正文为 // ：被丢弃，不产生空行', () => {
    const t = build({ lrc: '[00:01.000]\n[00:02.000]//\n[00:03.000]有效' })
    assert.equal(t.lines.length, 1)
    assert.equal(t.lines[0].text, '有效')
  })

  test('缺少逐字标签的 lxlrc：source 仍是 lxlrc，但 hasWordTiming=false 且 words=null（降级整句）', () => {
    const t = build({ lxlrc: '[00:01.000]没有标签的整句' })
    assert.equal(t.source, 'lxlrc')
    assert.equal(t.hasWordTiming, false)
    assert.equal(t.lines[0].words, null)
  })

  test('输入格式异常不抛异常：非法时间戳被跳过，合法行仍解析', () => {
    let t
    assert.doesNotThrow(() => { t = build({ lrc: '[ab:cd]无效\n[xx]也没有\n[00:01.000]有效' }) })
    assert.equal(t.lines.length, 1)
    assert.equal(t.lines[0].text, '有效')
  })

  test('乱序输入按时间升序输出', () => {
    const t = build({ lrc: '[00:05.000]后\n[00:02.000]前' })
    assert.deepEqual(t.lines.map(l => l.time), [2000, 5000], '输出必须按时间升序')
    assert.deepEqual(t.lines.map(l => l.text), ['前', '后'])
  })

  test('畸形时间戳（4 段）不抛异常，正常行仍被解析', () => {
    // ⚠️ 现状记录：文件头注释写「时间戳段数 > 3 → 丢弃」，但 TIME_RXP 每段最多吃 2 个冒号，
    //    所以 [00:00:00:00.000] 不会被判为「>3 段」，而是被拆成 00:00:00 与 00.000 两段（都=0ms），
    //    从而产出两条时间 0 的重复行 —— 与注释意图有出入。属边界输入，本阶段只记录、不改源码。
    let t
    assert.doesNotThrow(() => { t = build({ lrc: '[00:00:00:00.000]四段\n[00:01.000]正常' }) })
    assert.ok(t.lines.some(l => l.text === '正常' && l.time === 1000), '正常行必须被解析')
    console.log(`       现状：畸形行解析为 ${JSON.stringify(t.lines.filter(l => l.text === '四段').map(l => l.time))}（见报告「语义与注释不一致」）`)
  })

  test('一行多时间标签展开成多行，正文一致', () => {
    const t = build({ lrc: '[00:01.000][00:03.000]重复句' })
    assert.equal(t.lines.length, 2)
    assert.deepEqual(t.lines.map(l => l.time), [1000, 3000])
    assert.deepEqual(t.lines.map(l => l.text), ['重复句', '重复句'])
  })

  // =========================================================================
  console.log('\n[2] 当前歌词定位（findActiveLineIndex / getWordState）')
  // -------------------------------------------------------------------------

  const L = build({ lrc: '[00:01.000]A\n[00:03.000]B\n[00:05.000]C' }).lines // times [1000,3000,5000]

  test('播放时间在第一句之前 → -1（前奏不高亮）', () => {
    assert.equal(findActiveLineIndex(L, 0), -1)
    assert.equal(findActiveLineIndex(L, 999), -1)
  })

  test('恰好位于某句起始时间 → 命中该句', () => {
    assert.equal(findActiveLineIndex(L, 1000), 0)
    assert.equal(findActiveLineIndex(L, 3000), 1)
    assert.equal(findActiveLineIndex(L, 5000), 2)
  })

  test('位于两句之间 → 命中前一句', () => {
    assert.equal(findActiveLineIndex(L, 2000), 0)
    assert.equal(findActiveLineIndex(L, 4999), 1)
  })

  test('恰好位于最后一句时间 / 超过最后一句 → 停在最后一句', () => {
    assert.equal(findActiveLineIndex(L, 5000), 2)
    assert.equal(findActiveLineIndex(L, 999999), 2)
  })

  test('空时间轴 → -1（不抛错）', () => {
    assert.equal(findActiveLineIndex([], 5000), -1)
  })

  test('切换/更换时间轴不复用旧结果（纯函数、无状态）', () => {
    const A = build({ lrc: '[00:01.000]A1\n[00:05.000]A2' }).lines // [1000,5000]
    const B = build({ lrc: '[00:00.500]B1\n[00:02.000]B2\n[00:09.000]B3' }).lines // [500,2000,9000]
    assert.equal(findActiveLineIndex(A, 3000), 0, '时间轴 A：3000ms 落在 A1')
    assert.equal(findActiveLineIndex(B, 3000), 1, '时间轴 B：3000ms 落在 B2')
    assert.equal(findActiveLineIndex(A, 3000), 0, '回到 A 结果不变 —— 没有跨调用的缓存状态')
  })

  test('getWordState：start 前 todo、区间内 active、结束 done', () => {
    const w = { text: 'x', start: 1000, duration: 500 }
    assert.equal(getWordState(w, 999), 'todo')
    assert.equal(getWordState(w, 1000), 'active')
    assert.equal(getWordState(w, 1499), 'active')
    assert.equal(getWordState(w, 1500), 'done')
    assert.equal(getWordState(w, 9999), 'done')
  })

  // =========================================================================
  console.log('\n[3] 填充进度（getWordFill / getLineFill）')
  // -------------------------------------------------------------------------

  test('逐字：未开始=0、进行中=比例、到点=1', () => {
    const w = { text: 'x', start: 1000, duration: 500 }
    assert.equal(getWordFill(w, 800), 0, '未开始')
    assert.equal(getWordFill(w, 1000), 0, '恰好开始：进度 0')
    assert.equal(getWordFill(w, 1250), 0.5, '进行中')
    assert.equal(getWordFill(w, 1500), 1, '恰好结束=1')
    assert.equal(getWordFill(w, 1600), 1, '已过=1（不越界）')
  })

  test('逐字零时长（duration=0）：到点即整段点亮，不除零', () => {
    const w = { text: 'x', start: 1000, duration: 0 }
    assert.equal(getWordFill(w, 999), 0)
    assert.equal(getWordFill(w, 1000), 1)
  })

  test('逐字负时长：按当前实现（视为异常数据），起点后恒 0、起点前可能给出分数', () => {
    // ⚠️ 语义标注：duration<0 属于不该出现的数据。当前实现不特判，
    //    走 (t-start)/duration；t>start 时为负 → 0，t<start 时为正分数。
    //    这里锁定「当前行为」以免被误改；是否要改成「负时长一律当 0」由后续决定。
    const w = { text: 'x', start: 1000, duration: -500 }
    assert.equal(getWordFill(w, 1200), 0, '起点之后 → 0')
    assert.equal(getWordFill(w, 800), 0.4, '起点之前 → 当前实现给出正比例（异常数据，仅记录）')
  })

  test('整句：未开始=0、进行中=比例、完成=1', () => {
    assert.equal(getLineFill(1000, 3000, 500), 0, '未开始')
    assert.equal(getLineFill(1000, 3000, 1000), 0, '恰好开始=0')
    assert.equal(getLineFill(1000, 3000, 2000), 0.5, '进行中')
    assert.equal(getLineFill(1000, 3000, 5000), 1, '已过=1')
  })

  test('整句：最后一行（下一句未知）按 maxRateMs 铺满', () => {
    assert.equal(getLineFill(1000, null, 3000), 0.5, 'null 走默认 4000ms')
    assert.equal(getLineFill(1000, undefined, 3000), 0.5, 'undefined 同上')
    assert.equal(getLineFill(1000, null, 5000), 1, '超过 4000ms 封顶为 1')
  })

  test('整句：行间隔过长时被 maxRateMs 截断（色块不会十几秒不动）', () => {
    assert.equal(getLineFill(1000, 100000, 3000, 4000), 0.5, '间隔 99s，但按 4s 上限铺')
  })

  test('整句：nextTime 早于 lineTime（异常）→ 退回 maxRateMs，不产生除零/负时长', () => {
    assert.equal(getLineFill(5000, 1000, 6000), 0.25, '(6000-5000)/4000')
  })

  test('整句：maxRateMs=0（异常）→ 直接返回 1，不除零', () => {
    assert.equal(getLineFill(1000, null, 2000, 0), 1)
  })

  test('逐字与整句各自独立计算（互不干扰）', () => {
    const wordFill = getWordFill({ text: 'x', start: 1000, duration: 500 }, 1500) // =1
    const lineFill = getLineFill(1000, 3000, 1500) // (1500-1000)/2000 = 0.25
    assert.equal(wordFill, 1)
    assert.equal(lineFill, 0.25)
    assert.notEqual(wordFill, lineFill)
  })

  console.log(`\n结果：${passed} 通过，${failed} 失败\n`)
  process.exit(failed ? 1 : 0)
}

main().catch(error => {
  console.error('FATAL', error)
  process.exit(2)
})
