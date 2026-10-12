'use strict'

/*
 * 泛音 / Overtone —— lxlrc（逐字歌词）构造器
 *
 * 这不是从 Folia 移植来的文件，是本项目为「缝合」写的新代码。
 * 它的职责只有一个：把「纯文本行 + AI 给的分词边界」变成 LX Music 能直接渲染的
 * lxlrc 字符串。
 *
 * ============================================================================
 * 一、lxlrc 格式契约（由实测得出，不是猜的）
 * ============================================================================
 *
 * 目标格式：
 *
 *   [mm:ss.mmm]<起始毫秒,时长毫秒>词1<起始毫秒,时长毫秒>词2…
 *
 * 其中 <起始,时长> **相对本行行首**，不是相对整首歌。
 * 依据：renderer/lyric-font-player/index.js 里
 *     font.play(curTime - this._lines[num].time)
 * 传给 FontPlayer 的时间基座已经减掉了行起始时间；三个平台解析器
 * （wy / tx / mg 的 lyric.js）在生成时也都做了 `parseInt(start) - startMsTime`。
 *
 * 解析端（font-player.js）是这么消费的：
 *
 *   const fontSplitRxp = /(?=<\d+,\d+>).*?/g
 *   fonts = lyric.split(fontSplitRxp)
 *   for (const font of fonts) {
 *     if (!timeRxp.test(font)) return this._handleLineParse()   // ← 退化为普通模式
 *     text = font.replace(timeRxp, '')      // timeRxp 没有 g 标志，只去第一个
 *     startTime = parseInt(RegExp.$1)
 *     time      = parseInt(RegExp.$2)
 *   }
 *
 * 由此推出两条**必须遵守**的硬约束（已用 build-config/probe-lxlrc-format.cjs 实测确认）：
 *
 *   1. 每一行都必须以 <数字,数字> 开头。
 *      否则 fonts[0] 就不含时间标记，_handleLineParse() 会把**原始字符串**（含尖括号
 *      时间标记本身）当作正文显示出来 —— 用户会看到满屏的 `<0,500>`。
 *
 *   2. 空行也必须带一个时间标记，用 <0,0>。
 *      如果空行写成空字符串，除了触发约束 1，还会连带把整首歌的逐字模式关掉：
 *      index.js 用 `!/^<\d+,\d+>/.test(lyricLines[0].text)` 判断全曲是否逐字模式，
 *      只看第一行。首行不带标记 → 全曲退回逐行高亮。见本文件 buildLxlrc 的断言。
 *
 * 另外 `text = font.replace(timeRxp, '')` 用的是无 g 标志的正则，只剥掉每段开头的
 * 那一个时间标记，所以一段里不能再出现第二个 <数字,数字>，否则会被当作正文。
 * 本构造器不生成这种内容（AI 分词产物来自歌词原文，原文不会有这种子串）。
 *
 * ============================================================================
 * 二、时间是怎么分配的
 * ============================================================================
 *
 * AI 只给「怎么断词」，不给时间。所以每个词的时长必须由我们推算：
 *
 *   行可用时长 span = 下一行起始 - 本行起始（最后一行用 fallbackSpanMs）
 *   span 先被 maxLineSpanMs 截断 —— 行与行之间常有间奏，不截断的话最后一个词
 *   会被拉成十几秒的慢动作高亮
 *   每个词的权重 = 词里的「实义字符数」（字母/数字/汉字都算 1，空白和标点算 0，下限 1）
 *   按权重比例分配，最后一个词吃掉余数（避免行尾出现死等）
 *
 * 这样得到的是一条**近似**时间轴，不是真实演唱时间。想更准需要拿音源已有的
 * 逐字时间做「按边界重组」，见本文件末尾 TODO。
 */

