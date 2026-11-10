import type { Line, LyricData, Word } from '../types';
import { migrateLyricDataRenderHints } from '../utils/lyrics/renderHints';

// Lab enhanced-LRC parser.
//
// 输入是增强型 LRC：
//   [mm:ss.xx] <mm:ss.xx>逐<mm:ss.xx>字 ...   ← 标签在前（LX 逐字歌词 / demo 用这个）
//   [mm:ss.xx] 逐<mm:ss.xx>字<mm:ss.xx>       ← 标签在后（旧方言，兼容）
//   [mm:ss.xx] 没有逐字标签的行按整行计时（渲染引擎会用字素时间轴均匀铺开）
//   #chorus          下一行标记为副歌（Line.isChorus）
//   #tr ...          上一行的译文
//   #rom ...         上一行的罗马音
//
// 输出直接就是 lattice 歌词引擎消费的 Line[]（words 带 startTime/endTime）。
//
// 注意：LX 的 lxlrc 是 `<startMs,durMs>字`（标签在字前面），FoliaStage 转成
// `<mm:ss.xx>字`。以前这里按「标签在字后面」解析，结果每个字拿到的都是下一个字
// 的时间、最后一个字被倒回行首 —— 逐字动画整体错位，看上去就是「歌词跟实时对不上」。

const WORD_TAG_SOURCE = '<(\\d{1,2}):(\\d{1,2}(?:\\.\\d{1,3})?)>';
const WORD_TAG = new RegExp(WORD_TAG_SOURCE, 'g');
const STRIP_WORD_TAGS = new RegExp(WORD_TAG_SOURCE, 'g');

const toSeconds = (minutes: string, seconds: string) => Number(minutes) * 60 + Number(seconds);

/** 最短一行时长。避免同一时间戳的行互相把 endTime 压成 0（活动行瞬间失效）。 */
const MIN_LINE_DURATION = 0.12;
/** 逐字行最后一个字的兜底时长。 */
const LAST_WORD_DURATION = 0.4;

// LRC 文件头常见的制作信息，不是歌词。它们通常全部堆在 [00:00.00]，
// 不去掉的话前奏十几秒画面上会一直挂着「词：/ 曲：/ 伴唱：」而不是歌词。
const CREDIT_PREFIX = /^(?:词|曲|作词|作曲|编曲|演唱|歌手|歌名|曲名|专辑|伴唱|和声|和音|录音|录音室|录音师|混音|混音室|混音师|母带|母带录音室|母带处理|母带师|后期|后期制作|制作|制作人|制作助理|监制|出品|出品方|发行|发行方|企划|统筹|宣传|版权|版权所有|封面|视觉|摄影|特别鸣谢|鸣谢|吉他|贝斯|鼓|键盘|弦乐|电吉他|木吉他|原唱|翻唱|歌词|歌词上传|乐器|LRC|OP|SP|Music|Lyrics|Lyricist|Composer|Arranger|Arrangement|Producer|Guitar|Bass|Drums|Drum|Mix|Mixed|Mixing|Mixing Engineer|Mastered|Mastering|Vocal|Vocals|Electric guitar|Acoustic guitar|Recorder|Recording|Recording Studio|Recorded at|Mixed at|Mastered at|Engineer|Studio|Programming|Program)\s*[:：]/i;

const isCreditLine = (text: string, startTime: number, ordinal: number): boolean => {
    if (CREDIT_PREFIX.test(text)) return true;
    if (/^\/\/|^\s*[-=—·•]+\s*$|^♪+$/.test(text)) return true;
    if (startTime < 20 && ordinal < 12) {
        if (/^.{0,8}(?:室|师|工作室|团队|组)\s*[:：]/.test(text)) return true;
        if (/著作权|版权所有|未经许可|仅供|试听|QQ音乐|网易云|酷狗|酷我|虾米|翻译作品|歌词翻译|翻译：|译：/i.test(text)) return true;
        // 「歌名 - 歌手」头信息（含较长的英文名），只在开头几行过滤，避免误伤正文。
        if (startTime < 12 && ordinal < 6 && text.length < 80 && /\s[-–—]\s/.test(text)) return true;
    }
    return false;
};

