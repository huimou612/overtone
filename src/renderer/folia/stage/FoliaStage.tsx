import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motionValue } from 'framer-motion';
import { ArrowLeft, Pause, Play, Settings2, SkipBack, SkipForward } from 'lucide-react';
import VisualizerRenderer from '@/components/visualizer/VisualizerRenderer';
import { useVisualizerBackgroundConfig } from '@/components/visualizer/useVisualizerBackgroundConfig';
import { useVisualizerTunings } from '@/components/visualizer/useVisualizerTunings';
import { useVisualizerSettingsStore } from '@/stores/useVisualizerSettingsStore';
import { audioBands, audioPower, lyricCurrentTime } from '@/stores/motionSignals';
import type { LyricData, Theme } from '@/types';
import { FOLIA_VISUALIZER_MODES } from '@/lab/foliaModes';
import { useActiveLineIndex } from '@/lab/useActiveLineIndex';
import { parseEnhancedLrc, toLyricData } from '@/lab/enhancedLrc';
import VisPlayground from '@/components/visualizer/window/VisPlayground';
import { PlaygroundBoundary } from './FoliaErrorBoundary';
import ProgressBar from '@/components/ProgressBar';
import LatticeChromeTime from '@/components/app/lattice/LatticeChromeTime';
import { backgroundTuningConfig } from '@/components/visualizer/tuningRegistry';
import { selectVisualizerSettingsSnapshot } from '@/stores/useVisualizerSettingsStore';
import { hasWebGL, resolveMode, resolveBackgroundMode, isModeAvailable } from './webglSupport';
import { DEFAULT_VISUALIZER_BACKGROUND_MODE } from '@/types/visualizerModes';
import { selectTypographySettingsSnapshot } from '@/stores/useTypographySettingsStore';
import { selectVisualizerAssetSnapshot } from '@/stores/useVisualizerAssetStore';
import { useShallow } from 'zustand/react/shallow';
import { useTypographySettingsStore } from '@/stores/useTypographySettingsStore';
import { useVisualizerAssetStore } from '@/stores/useVisualizerAssetStore';
import { useThemeSettingsStore } from '@/stores/useThemeSettingsStore';
import { usePlayerChromeSettingsStore } from '@/stores/usePlayerChromeSettingsStore';

// Overtone host imports: the React island reads the host's own single source of truth.
import { musicInfo, isPlay } from '@renderer/store/player/state';
import { themeShouldUseDarkColors } from '@renderer/store';
import { getAnalyser, getAudioContext, getCurrentTime, getDuration, setCurrentTime } from '@renderer/plugins/player';
import { togglePlay, playNext, playPrev } from '@renderer/core/player/action';

import '@/folia.css';
import '@/folia-lab.css';

// ── LX lyric text → folia enhanced-LRC text ─────────────────────────────
// folia's parser understands `[mm:ss.xx] <mm:ss.xx>字 …` word tags plus
// `#tr …` translation lines. LX stores word timings as `<startMs,durMs>字`
// (ms relative to the line) and translations in a separate tlrc, so both get
// converted into the dialect above before parsing.

const padTime = (value: number, length = 2) => String(Math.floor(value)).padStart(length, '0');

const formatTag = (ms: number) => {
  const safe = Math.max(0, Math.round(ms));
  const minutes = Math.floor(safe / 60000);
  const seconds = Math.floor((safe % 60000) / 1000);
  const hundredths = Math.floor((safe % 1000) / 10);
  return `${padTime(minutes)}:${padTime(seconds)}.${padTime(hundredths)}`;
};