// 行时间标签：[mm:ss.mmm] / [mm:ss.xx] / [mm:ss:xx]
// 每个字面量都在函数内新建，避免带 /g 的正则共享 lastIndex 造成的状态污染。
const newLineTimeRxp = () => /\[(\d{1,4}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
// 逐字时间标记：<起始,时长>
const newWordTimeRxp = () => /<(\d+),(\d+)>/g

/** 段内权重只数实义字符：字母、数字、汉字等。 */
const WEIGHT_RXP = /[\p{L}\p{N}]/u

const DEFAULT_FALLBACK_SPAN_MS = 3000
const DEFAULT_MAX_LINE_SPAN_MS = 6000
const DEFAULT_MIN_SEGMENT_MS = 1

/** 空行的占位标记：必须存在（见上面约束 2），但不能显示任何字。 */
const EMPTY_LINE_MARKER = '<0,0>'

const LINE_PREFIX_RXP = /^\[[\d:.]+\]/
const WORD_TAG_AT_START_RXP = /^<(\d+),(\d+)>/
const WORD_TAG_ANYWHERE_RXP = /<\d+,\d+>/

const clampInt = (value) => {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? n : 0
}

/** 毫秒 -> [mm:ss.mmm]，与 LX 的 msFormat 输出一致（毫秒固定 3 位）。 */
const formatLineTime = (ms) => {
  const total = Math.max(0, clampInt(ms))
  const m = Math.floor(total / 60000)
  const s = Math.floor((total % 60000) / 1000)
  const milli = total % 1000
  return `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(milli).padStart(3, '0')}]`
}

/** `[mm:ss.xxx]` 的捕获组 -> 毫秒。小数位按位数解释（.5 是 500ms 不是 5ms）。 */
const timeTagToMs = (match) => {
  const m = Number(match[1])
  const s = Number(match[2])
  const frac = match[3] == null ? '' : String(match[3])
  const milli = frac ? Number(frac.padEnd(3, '0').slice(0, 3)) : 0
  return m * 60000 + s * 1000 + milli
}

/**
 * 从 lrc 或 lxlrc 文本解析出带时间的行。
 *
 * 两种输入都能吃：普通 lrc 的时间标签会被剥离，lxlrc 的 <d,d> 标记也会被剥离，
 * 剩下的就是纯歌词文本。元数据行（`[ti:…]` / `[offset:…]`）没有合法时间标签，
 * 直接跳过。
 *
 * 结果按起始时间升序排列 —— 逐字时间轴要求时间单调，顺手把乱序的歌词文件理顺。
 * JS 的 Array.prototype.sort 是稳定排序，同时间的行保持原有先后。
 */
const parseLyricLines = (text) => {
  if (typeof text !== 'string' || !text) return []

  const lines = []
  for (const rawLine of text.split(/\r?\n/)) {
    const trimmed = rawLine.trim()
    if (!trimmed) continue

    const lineTimeRxp = newLineTimeRxp()
    const tags = [...trimmed.matchAll(lineTimeRxp)]
    if (!tags.length) continue

    const body = trimmed
      .replace(newLineTimeRxp(), '')
      .replace(newWordTimeRxp(), '')

    // 一行挂多个时间标签是合法写法，展开成多行
    for (const tag of tags) {
      lines.push({ startTime: timeTagToMs(tag), text: body })
    }
  }

  lines.sort((a, b) => a.startTime - b.startTime)
  return lines
}

/** 一段文本的权重：实义字符数，下限 1（标点段也不能拿到 0 时长）。 */
const contentWeight = (segment) => {
  let count = 0
  for (const char of String(segment)) {
    if (WEIGHT_RXP.test(char)) count += 1
  }
  return Math.max(1, count)
}

let segmenterCache
const getWordSegmenter = () => {
  if (segmenterCache !== undefined) return segmenterCache
  segmenterCache = null
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
      segmenterCache = new Intl.Segmenter(undefined, { granularity: 'word' })
    }
  } catch {
    segmenterCache = null
  }
  return segmenterCache
}

/**
 * AI 没给出结果（或给错了）时的兜底切分。
 *
 * 不用「一个字一段」：拉丁字母会被切得没法看。优先用 Intl.Segmenter 按词切，
 * 再把标点和空白并进相邻的词；标点在前就并进后一个词（`(拼图女孩)` 的括号
 * 跟词走，而不是单独闪一下）。
 *
 * 无论如何保证 join 回来等于原文；做不到就整行一段（此时仍带时间标记，
 * 只是整行一起高亮，视觉上可接受）。
 */
