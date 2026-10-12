'use strict'

/*
 * lxlrc 构造器的测试。
 *
 * 关键思路：不只断言「输出长得对」，而是把输出**喂回一个忠实复刻的解析器**
 * （从 src/common/utils/lyric-font-player/font-player.js 的 _parseLyric 和
 * index.js 的 _initLines 抄出来的判定逻辑），验证：
 *   a. 全曲逐字模式闸门通过
 *   b. 每一行都能被解析成逐字模式（而不是退化成整行）
 *   c. 解析出来的文字拼回去，与原始歌词逐字一致
 *
 * 只断言 (a)(b) 不够 —— 出现非法时间标记时恰恰会「退化成整行」而不报错，
 * 所以 (b) 必须和 (c) 一起看。
 *
 * 跑法：node build-config/test-lxlrc.cjs
 */

const assert = require('node:assert/strict')
const {
  buildLxlrc,
  contentWeight,
  fallbackSplit,
  formatLineTime,
  inspectLine,
  parseLyricLines,
} = require('../src/main/modules/ai/lxlrc.cjs')

// ---------------------------------------------------------------------------
// 复刻上游解析器（改自 font-player.js / index.js，只保留判定所需部分）
// ---------------------------------------------------------------------------
const fontSplitRxp = /(?=<\d+,\d+>).*?/g
const timeRxp = /<(\d+),(\d+)>/

/** 复刻 font-player.js 的 _parseLyric 判定，返回该行的解析结果。 */
function parseLikeFontPlayer(lyric) {
  const fonts = lyric.split(fontSplitRxp)
  const segments = []
  for (const font of fonts) {
    if (!timeRxp.test(font)) {
      // 上游在这里 return this._handleLineParse()：整行退化为普通模式，
      // 并把原始字符串（含尖括号标记）当正文显示
      return { mode: 'line', renderedText: lyric, segments: [] }
    }
    segments.push({
      text: font.replace(timeRxp, ''),
      startTime: parseInt(RegExp.$1, 10),
      duration: parseInt(RegExp.$2, 10),
    })
  }
  return { mode: 'font', renderedText: segments.map(s => s.text).join(''), segments }
}

/** 复刻 index.js:117 的全曲闸门。 */
function globalFontMode(lyricLines) {
  return lyricLines.length > 0 && !/^<\d+,\d+>/.test(lyricLines[0].text)
    ? 'line'
    : 'font'
}

/** 把 lxlrc 文本拆成 index.js 拿到的 lyricLines 形态（行时间已被剥离）。 */
function toLyricLines(lxlrc) {
  return lxlrc.split('\n').map((line) => ({
    time: line.match(/^\[(\d+):(\d+)\.(\d+)\]/)
      ? Number(RegExp.$1) * 60000 + Number(RegExp.$2) * 1000 + Number(RegExp.$3)
      : 0,
    text: line.replace(/^\[[\d:.]+\]/, ''),
  }))
}

// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
console.log('\n[1] formatLineTime')
test('分钟/秒/毫秒补零正确', () => {
  assert.equal(formatLineTime(0), '[00:00.000]')
  assert.equal(formatLineTime(5), '[00:00.005]')
  assert.equal(formatLineTime(1500), '[00:01.500]')
  assert.equal(formatLineTime(61234), '[01:01.234]')
  assert.equal(formatLineTime(3723456), '[62:03.456]')
})
test('负数与小数被夹住', () => {
  assert.equal(formatLineTime(-100), '[00:00.000]')
  assert.equal(formatLineTime(1500.6), '[00:01.501]')
  assert.equal(formatLineTime(NaN), '[00:00.000]')
})

// ---------------------------------------------------------------------------
console.log('\n[2] parseLyricLines')
test('解析普通 lrc', () => {
  const lines = parseLyricLines('[00:01.500]把回忆拼好给你\n[00:04.000]第二行')
  assert.equal(lines.length, 2)
  assert.deepEqual(lines[0], { startTime: 1500, text: '把回忆拼好给你' })
  assert.equal(lines[1].startTime, 4000)
})
test('解析 lxlrc 时剥掉词时间标记', () => {
  const lines = parseLyricLines('[00:01.500]<0,500>把<500,300>回忆<800,400>拼好')
  assert.equal(lines.length, 1)
  assert.equal(lines[0].text, '把回忆拼好')
  assert.equal(lines[0].startTime, 1500)
})
test('两位小数按百分秒解释，不是毫秒', () => {
  assert.equal(parseLyricLines('[00:01.50]x')[0].startTime, 1500)
  assert.equal(parseLyricLines('[00:01.5]x')[0].startTime, 1500)
  assert.equal(parseLyricLines('[00:01.005]x')[0].startTime, 1005)
})
test('跳过元数据行，并按时间排序', () => {
  const lines = parseLyricLines('[ti:标题]\n[offset:-200]\n[00:05.000]后\n[00:02.000]前')
  assert.equal(lines.length, 2)
  assert.equal(lines[0].text, '前')
  assert.equal(lines[1].text, '后')
})
test('一行多标签会展开', () => {
  const lines = parseLyricLines('[00:01.000][00:03.000]重复句')
  assert.equal(lines.length, 2)
  assert.deepEqual(lines.map(l => l.startTime), [1000, 3000])
})
test('空输入返回空数组', () => {
  assert.deepEqual(parseLyricLines(''), [])
  assert.deepEqual(parseLyricLines(null), [])
})