const parseLrcTimestamp = (stamp: string): number | null => {
  const match = stamp.match(/(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?/);
  if (!match) return null;
  return Number(match[1]) * 60000 + Number(match[2]) * 1000 + Number((match[3] ?? '0').padEnd(3, '0').slice(0, 3));
};

const parseLrcLines = (source: string): Array<{ time: number; text: string }> => {
  const out: Array<{ time: number; text: string }> = [];
  for (const raw of source.split('\n')) {
    const stamps = raw.match(/\[\d{1,2}:\d{1,2}(?:\.\d{1,3})?\]/g);
    if (!stamps) continue;
    const text = raw.replace(/\[\d{1,2}:\d{1,2}(?:\.\d{1,3})?\]/g, '').trim();
    for (const stamp of stamps) {
      const time = parseLrcTimestamp(stamp);
      if (time !== null) out.push({ time, text });
    }
  }
  return out.sort((a, b) => a.time - b.time);
};

/** LX 逐字 (`<start,dur>字`, ms relative to line start) → folia word tags (absolute). */
const convertLxlyric = (lxlrc: string): string => {
  const out: string[] = [];
  for (const raw of lxlrc.split('\n')) {
    const head = raw.match(/^\s*\[(\d{1,2}:\d{1,2}(?:\.\d{1,3})?)\]/);
    if (!head) continue;
    const lineStart = parseLrcTimestamp(head[1]) ?? 0;
    const body = raw.slice(head[0].length);
    const wordTags = [...body.matchAll(/<(\d+),(\d+)[^>]*>([^<]*)/g)];
    if (wordTags.length === 0) {
      out.push(`[${head[1]}]${body}`);
      continue;
    }
    const words = wordTags.map(tag => `<${formatTag(lineStart + Number(tag[1]))}>${tag[3] ?? ''}`).join('');
    out.push(`[${head[1]}]${words}`);
  }
  return out.join('\n');
};

/** Merge a translation LRC into the main LRC as `#tr …` lines (±0.6s match). */
const mergeTranslation = (lrc: string, tlrc: string | null): string => {
  if (!tlrc) return lrc;
  const translations = parseLrcLines(tlrc).filter(entry => entry.text);
  if (translations.length === 0) return lrc;
  const findTranslation = (time: number): string | null => {
    let best: { time: number; text: string } | null = null;
    for (const entry of translations) {
      if (entry.time > time + 600) break;
      if (best === null || Math.abs(entry.time - time) < Math.abs(best.time - time)) best = entry;
    }
    return best && Math.abs(best.time - time) <= 600 ? best.text : null;
  };
  const out: string[] = [];
  for (const raw of lrc.split('\n')) {
    const head = raw.match(/^\s*\[(\d{1,2}:\d{1,2}(?:\.\d{1,3})?)\]/);
    if (!head) { out.push(raw); continue; }
    out.push(raw);
    const time = parseLrcTimestamp(head[1]);
    if (time === null) continue;
    const text = findTranslation(time);
    if (text) out.push(`#tr ${text}`);
  }
  return out.join('\n');
};

// 宿主每帧都会调用 readHostMeta()。如果这里每次都 new 一个 LyricData，lines 的引用
// 每帧都变，FoliaStage 就会 60fps 重渲染，各样式基于 lines 准备的排版/逐字动画会被
// 反复重置 —— 表现就是「歌词跟不上播放时间」。所以按歌词源字符串缓存，只有换歌或
// 歌词加载完成时才重新解析。
let cachedLrc: string | null = null;
let cachedLxlrc = '';
let cachedTlrc: string | null = null;
let cachedRealLyrics: LyricData | null = null;

const buildLyrics = (): LyricData | null => {
  const lrc = musicInfo.lrc ?? null;
  const lxlrc = musicInfo.lxlrc ?? '';
  const tlrc = musicInfo.tlrc ?? null;
  if (lrc === cachedLrc && lxlrc === cachedLxlrc && tlrc === cachedTlrc) return cachedRealLyrics;
  cachedLrc = lrc;
  cachedLxlrc = lxlrc;
  cachedTlrc = tlrc;
  if (!lrc) {
    cachedRealLyrics = null;
    return null;
  }
  const source = mergeTranslation(lxlrc ? convertLxlyric(lxlrc) : lrc, tlrc);
  cachedRealLyrics = toLyricData(parseEnhancedLrc(source));
  return cachedRealLyrics;
};

// ── Audio bridge: AnalyserNode → folia motion signals ───────────────────
// A dedicated 2048-point analyser is tapped off Overtone's existing analyser
// (fan-out: analysers pass audio through, so the host's own spectrum keeps
// working). Bands follow folia's AudioBands contract: floats 0..1 plus a
// 1024-bin Uint8 spectrum.

const SPECTRUM_BINS = 1024;
const smooth = (previous: number, next: number, dt: number, speed: number) =>
  previous + (next - previous) * Math.min(1, dt * speed);

type BandRange = [number, number];
const BAND_RANGES: Record<'bass' | 'lowMid' | 'mid' | 'vocal' | 'treble', BandRange> = {
  bass: [20, 250],
  lowMid: [250, 500],
  mid: [500, 2000],
  vocal: [2000, 4000],
  treble: [4000, 16000],
};

let tapAnalyser: AnalyserNode | null = null;
let spectrumBuffer = new Uint8Array(SPECTRUM_BINS);
let smoothed: Record<keyof typeof BAND_RANGES, number> = { bass: 0, lowMid: 0, mid: 0, vocal: 0, treble: 0 };

const ensureTap = (): AnalyserNode | null => {
  if (tapAnalyser) return tapAnalyser;
  try {
    const context = getAudioContext();
    const base = getAnalyser();
    if (!context || !base) return null;
    const tap = context.createAnalyser();
    tap.fftSize = 2048;
    tap.smoothingTimeConstant = 0.78;
    base.connect(tap);
    spectrumBuffer = new Uint8Array(tap.frequencyBinCount);
    tapAnalyser = tap;
  } catch {
    // No audio element yet (nothing has played); retry on later frames.
  }
  return tapAnalyser;
};

/** getAudioContext throws before the first playback; the bridge only wants a rate. */
const hostSampleRate = (): number => {
  try {
    return getAudioContext()?.sampleRate ?? 44100;
  } catch {
    return 44100;
  }
};

const readAudioFrame = (dt: number, playing: boolean) => {
  const tap = playing ? ensureTap() : tapAnalyser;
  if (!tap || !playing) {
    audioPower.set(smooth(audioPower.get(), 0, dt, 12));
    return;
  }
  tap.getByteFrequencyData(spectrumBuffer as Uint8Array<ArrayBuffer>);
  const nyquist = hostSampleRate() / 2;
  const hzPerBin = nyquist / spectrumBuffer.length;
  let weighted = 0;
  for (const [key, [low, high]] of Object.entries(BAND_RANGES) as Array<[keyof typeof BAND_RANGES, BandRange]>) {
    const from = Math.max(0, Math.floor(low / hzPerBin));
    const to = Math.min(spectrumBuffer.length - 1, Math.max(from + 1, Math.ceil(high / hzPerBin)));
    let sum = 0;
    for (let i = from; i <= to; i += 1) sum += spectrumBuffer[i]!;
    const level = Math.min(1, (sum / (to - from + 1)) / 200);
    smoothed[key] = smooth(smoothed[key]!, level, dt, key === 'bass' ? 10 : 8);
    weighted += smoothed[key]!;
    audioBands[key].set(smoothed[key]!);
  }
  audioPower.set(smooth(audioPower.get(), Math.min(1, weighted / 2.2), dt, 12));
  if (audioBands.spectrum) {
    const spectrum = new Uint8Array(SPECTRUM_BINS);
    const scale = (spectrumBuffer.length - 1) / (SPECTRUM_BINS - 1);
    for (let i = 0; i < SPECTRUM_BINS; i += 1) {
      const origin = Math.round(i * scale);
      spectrum[i] = spectrumBuffer[origin] ?? 0;
    }
    audioBands.spectrum.set(spectrum);
  }
};

// ── Theme ────────────────────────────────────────────────────────────────
const readTheme = (isDaylight: boolean): Theme => {
  const css = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    name: 'Overtone Host Theme',
    backgroundColor: isDaylight ? read('--color-100', '#f4f1ea') : read('--color-900', '#0c0c10'),
    primaryColor: isDaylight ? read('--color-primary-100-100', '#18181b') : read('--color-primary-100-100', '#f4f4f5'),
    accentColor: read('--color-primary', isDaylight ? '#52525b' : '#a1a1aa'),
    secondaryColor: read('--color-primary-light-100-alpha-600', isDaylight ? '#71717a' : '#71717a'),
    fontStyle: 'sans',
    animationIntensity: 'normal',
  };
};

