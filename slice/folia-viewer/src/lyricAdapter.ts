// 歌词适配（计划 P2 的 P1 最小版）：LX 歌词文本 → 切片的 Line[] 模型。
//
// 数据优先级（桥白名单已有 lyric / tlyric / lxlyric 三个字段）：
//   1. lxlyric（LX 逐字格式：[mm:ss.xx]<startMs,durationMs>词，ms 相对行首）
//      —— 词级时间是扫光精度的来源，优先用它；
//   2. lyric 若本身带 <start,duration> 标记（enhanced LRC / awlrc）同上解析；
//   3. 只有行级 LRC：整行作为一个 Word，时长到下一行行首为止。
// 翻译：tlyric 按时间戳就近对齐到主歌词行（容差内取最近一行），
// 行数相等时天然一一对应，不造假 —— 对不齐就不挂。
//
// 切片 Line 的时间单位是**秒**（startTime/endTime），Word 同。
// 字素级（grapheme）切分由切片内部的 graphemeTiming 处理，适配层只给词级。

import type { Line, Word } from '../../lattice-lyrics/src/types';

interface RawLine {
  startSec: number;
  /** 行内词段（相对行首的毫秒偏移）；无词段时为 null（整行） */
  segments: { startMs: number; durationMs: number; text: string }[] | null;
  /** 去标记后的纯文本 */
  text: string;
}

const TIME_TAG = /\[(\d+):(\d{1,2})(?:\.(\d{1,3}))?\]/g;
const SEGMENT = /<(\d+),(\d+)>/g;

const parseTimeTag = (m: RegExpExecArray): number => {
  const min = Number(m[1]);
  const sec = Number(m[2]);
  const frac = m[3] ? Number(m[3].padEnd(3, '0')) / 1000 : 0;
  return min * 60 + sec + frac;
};

/** 解析一个歌词文本为原始行（支持一行多时间标签 → 复制为多行）。 */
const parseRawLines = (content: string): RawLine[] => {
  const out: RawLine[] = [];
  if (!content) return out;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const tags: number[] = [];
    let m: RegExpExecArray | null;
    TIME_TAG.lastIndex = 0;
    while ((m = TIME_TAG.exec(line)) !== null) tags.push(parseTimeTag(m));
    if (!tags.length) continue; // 元信息行（[ti:]/[ar:] 等）跳过
    const body = line.replace(TIME_TAG, '');

    // 词段解析：<start,dur>text<start,dur>text…
    let segments: RawLine['segments'] = null;
    let plain = body;
    if (/<\d+,\d+>/.test(body)) {
      const segs: NonNullable<RawLine['segments']> = [];
      const parts = body.split(SEGMENT);
      // split 结果：[前缀, start1, dur1, 文本1, start2, dur2, 文本2, ...]
      for (let i = 1; i + 2 < parts.length + 1 && i < parts.length; i += 3) {
        const text = parts[i + 2] ?? '';
        segs.push({ startMs: Number(parts[i]), durationMs: Number(parts[i + 1]), text });
      }
      if (segs.length) {
        segments = segs;
        plain = segs.map((s) => s.text).join('');
      }
    }
    for (const startSec of tags) out.push({ startSec, segments, text: plain });
  }
  out.sort((a, b) => a.startSec - b.startSec);
  return out;
};

const rawToLines = (raw: RawLine[], durationSec: number): Line[] => {
  return raw.map((line, i) => {
    const nextStart = i + 1 < raw.length ? raw[i + 1].startSec : 0;
    const lineEnd = nextStart > line.startSec
      ? nextStart
      : (durationSec > line.startSec ? durationSec : line.startSec + 5);
    let words: Word[];
    if (line.segments?.length) {
      words = line.segments
        .filter((s) => s.text.length > 0)
        .map((s) => ({
          text: s.text,
          startTime: line.startSec + s.startMs / 1000,
          endTime: line.startSec + (s.startMs + s.durationMs) / 1000,
        }));
      if (!words.length) words = [{ text: line.text, startTime: line.startSec, endTime: lineEnd }];
    } else {
      words = [{ text: line.text, startTime: line.startSec, endTime: lineEnd }];
    }
    return {
      words,
      startTime: line.startSec,
      endTime: Math.max(lineEnd, words.length ? words[words.length - 1].endTime : lineEnd),
      fullText: line.text,
    };
  });
};

/** 把翻译行按时间戳就近挂到主行（容差 1.5s 内取最近者；同一翻译行只用一次）。 */
const attachTranslations = (lines: Line[], tRaw: RawLine[]): void => {
  if (!lines.length || !tRaw.length) return;
  const used = new Set<number>();
  for (const line of lines) {
    let best = -1;
    let bestDelta = 1.5;
    tRaw.forEach((t, idx) => {
      if (used.has(idx)) return;
      const delta = Math.abs(t.startSec - line.startTime);
      if (delta < bestDelta) { bestDelta = delta; best = idx; }
    });
    if (best >= 0 && tRaw[best].text) {
      line.translation = tRaw[best].text;
      used.add(best);
    }
  }
};

export interface AdaptedLyrics {
  lines: Line[];
  /** 是否用到了逐字时间（lxlyric / enhanced LRC） */
  wordByWord: boolean;
}

/**
 * 主入口：lxlyric 优先，其次 lyric 本身；tlyric 对齐为 translation。
 */
export const adaptLyrics = (input: { lyric: string; tlyric: string; lxlyric: string; durationSec: number }): AdaptedLyrics => {
  const fromLx = input.lxlyric ? parseRawLines(input.lxlyric) : [];
  const wordSource = fromLx.length ? fromLx : parseRawLines(input.lyric ?? '');
  const wordByWord = wordSource.some((l) => l.segments?.length);
  const lines = rawToLines(wordSource, input.durationSec);
  if (input.tlyric) attachTranslations(lines, parseRawLines(input.tlyric));
  return { lines, wordByWord };
};

/** 在 lines 中找当前行（从后往前，最后一个 startTime <= t 的行）。 */
export const findCurrentLineIndex = (lines: Line[], timeSec: number): number => {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (timeSec >= lines[i].startTime) return i;
  }
  return lines.length ? 0 : -1;
};