const fallbackSplit = (text) => {
  const segmenter = getWordSegmenter()
  if (!segmenter) return [text]

  const segments = []
  let pending = ''
  try {
    for (const part of segmenter.segment(text)) {
      if (part.isWordLike) {
        segments.push(pending + part.segment)
        pending = ''
      } else if (segments.length) {
        segments[segments.length - 1] += part.segment
      } else {
        pending += part.segment
      }
    }
  } catch {
    return [text]
  }

  if (pending) {
    if (segments.length) segments[segments.length - 1] += pending
    else segments.push(pending)
  }

  return segments.length && segments.join('') === text ? segments : [text]
}

/**
 * 把一行的分段渲染成 `<起始,时长>文本` 串接。
 * 空行返回 `<0,0>`：既满足「每行必须以时间标记开头」的硬约束，又不会显示任何字。
 */
const renderSegments = (segments, span, minSegmentMs) => {
  if (!segments.length) return EMPTY_LINE_MARKER

  const weights = segments.map(contentWeight)
  const totalWeight = weights.reduce((sum, w) => sum + w, 0)
  const usableSpan = Math.max(minSegmentMs * segments.length, Math.max(0, clampInt(span)))

  const parts = []
  let cursor = 0
  for (let index = 0; index < segments.length; index += 1) {
    const isLast = index === segments.length - 1
    const remaining = Math.max(minSegmentMs, usableSpan - cursor)
    let duration = isLast
      ? remaining
      : Math.max(minSegmentMs, Math.round(usableSpan * weights[index] / totalWeight))
    if (cursor + duration > usableSpan) duration = remaining

    parts.push(`<${cursor},${duration}>${segments[index]}`)
    cursor += duration
  }
  return parts.join('')
}

/**
 * 构造 lxlrc。
 *
 * @param {object} input
 * @param {Array<{startTime:number,text:string}>} input.lines 带时间的歌词行（见 parseLyricLines）
 * @param {Array<string[]|null>} input.boundaries 与 lines 一一对应的分词边界；
 *        null / 长度不符 / 拼不回原文的都会被换成兜底切分
 * @param {object} [input.options]
 * @returns {{ lxlrc: string, stats: object, usedFallback: number[] }}
 */
const buildLxlrc = ({ lines, boundaries, options = {} }) => {
  const fallbackSpanMs = options.fallbackSpanMs ?? DEFAULT_FALLBACK_SPAN_MS
  const maxLineSpanMs = options.maxLineSpanMs ?? DEFAULT_MAX_LINE_SPAN_MS
  const minSegmentMs = options.minSegmentMs ?? DEFAULT_MIN_SEGMENT_MS

  if (!Array.isArray(lines)) throw new TypeError('lines must be an array')

  const stats = {
    lines: lines.length,
    fromAi: 0,
    fromFallback: 0,
    empty: 0,
    totalSegments: 0,
    // 歌词原文里出现了形如 <123,456> 的子串。解析端会把它误认成段边界，
    // 此时无法安全编码，只能如实计数并告警，不做静默改写。
    textWithFakeTag: 0,
  }
  const usedFallback = []
  const unsafeLines = new Set()
  const output = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] || {}
    const text = typeof line.text === 'string' ? line.text : ''
    const startTime = clampInt(line.startTime)

    // 行可用时长：到下一行开始为止
    const next = lines[index + 1]
    let span = next ? clampInt(next.startTime) - startTime : fallbackSpanMs
    if (!(span > 0)) span = fallbackSpanMs
    // 间奏会把 span 拉得很长，截断，免得最后一个词变成慢动作
    if (span > maxLineSpanMs) span = maxLineSpanMs

    const candidate = Array.isArray(boundaries) ? boundaries[index] : null
    let segments
    if (!text.trim()) {
      segments = []
      stats.empty += 1
    } else if (candidate && candidate.length && candidate.join('') === text) {
      segments = candidate
      stats.fromAi += 1
    } else {
      segments = fallbackSplit(text)
      stats.fromFallback += 1
      usedFallback.push(index)
    }

    if (WORD_TAG_ANYWHERE_RXP.test(text)) {
      stats.textWithFakeTag += 1
      unsafeLines.add(index)
    }

    stats.totalSegments += segments.length
    output.push(formatLineTime(startTime) + renderSegments(segments, span, minSegmentMs))
  }

  const lxlrc = output.join('\n')

  // 格式契约是这套东西的地基：破坏了会导致界面显示尖括号标记、或者整首歌悄悄
  // 退回逐行高亮。都是「不报错但功能没了」的失败模式，所以在构造端就断掉。
  // 见文件头「一、lxlrc 格式契约」。
  //
  // textWithFakeTag 那几行跳过自检：原文自带同形子串时，无论怎么切都编不出
  // 合法结果，这是格式自身的歧义，不是构造器的缺陷。硬抛错会让一整首歌因为
  // 一行怪文本而全部失败，代价远大于收益。
  for (let index = 0; index < output.length; index += 1) {
    if (unsafeLines.has(index)) continue
    const problem = inspectLine(output[index])
    if (problem) {
      throw new Error(`[lxlrc] generated an unrenderable line (${problem}): ${JSON.stringify(output[index].slice(0, 80))}`)
    }
  }

  return { lxlrc, stats, usedFallback }
}