// Progress readout feeds the same MotionValue contract the folia chrome expects.
const progressTime = motionValue(0);

interface HostMeta {
  name: string;
  singer: string;
  album: string;
  pic: string | null;
  duration: number;
  playing: boolean;
  lyrics: LyricData | null;
}


// ── Demo fallback ───────────────────────────────────────────────────────
// `window.__overtoneFoliaDemo = true` (dev only) lets the overlay be previewed
// before anything is playing: it feeds a short word-timed sample lyric and a
// synthetic clock, so every mode has something to draw.

const DEMO_LRC = [
    '[00:00.00]<00:00.00>We<00:00.35>ave<00:00.70> the<00:01.05> light<00:01.45>',
    '[00:02.20]<00:02.20>thread<00:02.55>ed<00:02.90> through<00:03.25> the<00:03.60> dark<00:04.00>',
    '[00:05.00]<00:05.00>fol<00:05.30>ia<00:05.70> —<00:05.95> a<00:06.15> song<00:06.55> that<00:06.95> stays<00:07.45>',
    '[00:08.20]<00:08.20>when<00:08.55> ev<00:08.85>ery<00:09.20>thing<00:09.60> fades<00:10.10>',
].join('\n');

const isDemo = () => Boolean((window as unknown as { __overtoneFoliaDemo?: boolean }).__overtoneFoliaDemo);

