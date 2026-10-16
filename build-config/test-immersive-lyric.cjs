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
 * ⚠️ 第七阶段：上一版用「锁定现状」记录的两处边界，已被判为真实缺陷并修复，
 *   本文件相应更新为**修复后的语义**（两处都在用例里标了「第七阶段修复」）：
 *     ① 畸形时间戳（如 `[00:00:00:00.000]`）必须整段校验后作废，不再被正则部分匹配截成 0ms 歌词行；
 *     ② `getWordFill` 遇到负时长/无效时长时，不得在起点之前给出正向填充。
 *   其余用例仍然是「钉死现有语义」，若再发现可疑之处只标注、不改代码。
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

  test('非法时间戳（段数超标）：整个标记作废，不再凭空产出 0ms 歌词行', () => {
    // 🔧 第七阶段修复：旧实现沿用上游 timeExp 的**部分匹配**，会把 [00:00:00:00.000]
    //    截出 00:00:00.000 当成合法时间戳，于是畸形标记变成一条时间为 0 的歌词行。
    //    现在改为「先切出方括号内容、再整段校验」，段数超标的标记直接作废。
    let t
    assert.doesNotThrow(() => { t = build({ lrc: '[00:00:00:00.000]四段\n[00:01.000]正常' }) })
    assert.ok(!t.lines.some(l => l.text === '四段'), '畸形标记不得进入时间轴')
    assert.ok(!t.lines.some(l => l.time === 0), '不得凭空多出一条 0ms 行')
    assert.deepEqual(t.lines.map(l => [l.time, l.text]), [[1000, '正常']], '同一份歌词里的合法行照常解析')
  })

  test('非法时间戳的其他形式（含字母 / 缺小数位 / 小数位超 3 位）：一律不作数', () => {
    for (const lrc of ['[ab:cd]含字母', '[00:12]缺小数位', '[00:01.0000]四位小数', '[00:1:2:3]多段无小数']) {
      const t = build({ lrc })
      assert.equal(t.lines.length, 0, `不应解析出任何行：${lrc}`)
    }
    // 同一行内「合法 + 非法」混合：只采用合法标记
    const sameLine = build({ lrc: '[00:01.00][00:00:00:00.000]混合\n[00:03.00]句' })
    assert.deepEqual(sameLine.lines.map(l => [l.time, l.text]), [[1000, '混合'], [3000, '句']])
    // 合法标记在后、畸形在前：合法标记同样要保住
    const after = build({ lrc: '[00:00:00:00.000][00:02.00]在后\n[00:04.00]下句' })
    assert.deepEqual(after.lines.map(l => [l.time, l.text]), [[2000, '在后'], [4000, '下句']])
  })

  test('非法时间戳不抛异常：整份只有畸形标记时退回 none，不产生空行', () => {
    let t
    assert.doesNotThrow(() => { t = build({ lrc: '[00:00:00:00.000]只有畸形\n[99:99.99.99]也是畸形' }) })
    assert.equal(t.lines.length, 0)
    assert.equal(t.source, 'none', '没有任何合法时间戳 → 回到降级文案')
  })

  test('合法边界值：0ms 歌词必须保留（厘秒与毫秒两种写法都不许误删）', () => {
    const cs = build({ lrc: '[00:00.00]开头\n[00:01.50]第二句' })
    assert.deepEqual(cs.lines.map(l => [l.time, l.text]), [[0, '开头'], [1500, '第二句']])
    const ms = build({ lrc: '[00:00.000]开头\n[00:01.500]第二句' })
    assert.deepEqual(ms.lines.map(l => [l.time, l.text]), [[0, '开头'], [1500, '第二句']])
  })

  test('合法边界值：hh:mm:ss.xxx / 一位小数 / 纯秒 ss.xx 都能整段通过', () => {
    assert.equal(build({ lrc: '[01:02:03.500]长时' }).lines[0].time, 3723500, '1h2m3s500ms')
    assert.equal(build({ lrc: '[00:01.5]一位小数' }).lines[0].time, 1500, '厘秒写法 .5 → 500ms')
    assert.equal(build({ lrc: '[30.50]纯秒' }).lines[0].time, 30500, '无冒号、只有秒+小数，仍按 ss.xx 解释')
  })

  test('连续时间戳：合法多标记从 0ms 起连续展开；其中夹畸形只丢畸形那一个', () => {
    const all = build({ lrc: '[00:00.00][00:01.00][00:02.00]连三' })
    assert.deepEqual(all.lines.map(l => [l.time, l.text]), [[0, '连三'], [1000, '连三'], [2000, '连三']])
    const withBad = build({ lrc: '[00:01.00][00:00:00:00.000][00:02.00]夹一个畸形' })
    assert.deepEqual(withBad.lines.map(l => l.time), [1000, 2000], '只丢畸形标记，前后合法标记保留')
  })

  test('连续/重复时间戳：同一时间在一行内重复出现时保留先到的，不产生重复行', () => {
    const dup = build({ lrc: '[00:01.00][00:01.00]先\n[00:02.00]后' })
    assert.deepEqual(dup.lines.map(l => [l.time, l.text]), [[1000, '先'], [2000, '后']])
  })

  test('合法与元数据混排：元数据行不产出歌词，offset 仍按规则叠加', () => {
    const t = build({ lrc: '[ti:标题]\n[ar:歌手]\n[offset:200]\n[00:01.000]词\n[00:00:00:00.000]畸形' })
    assert.deepEqual(t.lines.map(l => [l.time, l.text]), [[1200, '词']])
    assert.equal(t.offset, 200)
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
    assert.equal(getWordFill(w, 999), 0, '起点之前必须 0')
    assert.equal(getWordFill(w, 1000), 1, '到点即点亮')
    assert.equal(getWordFill(w, 5000), 1)
  })

  test('逐字负时长：起点之前不得给出任何正向填充（第七阶段修复）', () => {
    // 🔧 第七阶段修复：旧实现不特判负时长，直接走 (t-start)/duration，于是
    //    t < start 时会算出**正**比例（旧用例记录到 0.4）——等于「还没唱到就先亮了一块」。
    //    现在负时长与零时长同样处理：没有可信渐变区间 → 到点即整段点亮。
    const w = { text: 'x', start: 1000, duration: -500 }
    assert.equal(getWordFill(w, 800), 0, '起点之前必须 0（不得出现正向填充）')
    assert.equal(getWordFill(w, 1000), 1, '到点即点亮')
    assert.equal(getWordFill(w, 1200), 1, '起点之后 1')
    // 但无论怎么取，结果都必须落在 [0,1] 且有界
    for (const t of [-1000, 0, 500, 999, 1000, 1001, 99999]) {
      const f = getWordFill(w, t)
      assert.ok(f >= 0 && f <= 1, `t=${t} 的填充必须落在 [0,1]，实得 ${f}`)
    }
  })

  test('逐字异常时长（NaN / ±Infinity / 字段缺失）：一律按「到点即点亮」，不外泄 NaN', () => {
    for (const duration of [NaN, Infinity, -Infinity, undefined, null]) {
      const w = { text: 'x', start: 1000, duration }
      const before = getWordFill(w, 800)
      const at = getWordFill(w, 1000)
      const after = getWordFill(w, 5000)
      assert.equal(before, 0, `duration=${String(duration)}：起点之前必须 0`)
      assert.equal(at, 1, `duration=${String(duration)}：到点 1`)
      assert.equal(after, 1, `duration=${String(duration)}：之后 1`)
    }
  })

  test('逐字：timeMs 异常（NaN）时不把 NaN 外泄（CSS 变量必须是数值）', () => {
    assert.equal(getWordFill({ text: 'x', start: 1000, duration: 500 }, NaN), 0, '有效时长 + NaN 时间')
    assert.equal(getWordFill({ text: 'x', start: 1000, duration: 0 }, NaN), 0, '无效时长 + NaN 时间')
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

  test('整句：maxRateMs 为负数 / NaN / Infinity（异常）→ 结果仍落在 [0,1]，不外泄 NaN', () => {
    // 🔧 第七阶段：旧实现在「上限为负数」时会算出**负**比例（例如 (2000-1000)/-4000 = -0.25）。
    //    现在与 maxRateMs=0 同路：没有可信区间 → 视为「立即铺满」返回 1。
    for (const rate of [-1, -4000, NaN, Infinity, -Infinity]) {
      const f = getLineFill(1000, null, 2000, rate)
      assert.ok(Number.isFinite(f) && f >= 0 && f <= 1, `maxRateMs=${String(rate)} 必须落在 [0,1]，实得 ${f}`)
    }
    assert.equal(getLineFill(1000, null, 2000, -4000), 1, '负上限不再算出负比例')
  })

  test('整句：nextTime 为 NaN / Infinity / 等于 lineTime / 小于 lineTime → 一律退回上限，不越界', () => {
    assert.equal(getLineFill(1000, NaN, 2000), 0.25, 'NaN 间隔 → 退回 4000ms 上限')
    assert.equal(getLineFill(1000, Infinity, 2000), 0.25, '无限间隔 → 被 maxRateMs 截断')
    assert.equal(getLineFill(1000, 1000, 2000), 0.25, '间隔 0 → 退回上限，不除零')
    assert.equal(getLineFill(1000, 500, 2000), 0.25, '间隔为负 → 退回上限')
  })

  test('整句：timeMs 异常（NaN）与正常正时长回归钉死', () => {
    assert.equal(getLineFill(1000, 3000, NaN), 0, 'NaN 时间不外泄 NaN，按未开始处理')
    // 正常正时长：起点前 / 起点 / 中间 / 结束 / 之后
    assert.equal(getLineFill(1000, 3000, 500), 0)
    assert.equal(getLineFill(1000, 3000, 1000), 0)
    assert.equal(getLineFill(1000, 3000, 2000), 0.5)
    assert.equal(getLineFill(1000, 3000, 3000), 1)
    assert.equal(getLineFill(1000, 3000, 9000), 1)
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