// ---------------------------------------------------------------------------
console.log('\n[3] contentWeight 与 fallbackSplit')
test('权重只数实义字符', () => {
  assert.equal(contentWeight('回忆'), 2)
  assert.equal(contentWeight('abc'), 3)
  assert.equal(contentWeight('，'), 1, '纯标点下限为 1')
  assert.equal(contentWeight(' '), 1)
  assert.equal(contentWeight('unbelievable, '), 12, '逗号与空格不计')
  assert.equal(contentWeight('2026年'), 5)
})
test('兜底切分能拼回原文', () => {
  for (const text of [
    '把回忆拼好给你',
    "It's unbelievable, isn't it?",
    '(拼图女孩)',
    'いっぱいあるんだよ欲しいもの',
    '前面 后 mixed 中英 123',
  ]) {
    const segs = fallbackSplit(text)
    assert.equal(segs.join(''), text, `拼不回: ${text}`)
    const text2 = require('../src/main/modules/ai/lxlrc.cjs').contentWeight
    void text2
  }
})

// ---------------------------------------------------------------------------
console.log('\n[4] buildLxlrc —— 结构')
test('每行都以 [时间]<d,d> 开头（含空行）', () => {
  const lines = parseLyricLines('[00:01.000]把回忆拼好给你\n[00:04.000]\n[00:07.000]结尾')
  const { lxlrc } = buildLxlrc({
    lines,
    boundaries: [['把', '回忆', '拼好', '给', '你'], null, null],
  })
  for (const line of lxlrc.split('\n')) {
    assert.equal(inspectLine(line), null, `不合法: ${line}`)
  }
})
test('空行渲染成 <0,0>，不会显示尖括号', () => {
  const lines = parseLyricLines('[00:01.000]有词\n[00:04.000]\n[00:07.000]结尾')
  const { lxlrc, stats } = buildLxlrc({ lines, boundaries: [['有', '词'], null, null] })
  assert.equal(lxlrc.split('\n')[1], '[00:04.000]<0,0>')
  assert.equal(stats.empty, 1)
})
test('首行是空行时，全曲闸门仍然通过', () => {
  const lines = parseLyricLines('[00:00.500]\n[00:03.000]第二行')
  const { lxlrc } = buildLxlrc({ lines, boundaries: [null, ['第二', '行']] })
  assert.equal(globalFontMode(toLyricLines(lxlrc)), 'font',
    '首行不带词时间标记会让整首歌退回逐行高亮')
})
test('起始时间单调不减、首段从 0 开始', () => {
  const lines = parseLyricLines('[00:01.000]把回忆拼好给你')
  const { lxlrc } = buildLxlrc({ lines, boundaries: [['把', '回忆', '拼好', '给', '你']] })
  const tags = [...lxlrc.matchAll(/<(\d+),(\d+)>/g)].map(m => [Number(m[1]), Number(m[2])])
  assert.equal(tags[0][0], 0)
  for (let i = 1; i < tags.length; i += 1) {
    assert.ok(tags[i][0] >= tags[i - 1][0], `第 ${i} 段起始时间倒退`)
    assert.ok(tags[i][1] >= 1, `第 ${i} 段时长为 0`)
    assert.equal(tags[i][0], tags[i - 1][0] + tags[i - 1][1], '段时间不连续')
  }
})
test('词多的段拿到更多时间（按权重分配）', () => {
  // 「回」1 字 vs 「忆拼好给」4 字，后者应拿到约 4 倍
  const lines = parseLyricLines('[00:00.000]回把忆拼好给')
  const { lxlrc } = buildLxlrc({ lines, boundaries: [['回', '把', '忆拼好给']] })
  const durs = [...lxlrc.matchAll(/<(\d+),(\d+)>/g)].map(m => Number(m[2]))
  assert.ok(durs[2] > durs[0] * 3, `权重未生效: ${JSON.stringify(durs)}`)
})
test('间奏把 span 拉长时，被 maxLineSpanMs 截断', () => {
  const lines = parseLyricLines('[00:01.000]短句\n[00:40.000]下一行')
  const { lxlrc } = buildLxlrc({ lines, boundaries: [['短', '句'], null], options: { maxLineSpanMs: 6000 } })
  const firstLine = lxlrc.split('\n')[0]
  const total = [...firstLine.matchAll(/<(\d+),(\d+)>/g)]
    .reduce((sum, m) => sum + Number(m[2]), 0)
  assert.ok(total <= 6000, `未被截断，总时长 ${total}ms`)
})
test('最后一行没有下一行时使用 fallbackSpanMs', () => {
  const lines = parseLyricLines('[00:01.000]结尾')
  const { lxlrc } = buildLxlrc({
    lines, boundaries: [['结', '尾']], options: { fallbackSpanMs: 2000 },
  })
  const total = [...lxlrc.matchAll(/<(\d+),(\d+)>/g)].reduce((s, m) => s + Number(m[2]), 0)
  assert.equal(total, 2000)
})