const DEMO_DURATION = 12;
let cachedDemoLyrics: LyricData | null = null;
const demoLyrics = (): LyricData =>
    (cachedDemoLyrics ??= toLyricData(parseEnhancedLrc(DEMO_LRC)));

// 只有「真的没有歌词」才用样例歌词 + 合成时钟。以前暂停时也会切到演示歌词，
// 于是暂停/播放切换的瞬间歌词会跳到别的位置，看起来就是「跟实时对不上」。
// 有真实歌词时，无论播放还是暂停都跟着宿主的 currentTime（暂停即定格在正确行）。
const demoFromMeta = (meta: HostMeta | null): boolean =>
    isDemo() || !meta?.lyrics?.lines?.length;

// 宿主「音效」面板里的时间轴偏移（正数=歌词提前），由 LatticeLyric 写到这个全局量。
const hostLyricOffsetSec = (): number => {
  const ms = (window as unknown as { __overtoneLyricOffsetMs?: number }).__overtoneLyricOffsetMs;
  return typeof ms === 'number' && Number.isFinite(ms) ? ms / 1000 : 0;
};

const readHostMeta = (): HostMeta => {
  const real = buildLyrics();
  const demo = demoFromMeta({ lyrics: real } as HostMeta);
  const realDuration = getDuration() || 0;
  return {
    name: demo && !musicInfo.name ? 'Folia 演示' : (musicInfo.name ?? ''),
    singer: demo && !musicInfo.name ? 'Overtone' : (musicInfo.singer ?? ''),
    album: demo && !musicInfo.name ? 'Visualizer Preview' : (musicInfo.album ?? ''),
    pic: musicInfo.pic ?? null,
    duration: demo ? DEMO_DURATION : realDuration,
    playing: demo || isPlay.value,
    lyrics: demo ? demoLyrics() : real,
  };
};

// ── Stage ────────────────────────────────────────────────────────────────

