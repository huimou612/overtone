/**
 * 沉浸式歌词的时间轴（纯数据层，不碰 DOM）
 *
 * 这一层存在的理由：项目里原有的 `common/utils/lyric-font-player`（LinePlayer / FontPlayer）
 * 把「解析」和「改 DOM」焊死在一起了（`document.createElement`、`new Animation`），
 * 拿不到结构化数据去喂 Vue。这里只抽它解析的部分，输出纯数据。
 *
 * ── 时间与单位约定（上层不需要再做任何换算）───────────────────────────
 * 1. 对外所有时间统一为**毫秒（ms）**，且**已经叠加过歌词里的 `[offset:]`**。
 * 2. 行首时间戳 `[mm:ss.xx]`：判定整份文件用「厘秒」还是「毫秒」的方式沿用上游
 *    line-player.js —— 全文只要出现过 `[….\d{3}]` 就认定整份按毫秒记。
 *    理由是混合写法的文件不能一半按厘秒一半按毫秒解释，必须整份统一。
 *    - 按厘秒：`.25` → 250ms（即 `.xx` 两位小数）
 *    - 按毫秒：`.250` → 250ms
 * 3. lxlrc 的字标签 `<start,duration>` 是**毫秒**，且 `start` 相对**本行起点**。
 *    这里在构造时就换算成绝对时间（line.time + start），渲染层不再做加法。
 * 4. `[offset:]` 是毫秒，可为负数。
 *
 * ── 明确处理掉的边界───────────────────────────────────────────────
 * - 一行多个时间戳 `[00:01.00][00:05.00]xxx` → 展开成两行
 * - 同一时间重复出现（拼接型歌词常见）→ 保留先到的一行，不去重会导致「同一句占两行」
 * - 空行 / 只有时间戳没有正文 / 正文为 `//` → 丢弃（不产生空泡泡）
 * - 时间戳段数 > 3（hh:mm:ss.xx 之上）→ 丢弃
 * - tlrc（翻译）按**归一化后的时间标签**与正文行配对，配不上就不显示翻译
 * - 整份都没时间戳 → 返回 `{ source: 'none', lines: [] }`，由界面走降级文案
 */

export interface ImmersiveLyricWord {
  text: string
  /** 绝对时间 ms（已含 offset 与本行起点） */
  start: number
  /** 持续时长 ms */
  duration: number
}

export interface ImmersiveLyricLine {
  /** 绝对时间 ms（已含 offset） */
  time: number
  text: string
  /** 有逐字时间戳才非空；没有就是 null —— 界面据此决定「整句」还是「逐字」，绝不伪造 */
  words: ImmersiveLyricWord[] | null
  translation: string | null
}

export interface ImmersiveLyricTimeline {
  lines: ImmersiveLyricLine[]
  /** 歌词自带的偏移量 ms，已叠加进各行时间 */
  offset: number
  /** 是否至少有一行带逐字时间戳 */
  hasWordTiming: boolean
  /** 最终采用的是哪一种歌词 */
  source: 'none' | 'lrc' | 'lxlrc'
}

/** 行首连续的时间戳段：`[00:01.00][00:05.00]` */
const TIME_FIELD_RXP = /^(?:\[[\d:.]+\])+/
/** 单个时间戳：`01:02.50` / `00:01.000` / `1:02` */
const TIME_RXP = /\d{1,3}(:\d{1,3}){0,2}(?:\.\d{1,3})/g
/** 是否本位三位小数（毫秒）写法 */
const MS_TIME_RXP = /\[\d{1,3}(:\d{1,3}){0,2}\.\d{3}]/
const OFFSET_TAG_RXP = /(?:^|\n)\s*\[offset:\s*([^\]]*)\s*\]/i
/** lxlrc 分词：在每个 `<start,duration>` 前切一刀 */
const WORD_SPLIT_RXP = /(?=<\d+,\d+>).*?/g
const WORD_TAG_RXP = /<(\d+),(\d+)>/
const WORD_TAG_ALL_RXP = /<(\d+),(\d+)>/g

interface ParsedLyric {
  offset: number
  /** key 是归一化后的时间标签，用来给「翻译」配对、也给同一时间去重 */
  lines: Map<string, { time: number, content: string }>
}

const parseOffset = (lyric: string): number => {
  const match = OFFSET_TAG_RXP.exec(lyric)
  if (!match) return 0
  const offset = parseInt(match[1].trim())
  return Number.isFinite(offset) ? offset : 0
}

/**
 * 上游用它给时间标签做归一化，以便「同一时间」能落到同一个 key 上。
 *（`00:01.00` 与 `0:1.0` 必须判为同一行，否则拼接歌词会长出重复行）
 */
const formatTimeLabel = (label: string): string => label
  .replace(/^0+(\d+)/, '$1')
  .replace(/:0+(\d+)/g, ':$1')
  .replace(/\.0+(\d+)/, '.$1')

const parseTimestamp = (label: string, isMsTime: boolean): number | null => {
  const parts = label.split(':')
  if (parts.length > 3) return null

  // 补齐到 h:m:s。注意是在**前面**补（0134 → 0:1:34），补完再拆小数位。
  while (parts.length < 3) parts.unshift('0')

  let msText = '0'
  if (parts[2].includes('.')) {
    const [sec, tail] = parts[2].split('.')
    parts[2] = sec
    msText = tail || '0'
  }

  const hour = parseInt(parts[0])
  const minute = parseInt(parts[1])
  const second = parseInt(parts[2])
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || !Number.isFinite(second)) return null

  // 厘秒写法要把 `.25` 补成 `.250`，毫秒写法直接按 ms 用
  const ms = parseInt(isMsTime ? msText : msText.padEnd(3, '0'))
  return hour * 3600_000 + minute * 60_000 + second * 1000 + (Number.isFinite(ms) ? ms : 0)
}