// ---------------------------------------------------------------------------
console.log('\n[5] buildLxlrc —— 边界异常输入的降级')
test('boundaries 为 null 时用兜底切分', () => {
  const lines = parseLyricLines('[00:01.000]把回忆拼好给你')
  const { lxlrc, stats } = buildLxlrc({ lines, boundaries: [null] })
  assert.equal(stats.fromFallback, 1)
  const parsed = parseLikeFontPlayer(lxlrc.split('\n')[0].replace(/^\[[\d:.]+\]/, ''))
  assert.equal(parsed.mode, 'font')
})
test('boundaries 拼不回原文时拒绝采用，改用兜底', () => {
  const lines = parseLyricLines('[00:01.000]把回忆拼好给你')
  const { stats, lxlrc } = buildLxlrc({ lines, boundaries: [['把', '回忆', '拼好']] })
  assert.equal(stats.fromAi, 0)
  assert.equal(stats.fromFallback, 1)
  assert.equal(parseLikeFontPlayer(lxlrc.split('\n')[0].replace(/^\[[\d:.]+\]/, '')).renderedText,
    '把回忆拼好给你')
})
test('boundaries 数量少/多都不炸', () => {
  const lines = parseLyricLines('[00:01.000]一\n[00:03.000]二')
  assert.doesNotThrow(() => buildLxlrc({ lines, boundaries: [['一']] }))
  assert.doesNotThrow(() => buildLxlrc({ lines, boundaries: [['一'], ['二'], ['多余']] }))
})

// ---------------------------------------------------------------------------
console.log('\n[6] 端到端：生成的 lxlrc 喂回上游解析器')
test('全曲逐字模式、每行逐字、文字逐字无损', () => {
  const source = [
    '[ti:测试曲]',
    '[offset:0]',
    '',
    '[00:01.000]<0,500>把<500,300>回忆<800,900>拼好<1700,700>给<2400,600>你',
    '[00:05.000]It\u2019s unbelievable, isn\u2019t it?',
    '[00:09.000]いっぱいあるんだよ欲しいもの',
    '[00:13.000]',
    '[00:15.000](拼图女孩)',
    '[00:19.000]结尾',
  ].join('\n')

  const lines = parseLyricLines(source)
  assert.equal(lines.length, 6, '元数据行应被跳过')

  // 第 1、3、4 行给 AI 边界；第 2 行故意给一个拼不回的（模拟模型改写）
  const boundaries = [
    ['把', '回忆', '拼好', '给', '你'],
    ['It\u2019s ', 'unbelievable, ', 'isn\u2019t ', 'it?'],
    ['いっぱい', 'あるんだよ', '欲しい', 'もの'],
    null,
    ['(拼图女孩)'],
    ['结尾'],
  ]

  const { lxlrc, stats } = buildLxlrc({ lines, boundaries })

  // a. 全曲闸门
  const lyricLines = toLyricLines(lxlrc)
  assert.equal(globalFontMode(lyricLines), 'font', '全曲未进入逐字模式')

  // b + c. 逐行逐字 + 文字无损
  for (let i = 0; i < lyricLines.length; i += 1) {
    const parsed = parseLikeFontPlayer(lyricLines[i].text)
    assert.equal(parsed.mode, 'font', `第 ${i + 1} 行退化成整行模式: ${lyricLines[i].text}`)
    assert.equal(parsed.renderedText, lines[i].text,
      `第 ${i + 1} 行文字被改动\n  期望 ${JSON.stringify(lines[i].text)}\n  实得 ${JSON.stringify(parsed.renderedText)}`)
  }

  // 空行是唯一允许「字体模式但无文字」的行
  assert.equal(lyricLines[3].text, '<0,0>')
  assert.equal(parseLikeFontPlayer(lyricLines[3].text).renderedText, '')

  console.log(`       段落数 ${stats.totalSegments}，AI 命中 ${stats.fromAi} 行，兜底 ${stats.fromFallback} 行，空行 ${stats.empty} 行`)
})