/**
 * 校验一行是否真的能被 font-player.js 渲染成逐字。
 * 返回问题描述，或在通过时返回 null。
 *
 * 覆盖四条：
 *   1. 必须以 [行时间]<词时间> 开头，否则整行退化并把原始标记显示出来
 *   2. 每段之间的正文里不能再出现 <数字,数字>（会被解析端当成段边界，导致
 *      段边界与构造时不一致、标记泄漏成正文）
 *   3. 起始时间单调不减且连续、时长均为正整数、首段从 0 开始
 *
 * 注意**不**禁止裸的 '<'：解析端是按 /(?=<\d+,\d+>)/ 切分的，正文里的 '<'
 * 只要不构成 <数字,数字> 就不会被误切，实测可以无损还原。这一条是跑
 * build-config/test-lxlrc.cjs 时纠正过来的。
 */
const inspectLine = (line) => {
  if (typeof line !== 'string' || !/^\[[\d:.]+\]<\d+,\d+>/.test(line)) {
    return 'must start with a line time tag followed by a word time tag'
  }

  const body = line.replace(LINE_PREFIX_RXP, '')
  // 空行标记是唯一允许时长为 0 的行：它不承载任何文字，也就没有动画
  if (body === EMPTY_LINE_MARKER) return null

  let rest = body
  let previousStart = -1
  let previousEnd = -1
  while (rest.length) {
    const match = WORD_TAG_AT_START_RXP.exec(rest)
    if (!match) return 'segment is missing its word time tag'

    const start = Number(match[1])
    const duration = Number(match[2])
    if (!Number.isInteger(start) || start < 0) return `invalid start time ${match[1]}`
    if (!Number.isInteger(duration) || duration < DEFAULT_MIN_SEGMENT_MS) {
      return `invalid duration ${match[2]}`
    }
    if (previousStart === -1 && start !== 0) return `first segment must start at 0, got ${start}`
    if (start < previousStart) return `start times must not decrease (${previousStart} -> ${start})`
    if (previousEnd !== -1 && start !== previousEnd) {
      return `segments must be contiguous (expected ${previousEnd}, got ${start})`
    }
    previousStart = start
    previousEnd = start + duration

    rest = rest.slice(match[0].length)
    // 跳到下一个合法时间标记；两者之间就是本段的正文，
    // 按定义不含 <数字,数字>，所以前面那条约束自然成立。
    const nextTag = rest.search(WORD_TAG_ANYWHERE_RXP)
    rest = nextTag === -1 ? '' : rest.slice(nextTag)
  }
  return null
}

/** 只做「这是不是一个合法的 lxlrc 字符串」的快速判定。 */
const isLxlrc = (text) => typeof text === 'string' && /^\[[\d:.]+\]<\d+,\d+>/m.test(text)

module.exports = {
  DEFAULT_FALLBACK_SPAN_MS,
  DEFAULT_MAX_LINE_SPAN_MS,
  DEFAULT_MIN_SEGMENT_MS,
  buildLxlrc,
  contentWeight,
  fallbackSplit,
  formatLineTime,
  inspectLine,
  isLxlrc,
  parseLyricLines,
}