const parseLyric = (lyric: string | null): ParsedLyric => {
  const lines = new Map<string, { time: number, content: string }>()
  if (!lyric) return { offset: 0, lines }

  const offset = parseOffset(lyric)
  const isMsTime = MS_TIME_RXP.test(lyric)

  for (const rawLine of lyric.split(/\r\n|\r|\n/)) {
    const line = rawLine.trim()
    const field = TIME_FIELD_RXP.exec(line)
    if (!field) continue

    const content = line.slice(field[0].length).trim()
    // https://github.com/lyswhut/lx-music-desktop/issues/1499
    if (!content || content == '//') continue

    const labels = field[0].match(TIME_RXP)
    if (!labels) continue

    for (const label of labels) {
      const key = formatTimeLabel(label)
      // 同一时间重复出现：保留先到的一行
      if (lines.has(key)) continue
      const time = parseTimestamp(label, isMsTime)
      if (time == null) continue
      lines.set(key, { time, content })
    }
  }

  return { offset, lines }
}

const parseWords = (content: string, lineTime: number): ImmersiveLyricWord[] | null => {
  // 整行没有一个完整的 <start,duration> 就不算逐字 —— 半残的行宁可按整句显示
  if (!WORD_TAG_RXP.test(content)) return null

  const chunks = content.split(WORD_SPLIT_RXP).filter(chunk => chunk.length > 0)
  if (!chunks.length) return null

  const words: ImmersiveLyricWord[] = []
  for (const chunk of chunks) {
    const tag = WORD_TAG_RXP.exec(chunk)
    if (!tag) {
      // 行首偶尔有一段不带时间戳的前缀（例如作品后缀），挂在本行起点，时长给 0
      const text = chunk.trim()
      if (text) words.push({ text, start: lineTime, duration: 0 })
      continue
    }
    const text = chunk.replace(WORD_TAG_RXP, '')
    if (!text) continue
    const startMs = parseInt(tag[1])
    const durationMs = parseInt(tag[2])
    words.push({
      text,
      start: lineTime + (Number.isFinite(startMs) ? startMs : 0),
      duration: Number.isFinite(durationMs) ? durationMs : 0,
    })
  }

  return words.length ? words : null
}

const buildLines = (
  parsed: ParsedLyric,
  withWords: boolean,
  translation?: Map<string, string>,
): ImmersiveLyricLine[] => [...parsed.lines].map(([key, raw]) => {
  const time = raw.time + parsed.offset
  const words = withWords ? parseWords(raw.content, time) : null
  return {
    time,
    text: raw.content.replace(WORD_TAG_ALL_RXP, ''),
    words,
    translation: translation?.get(key) ?? null,
  }
}).sort((a, b) => a.time - b.time)

/**
 * 组装时间轴：lxlrc（逐字）优先，没有才退回 lrc（整句）。
 * 翻译永远从 tlrc 取，跟最终采用哪一版正文无关。
 */
export const buildLyricTimeline = (lyricInfo: {
  lrc?: string | null
  lxlrc?: string | null
  tlrc?: string | null
}): ImmersiveLyricTimeline => {
  const translationParsed = parseLyric(lyricInfo.tlrc ?? null)
  const translationById = new Map<string, string>()
  for (const [key, raw] of translationParsed.lines) translationById.set(key, raw.content)

  const lxlrcParsed = parseLyric(lyricInfo.lxlrc ?? null)
  if (lxlrcParsed.lines.size) {
    const lines = buildLines(lxlrcParsed, true, translationById)
    return {
      lines,
      offset: lxlrcParsed.offset,
      hasWordTiming: lines.some(line => line.words),
      source: 'lxlrc',
    }
  }

  const lrcParsed = parseLyric(lyricInfo.lrc ?? null)
  if (lrcParsed.lines.size) {
    return {
      lines: buildLines(lrcParsed, false, translationById),
      offset: lrcParsed.offset,
      hasWordTiming: false,
      source: 'lrc',
    }
  }

  return { lines: [], offset: 0, hasWordTiming: false, source: 'none' }
}

/**
 * 找到当前应该高亮的行。
 * 返回 -1 表示「还没唱到第一行」（前奏），界面据此不高亮任何一行。
 */
export const findActiveLineIndex = (lines: ImmersiveLyricLine[], timeMs: number): number => {
  if (!lines.length) return -1
  if (timeMs < lines[0].time) return -1

  let left = 0
  let right = lines.length - 1
  let result = 0
  while (left <= right) {
    const mid = (left + right) >> 1
    if (lines[mid].time <= timeMs) {
      result = mid
      left = mid + 1
    } else {
      right = mid - 1
    }
  }
  return result
}

export type WordState = 'done' | 'active' | 'todo'

export const getWordState = (word: ImmersiveLyricWord, timeMs: number): WordState => {
  if (timeMs >= word.start + word.duration) return 'done'
  if (timeMs >= word.start) return 'active'
  return 'todo'
}