test('真实歌词片段：AI 全命中时统计正确', () => {
  const source = [
    '[00:00.000]夜色渐浓',
    '[00:03.500]灯火未眠',
  ].join('\n')
  const lines = parseLyricLines(source)
  const { stats, lxlrc, usedFallback } = buildLxlrc({
    lines,
    boundaries: [['夜色', '渐浓'], ['灯火', '未眠']],
  })
  assert.equal(stats.fromAi, 2)
  assert.equal(stats.fromFallback, 0)
  assert.deepEqual(usedFallback, [])
  assert.equal(stats.totalSegments, 4)
  assert.ok(lxlrc.startsWith('[00:00.000]<0,'), lxlrc)
})

// ---------------------------------------------------------------------------
console.log('\n[7] 超长/异常输入')
test('1000 行不抛错且全部合法', () => {
  const lines = []
  for (let i = 0; i < 1000; i += 1) {
    lines.push({ startTime: i * 2500, text: `第${i}行歌词内容` })
  }
  const { lxlrc } = buildLxlrc({ lines, boundaries: [] })
  const out = lxlrc.split('\n')
  assert.equal(out.length, 1000)
  for (const line of out) assert.equal(inspectLine(line), null)
})
test('整首歌只有一行', () => {
  const lines = parseLyricLines('[00:00.000]独行')
  const { lxlrc } = buildLxlrc({ lines, boundaries: [['独', '行']] })
  assert.equal(inspectLine(lxlrc), null)
})
test('含裸 < > 的歌词原文可以无损编码', () => {
  const lines = parseLyricLines('[00:01.000]1 < 2 > 0')
  const { lxlrc, stats } = buildLxlrc({ lines, boundaries: [['1 ', '< ', '2 ', '> ', '0']] })
  assert.equal(stats.fromAi, 1, '裸 < 不应被判为不可编码')
  assert.equal(stats.textWithFakeTag, 0)
  const parsed = parseLikeFontPlayer(lxlrc.split('\n')[0].replace(/^\[[\d:.]+\]/, ''))
  assert.equal(parsed.mode, 'font')
  assert.equal(parsed.renderedText, '1 < 2 > 0', '文字必须无损')
})
test('直接传入含 <123,456> 的文本会被计数告警，但不崩溃、不拖垮整首', () => {
  // 注意：走 parseLyricLines 的话这种子串会在解析阶段就被当作词时间标记剥掉
  // （见下一条），所以这里直接构造 lines 来验证 buildLxlrc 自身的行为。
  const { stats, lxlrc, usedFallback } = buildLxlrc({
    lines: [
      { startTime: 1000, text: 'a<123,456>b' },
      { startTime: 4000, text: '正常的一行' },
    ],
    boundaries: [['a<123,456>b'], ['正常', '的', '一行']],
  })
  assert.equal(stats.textWithFakeTag, 1)
  assert.deepEqual(usedFallback, [], '这是格式歧义，不该被当成「AI 边界不可用」而退回兜底')
  // 关键：一行怪文本不能让整首歌失败
  assert.equal(lxlrc.split('\n').length, 2)
  // 另一行仍然完全正常
  assert.equal(inspectLine(lxlrc.split('\n')[1]), null)
  assert.equal(parseLikeFontPlayer(lxlrc.split('\n')[1].replace(/^\[[\d:.]+\]/, '')).renderedText, '正常的一行')
})
test('parseLyricLines 无法区分「真词时间标记」与「原文里的同形子串」', () => {
  // 这是格式本身的歧义，不是实现缺陷：lxlrc 里 <d,d> 就是段边界，
  // 原文若要含同形子串则无从表达。记录在此，避免以后被当成 bug 反复排查。
  const lines = parseLyricLines('[00:01.000]a<123,456>b')
  assert.equal(lines[0].text, 'ab')
})

// ---------------------------------------------------------------------------
console.log(`\n结果：${passed} 通过，${failed} 失败\n`)
process.exit(failed ? 1 : 0)