/** 把一行正文切成 (词, 起, 止)。自动识别标签在前 / 标签在后两种方言。 */
const splitWords = (body: string, startTime: number, lineEnd: number): Word[] => {
    const matches = [...body.matchAll(WORD_TAG)];
    if (matches.length === 0) return [];

    const tagFirst = body.trimStart().startsWith('<');
    const words: Word[] = [];

    if (tagFirst) {
        // <t0>字0<t1>字1 …… 每个标签是它后面那个字的开始时间。
        for (let index = 0; index < matches.length; index += 1) {
            const match = matches[index];
            const from = (match.index ?? 0) + match[0].length;
            const to = index + 1 < matches.length ? (matches[index + 1].index ?? body.length) : body.length;
            const text = body.slice(from, to).trim();
            if (!text) continue;
            const wordStart = Math.max(startTime, toSeconds(match[1], match[2]));
            const next = matches[index + 1];
            const wordEnd = next ? toSeconds(next[1], next[2]) : Math.max(lineEnd, wordStart + LAST_WORD_DURATION);
            words.push({ text, startTime: wordStart, endTime: Math.max(wordStart, wordEnd) });
        }
    } else {
        // 字0<t1>字1<t2> …… 标签是它前面那个字的结束时间。
        let cursor = 0;
        let wordStart = startTime;
        for (const match of matches) {
            const at = match.index ?? body.length;
            const text = body.slice(cursor, at).trim();
            const wordEnd = toSeconds(match[1], match[2]);
            if (text) words.push({ text, startTime: wordStart, endTime: Math.max(wordStart, wordEnd) });
            cursor = at + match[0].length;
            wordStart = wordEnd;
        }
        const tail = body.slice(cursor).trim();
        if (tail) words.push({ text: tail, startTime: wordStart, endTime: Math.max(lineEnd, wordStart + LAST_WORD_DURATION) });
    }

    return words;
};

export interface ParsedLyricResult {
    lines: Line[];
    title?: string;
    artist?: string;
}

export function parseEnhancedLrc(source: string): ParsedLyricResult {
    const lines: Line[] = [];
    let title: string | undefined;
    let artist: string | undefined;
    let pendingChorus = false;
    let ordinal = 0;

    for (const rawLine of source.split(/\r?\n/)) {
        const text = rawLine.trim();
        if (!text) continue;

        if (text.startsWith('#chorus')) { pendingChorus = true; continue; }
        if (text.startsWith('#tr ') || text.startsWith('#rom ')) {
            const value = text.slice(4).trim();
            const previous = lines[lines.length - 1];
            if (previous) {
                if (text.startsWith('#tr ')) previous.translation = value;
                else previous.romanization = value;
            }
            continue;
        }

        const idMatch = text.match(/^\[(ti|ar):(.*)\]$/i);
        if (idMatch) {
            if (idMatch[1].toLowerCase() === 'ti') title = idMatch[2].trim();
            else artist = idMatch[2].trim();
            continue;
        }

        const stampMatch = text.match(/^\[(\d{1,2}):(\d{1,2}(?:\.\d{1,3})?)\]\s*(.*)$/);
        if (!stampMatch) continue;

        const startTime = toSeconds(stampMatch[1], stampMatch[2]);
        const body = stampMatch[3];
        if (!body) continue;
        if (isCreditLine(body.replace(STRIP_WORD_TAGS, '').trim(), startTime, ordinal)) { ordinal += 1; continue; }

        // fullText 直接取剥掉时间标签后的原文：中文逐字歌词不该在字与字之间插空格。
        const fullText = body.replace(STRIP_WORD_TAGS, '').trim() || body;
        const nominalEnd = Math.max(startTime + 2, startTime + LAST_WORD_DURATION);
        const words = splitWords(body, startTime, nominalEnd);
        const wordEnd = words.length > 1 ? words[words.length - 1].endTime : nominalEnd;

        lines.push({
            words: words.length > 1 ? words : [],
            startTime,
            endTime: Math.max(startTime + MIN_LINE_DURATION, wordEnd),
            fullText,
            ...(pendingChorus ? { isChorus: true } : {}),
        });
        pendingChorus = false;
        ordinal += 1;
    }

    // 同一时间戳的多行（LRC 常见的合唱/双行、重复头信息）合并为一行，
    // 否则「收尾对齐下一行」会把它们全部压成零时长，活动行计算直接失效。
    const merged: Line[] = [];
    for (const line of lines) {
        const previous = merged[merged.length - 1];
        if (previous && Math.abs(previous.startTime - line.startTime) < 0.001) {
            previous.fullText = `${previous.fullText} ${line.fullText}`.trim();
            previous.endTime = Math.max(previous.endTime, line.endTime);
            if (line.translation) previous.translation = previous.translation ? `${previous.translation} / ${line.translation}` : line.translation;
            if (line.romanization) previous.romanization = previous.romanization ? `${previous.romanization} / ${line.romanization}` : line.romanization;
            previous.isChorus = Boolean(previous.isChorus || line.isChorus);
            continue;
        }
        merged.push({ ...line });
    }

    // 收尾对齐下一行，但保住一个最小可见时长；下一行几乎同时开始时不再裁剪。
    for (let index = 0; index < merged.length; index += 1) {
        const line = merged[index];
        const next = merged[index + 1];
        let end = Math.max(line.endTime, line.startTime + MIN_LINE_DURATION);
        if (next && next.startTime > line.startTime + 0.04) {
            end = Math.max(line.startTime + 0.04, Math.min(end, next.startTime));
        }
        line.endTime = end;
    }

    return { lines: merged, title, artist };
}

export function toLyricData(result: ParsedLyricResult): LyricData {
    return migrateLyricDataRenderHints({
        lines: result.lines,
        ...(result.title ? { title: result.title } : {}),
        ...(result.artist ? { artist: result.artist } : {}),
        isWordByWord: result.lines.some(line => line.words.length > 1),
    }).value;
}