export default function FoliaStage({ onClose, embedded = false }: { onClose: () => void; embedded?: boolean }) {
  const visualizer = useVisualizerSettingsStore(useShallow(selectVisualizerSettingsSnapshot));
  const typography = useTypographySettingsStore(useShallow(selectTypographySettingsSnapshot));
  const asset = useVisualizerAssetStore(useShallow(selectVisualizerAssetSnapshot));
  const useCoverColorBg = useThemeSettingsStore(state => state.useCoverColorBg);
  const setUseCoverColorBg = useThemeSettingsStore(state => state.setUseCoverColorBg);
  const staticMode = useThemeSettingsStore(state => state.staticMode);
  const transparentPlayerBackground = usePlayerChromeSettingsStore(state => state.transparentPlayerBackground);

  const [isDaylight, setIsDaylight] = useState(!themeShouldUseDarkColors.value);
  const [meta, setMeta] = useState<HostMeta>(() => readHostMeta());
  const [showPicker, setShowPicker] = useState(true);
  const [playgroundOpen, setPlaygroundOpen] = useState(false);
  const [progress, setProgress] = useState({ now: 0, total: 0 });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const embeddedRef = useRef(embedded);
  embeddedRef.current = embedded;

  // Folia 的 15 种样式都是按「整屏视口」设计的：大量 vw / vh 和固定的大字排版。
  // 嵌入到歌词区（只有 ~690×520）时，莫奈的左栏歌词、凝彩的大字都会被裁到画面外。
  // 这里给嵌入层一个「虚拟视口」＝真实窗口大小，再整体缩放铺进歌词区，
  // 于是所有 vw/vh 仍按设计值计算，但渲染尺寸正好对齐容器，不会溢出。
  const [fit, setFit] = useState<{ width: number; height: number; sx: number; sy: number } | null>(null);
  useLayoutEffect(() => {
    if (!embedded) return;
    const node = rootRef.current;
    const host = node?.parentElement;
    if (!node || !host) return;
    const measure = () => {
      const rect = host.getBoundingClientRect();
      const vw = window.innerWidth || 1024;
      const vh = window.innerHeight || 720;
      if (!rect.width || !rect.height) return;
      // 用户可在「背景 → 布局与对齐」里切回原始尺寸（不缩放）。
      const fitEnabled = (window as unknown as { __overtoneFoliaFit?: boolean }).__overtoneFoliaFit !== false;
      const next = fitEnabled
        ? { width: vw, height: vh, sx: rect.width / vw, sy: rect.height / vh }
        : { width: Math.round(rect.width), height: Math.round(rect.height), sx: 1, sy: 1 };
      setFit(current => (
        current && current.width === next.width && current.height === next.height
        && Math.abs(current.sx - next.sx) < 0.001 && Math.abs(current.sy - next.sy) < 0.001
          ? current : next
      ));
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(host);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [embedded]);

  const rawBackground = useVisualizerBackgroundConfig();
  const tunings = useVisualizerTunings();

  // Chromium 可能被策略/启动参数禁用 WebGL。此时 3D / shader / pixi 样式在
  // render 阶段直接抛异常，会把整棵 React 树清空并留下一个吃掉点击的空壳。
  // 这里在渲染前把模式与背景收敛到 DOM-only 的兼容组合；ErrorBoundary 再兜底。
  const webglAvailable = useMemo(() => hasWebGL(), []);
  const effectiveMode = useMemo(
    () => resolveMode(visualizer.visualizerMode),
    [visualizer.visualizerMode],
  );
  const effectiveBackgroundMode = useMemo(
    () => resolveBackgroundMode(visualizer.visualizerBackgroundMode ?? DEFAULT_VISUALIZER_BACKGROUND_MODE),
    [visualizer.visualizerBackgroundMode],
  );
  // 注意：不能给嵌入形态塞 transparent:true —— VisualizerBackgroundRenderer 看到它
  // 会直接 return null，六种 Folia 背景（通用/莫奈/漫游/隐现/嵌入/空）全部不绘制，
  // 这正是「泛音的背景写的不行了」的根因。覆盖层自身用 CSS 保持透明即可。
  const background = useMemo(
    () => ({ ...rawBackground, mode: effectiveBackgroundMode }),
    [rawBackground, effectiveBackgroundMode],
  );
  const lines = useMemo(() => meta.lyrics?.lines ?? [], [meta.lyrics]);
  const currentLineIndex = useActiveLineIndex(lyricCurrentTime, lines);

  // 正式版也保留一个只读诊断快照：CDP 里能直接核对「播放时间 / 活动行 / 歌词文本」，
  // 不用再靠猜哪个视觉样式没画字。
  const debugLinesRef = useRef(lines);
  debugLinesRef.current = lines;
  const debugIndexRef = useRef(currentLineIndex);
  debugIndexRef.current = currentLineIndex;

  // One rAF loop drives everything the host does not push: the clocks, the
  // spectrum, and change-detection for the (reactive, but non-React) host store.
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const daylightRef = useRef(isDaylight);
  daylightRef.current = isDaylight;

  useEffect(() => {
    let frame = 0;
    let last = 0;
    let lastDebug = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;

      const demo = demoFromMeta(metaRef.current);
      // 真实歌词一律跟宿主播放器时间（同 Lattice 的时间轴偏移），暂停时自然定格；
      // 只有没有歌词的演示态才用合成时钟驱动逐字动画。
      const seconds = demo
        ? (performance.now() / 1000) % DEMO_DURATION
        : Math.max(0, getCurrentTime() - hostLyricOffsetSec());
      lyricCurrentTime.set(seconds);
      progressTime.set(seconds);

      if (now - lastDebug > 250) {
        lastDebug = now;
        const snapshot = debugLinesRef.current;
        const index = debugIndexRef.current;
        (window as unknown as { __overtoneFoliaDebug?: unknown }).__overtoneFoliaDebug = {
          time: Number(seconds.toFixed(3)),
          index,
          demo,
          song: metaRef.current.name,
          lineCount: snapshot.length,
          activeText: snapshot[index]?.fullText ?? '',
          first: snapshot[0] ? { t: snapshot[0].startTime, text: snapshot[0].fullText } : null,
          last: snapshot.length
            ? { t: snapshot[snapshot.length - 1].startTime, text: snapshot[snapshot.length - 1].fullText }
            : null,
          offset: hostLyricOffsetSec(),
        };
      }

      const playing = demo || isPlay.value;
      readAudioFrame(dt, playing);

      const previous = metaRef.current;
      const next = readHostMeta();
      if (
        next.name !== previous.name || next.singer !== previous.singer || next.album !== previous.album
        || next.pic !== previous.pic || next.playing !== previous.playing
        || next.duration !== previous.duration
        || next.lyrics !== previous.lyrics
      ) {
        metaRef.current = next;
        setMeta(next);
      }

      // 嵌入形态没有自己的播放条，progress 只是给独立覆盖层用的；
      // 在这里跳过，避免每帧/每 50ms 重渲染整棵样式树而打断逐字动画。
      if (!embeddedRef.current) {
        const total = getDuration() || 0;
        setProgress(previous => (Math.abs(previous.now - seconds) > 0.05 || previous.total !== total)
          ? { now: seconds, total }
          : previous);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  // Day/night follows the host theme store (a Vue reactive ref).
  useEffect(() => {
    const interval = window.setInterval(() => {
      const next = !themeShouldUseDarkColors.value;
      if (next !== daylightRef.current) setIsDaylight(next);
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  // Esc closes the overlay. Embedded mode leaves the key to the host lyric view
  // (it owns the panel / view close order).
  useEffect(() => {
    if (embedded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, embedded]);

  const artistLabel = meta.singer;
  const active = FOLIA_VISUALIZER_MODES.find(item => item.id === effectiveMode);

  const playgroundBackgroundConfig = {
    mode: effectiveBackgroundMode,
    transparent: transparentPlayerBackground,
    common: {
      useCoverColorBg,
      opacity: visualizer.backgroundOpacity,
      disableVignette: visualizer.disableVisualizerVignette,
      disableGeometricBackground: visualizer.disableVisualizerGeometricBackground,
    },
    customImage: asset.monetBackgroundImage,
    ...backgroundTuningConfig(visualizer),
    url: {
      items: visualizer.urlBackgroundList,
      selectedId: visualizer.urlBackgroundSelectedId,
    },
  };
  const playgroundBackgroundActions = {
    onModeChange: visualizer.handleSetVisualizerBackgroundMode,
    common: {
      onCoverColorChange: setUseCoverColorBg,
      onOpacityChange: visualizer.handleSetBackgroundOpacity,
      onDisableVignetteChange: visualizer.handleToggleDisableVisualizerVignette,
      onDisableGeometricChange: visualizer.handleToggleDisableVisualizerGeometricBackground,
    },
    customImage: {
      onUpload: visualizer.handleUploadMonetBackgroundImage,
      onClear: visualizer.handleClearMonetBackgroundImage,
      isLoading: asset.isLoadingMonetBackgroundImage,
    },
    url: {
      onAdd: visualizer.handleAddUrlBackgroundItem,
      onUpdate: visualizer.handleUpdateUrlBackgroundItem,
      onDelete: visualizer.handleDeleteUrlBackgroundItem,
      onSelect: visualizer.handleSetUrlBackgroundSelectedId,
    },
  };

  const theme = useMemo(() => readTheme(isDaylight), [isDaylight]);

  return (
    <div
      ref={rootRef}
      className={`folia-overlay lab-folia ${isDaylight ? 'is-daylight' : ''}${embedded ? ' folia-embedded' : ''}`}
      style={embedded ? {
        backgroundColor: 'transparent',
        width: fit ? `${fit.width}px` : '100%',
        height: fit ? `${fit.height}px` : '100%',
        transform: fit ? `scale(${fit.sx}, ${fit.sy})` : undefined,
        transformOrigin: '0 0',
      } : { backgroundColor: theme.backgroundColor }}
    >
      <div className="lab-folia-stage">
        <VisualizerRenderer
          mode={effectiveMode}
          animateStyleSwitch
          currentTime={lyricCurrentTime}
          duration={meta.duration || 200}
          currentLineIndex={currentLineIndex}
          lines={lines}
          theme={theme}
          subtitleTheme={theme}
          isDaylight={isDaylight}
          audioPower={audioPower}
          audioBands={audioBands}
          showText
          showSubtitleTranslation={typography.showSubtitleTranslation}
          hideTranslationSubtitle={typography.hidePlayerTranslationSubtitle}
          subtitleContentMode={typography.subtitleContentMode}
          subtitleFontScale={typography.subtitleFontScale}
          subtitleOverlayBackground={typography.subtitleOverlayBackground}
          subtitleOverlayOpacity={typography.subtitleOverlayOpacity}
          songTitle={meta.name}
          songArtist={artistLabel || null}
          songAlbum={meta.album || null}
          coverUrl={meta.pic}
          seed={meta.name || 'overtone'}
          paused={!meta.playing}
          staticMode={staticMode}
          background={background}
          visualizerTunings={tunings}
          visualizerOpacity={visualizer.visualizerOpacity}
          onBack={onClose}
        />
      </div>

      {/* 嵌入形态只贡献视觉层；顶栏 / 模式条 / 播放条 / 设置台都由宿主画面提供 */}
      {!embedded && (
      <>
      {!webglAvailable && (
        <div className="lab-folia-webgl-notice" role="status">
          此环境未启用 WebGL，已自动切换到纯 DOM 模式；3D / 着色器样式暂不可用
        </div>
      )}

      <header className="lab-folia-top">
        <button type="button" className="lab-folia-back" onClick={onClose} title="退出 Folia 视觉">
          <ArrowLeft size={18} />
          <span>返回</span>
        </button>
        <div className="lab-folia-meta">
          <strong>{meta.name || '未在播放'}</strong>
          <span>{artistLabel}{meta.album ? ` · ${meta.album}` : ''}</span>
        </div>
        <div className="lab-folia-top-actions">
          <button
            type="button"
            className="lab-folia-mode-name"
            onClick={() => setShowPicker(value => !value)}
            title="切换视觉模式"
          >
            <span className="lab-folia-mode-cn">{active?.label ?? effectiveMode}</span>
            <span className="lab-folia-mode-en">{active?.en ?? effectiveMode}</span>
          </button>
          <button
            type="button"
            className={`lab-folia-gear ${playgroundOpen ? 'is-active' : ''}`}
            onClick={() => setPlaygroundOpen(value => !value)}
            aria-label="歌词动画样式设置"
            title="歌词动画样式设置（实时预览）"
          >
            <Settings2 size={17} />
          </button>
        </div>
      </header>

      <footer className="lab-folia-bottom">
        {showPicker && (
          <div className="lab-folia-modes" role="tablist" aria-label="Folia 视觉模式">
            {FOLIA_VISUALIZER_MODES.map(item => {
              const available = isModeAvailable(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  disabled={!available}
                  aria-selected={item.id === effectiveMode}
                  className={`lab-folia-mode ${item.id === effectiveMode ? 'is-active' : ''} ${available ? '' : 'is-unavailable'}`}
                  onClick={() => { if (available) visualizer.handleSetVisualizerMode(item.id) }}
                  title={available ? `${item.label} · ${item.en}` : `${item.label} · 此环境未启用 WebGL，该模式不可用`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        )}

        <div className="lab-folia-transport">
          <div className="lab-folia-buttons">
            <button type="button" className="lab-folia-btn" onClick={() => { void playPrev(); }} title="上一首">
              <SkipBack size={18} />
            </button>
            <button
              type="button"
              className="lab-folia-btn primary"
              onClick={() => togglePlay()}
              aria-label={meta.playing ? '暂停' : '播放'}
              title={meta.playing ? '暂停' : '播放'}
            >
              {meta.playing ? <Pause size={20} /> : <Play size={20} />}
            </button>
            <button type="button" className="lab-folia-btn" onClick={() => { void playNext(); }} title="下一首">
              <SkipForward size={18} />
            </button>
          </div>
          <div
            className="lab-folia-progress"
            onClick={(event) => {
              if (!progress.total) return;
              const rect = event.currentTarget.getBoundingClientRect();
              const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
              setCurrentTime(ratio * progress.total);
            }}
          >
            <LatticeChromeTime currentTime={progressTime} duration={progress.total || meta.duration || 0} />
            <ProgressBar
              currentTime={progressTime}
              duration={progress.total || meta.duration || 1}
              onSeek={time => setCurrentTime(time)}
              primaryColor="var(--lab-folia-ink)"
              secondaryColor="var(--lab-folia-ink)"
              trackColor="color-mix(in srgb, var(--lab-folia-ink) 18%, transparent)"
              edgeStyle="rounded"
            />
          </div>
        </div>
      </footer>

      {playgroundOpen && (
        <PlaygroundBoundary onClose={() => setPlaygroundOpen(false)}>
        <VisPlayground
          theme={theme}
          isDaylight={isDaylight}
          visualizerMode={effectiveMode}
          initialEditSection="visualizer"
          visualizerOpacity={visualizer.visualizerOpacity}
          staticMode={staticMode}
          backgroundConfig={playgroundBackgroundConfig}
          backgroundActions={playgroundBackgroundActions}
          hideTranslationSubtitle={typography.hidePlayerTranslationSubtitle}
          showSubtitleTranslation={typography.showSubtitleTranslation}
          subtitleContentMode={typography.subtitleContentMode}
          subtitleOverlayOpacity={typography.subtitleOverlayOpacity}
          subtitleOverlayBackground={typography.subtitleOverlayBackground}
          subtitleUpcomingLyricsBlur={typography.subtitleUpcomingLyricsBlur}
          showHarmonySubtitle={typography.showHarmonySubtitle}
          harmonySubtitleBackground={typography.harmonySubtitleBackground}
          fontStyle={typography.lyricsFontStyle}
          fontScale={typography.lyricsFontScale}
          subtitleFontScale={typography.subtitleFontScale}
          fontWeight={typography.lyricsFontWeight}
          customFontFamily={typography.lyricsCustomFontFamily}
          customFontLabel={typography.lyricsCustomFontLabel}
          fontFallbackFamilies={typography.lyricsFontFallbackFamilies}
          subtitleFontInheritsLyrics={typography.subtitleFontInheritsLyrics}
          subtitleFontStyle={typography.subtitleFontStyle}
          subtitleFontWeight={typography.subtitleFontWeight}
          subtitleFontFamily={typography.subtitleFontFamily}
          subtitleFontFallbackFamilies={typography.subtitleFontFallbackFamilies}
          onFontStyleChange={typography.handleSetLyricsFontStyle}
          onFontScaleChange={typography.handleSetLyricsFontScale}
          onSubtitleFontScaleChange={typography.handleSetSubtitleFontScale}
          onFontWeightChange={typography.handleSetLyricsFontWeight}
          onCustomFontChange={typography.handleSetLyricsCustomFont}
          onUploadCustomFont={typography.handleUploadLyricsCustomFont}
          onFontFallbackFamiliesChange={typography.handleSetLyricsFontFallbackFamilies}
          onSubtitleFontInheritsLyricsChange={typography.handleSetSubtitleFontInheritsLyrics}
          onSubtitleFontStyleChange={typography.handleSetSubtitleFontStyle}
          onSubtitleFontWeightChange={typography.handleSetSubtitleFontWeight}
          onSubtitleFontFamilyChange={typography.handleSetSubtitleFontFamily}
          onSubtitleFontFallbackFamiliesChange={typography.handleSetSubtitleFontFallbackFamilies}
          onVisualizerModeChange={(mode) => { if (isModeAvailable(mode)) visualizer.handleSetVisualizerMode(mode) }}
          onVisualizerOpacityChange={visualizer.handleSetVisualizerOpacity}
          onToggleHideTranslationSubtitle={typography.handleToggleHidePlayerTranslationSubtitle}
          onToggleShowSubtitleTranslation={typography.handleToggleShowSubtitleTranslation}
          onSubtitleContentModeChange={typography.handleSetSubtitleContentMode}
          onSubtitleOverlayOpacityChange={typography.handleSetSubtitleOverlayOpacity}
          onToggleSubtitleOverlayBackground={typography.handleToggleSubtitleOverlayBackground}
          onToggleSubtitleUpcomingLyricsBlur={typography.handleToggleSubtitleUpcomingLyricsBlur}
          onToggleShowHarmonySubtitle={typography.handleToggleShowHarmonySubtitle}
          onToggleHarmonySubtitleBackground={typography.handleToggleHarmonySubtitleBackground}
          onClose={() => setPlaygroundOpen(false)}
        />
        </PlaygroundBoundary>
      )}
      </>
      )}
    </div>
  );
}
