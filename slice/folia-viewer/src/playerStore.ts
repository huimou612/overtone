// 播放状态存储：桥消息 → 合并状态 → 时钟锚点 + 歌词适配 + 主题。
//
// - snapshot 整体替换，update 按字段合并；seq 单调校验（丢弃乱序/过期消息）；
// - 状态变化后驱动 PlaybackClock 打锚点；
// - 歌词只在文本签名变化时重新适配（避免每条 progress 增量都重解析）；
// - React 侧用 useSyncExternalStore 订阅 version 计数。

import {
  EMPTY_PLAYER_DATA,
  isValidFoliaMessage,
  type FoliaMessage,
  type FoliaPlayerData,
} from './bridge';
import { PlaybackClock } from './playbackClock';
import { adaptLyrics } from './lyricAdapter';
import { DEFAULT_THEME, sampleCoverColor } from './theme';
import { MOCK_LOOP_MS, MOCK_SNAPSHOT } from './mockSong';
import type { Line, Theme } from '../../lattice-lyrics/src/types';

const cheapHash = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
};

export class PlayerStore {
  readonly clock = new PlaybackClock();
  readonly mockMode: boolean;
  private data: FoliaPlayerData = EMPTY_PLAYER_DATA;
  private theme: Theme = DEFAULT_THEME;
  private lastSeq = -1;
  private listeners = new Set<() => void>();
  private version = 0;
  private linesCache: { sig: string; lines: Line[] } = { sig: '', lines: [] };
  private sampledPic = '';
  private mockTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.mockMode = typeof window === 'undefined' || !window.foliaBridge;
  }

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  };

  getVersion = (): number => this.version;

  private notify(): void {
    this.version++;
    this.listeners.forEach((cb) => cb());
  }

  getData(): FoliaPlayerData { return this.data; }
  getTheme(): Theme { return this.theme; }

  getLines(): Line[] {
    const { lyric, tlyric, lxlyric, duration } = this.data;
    const sig = `${cheapHash(lxlyric)}:${cheapHash(lyric)}:${cheapHash(tlyric)}:${duration}`;
    if (sig !== this.linesCache.sig) {
      const { lines } = adaptLyrics({ lyric, tlyric, lxlyric, durationSec: duration });
      this.linesCache = { sig, lines };
    }
    return this.linesCache.lines;
  }

  /** 当前歌曲的稳定标识：切片用它判断「这台歌词是不是当前这首歌的」。 */
  getSongKey(): string {
    const d = this.data;
    return `${d.name}|${d.singer}|${d.album}|${d.duration}`;
  }

  /** 挂载桥（或启动 mock）。返回解绑函数。 */
  attach(): () => void {
    if (this.mockMode) {
      this.applyData(MOCK_SNAPSHOT);
      this.mockTimer = setInterval(() => this.applyData({ ...MOCK_SNAPSHOT, progress: 0 }), MOCK_LOOP_MS);
      return () => { if (this.mockTimer) clearInterval(this.mockTimer); };
    }
    const bridge = window.foliaBridge!;
    const off = bridge.onMessage((msg: unknown) => {
      if (isValidFoliaMessage(msg)) this.handleMessage(msg);
    });
    // 可见性恢复时重新请求快照对齐（preload 的 ready 复用，见计划 P3）
    this.clock.bindVisibility(() => bridge.ready());
    bridge.ready();
    return () => { off(); this.clock.destroy(); };
  }

  private handleMessage(msg: FoliaMessage): void {
    if (msg.data.seq <= this.lastSeq) return;
    this.lastSeq = msg.data.seq;
    const { v: _v, seq: _seq, ...fields } = msg.data;
    if (msg.type === 'snapshot') {
      this.applyData({ ...EMPTY_PLAYER_DATA, ...fields } as FoliaPlayerData);
    } else {
      this.applyData({ ...this.data, ...fields });
    }
  }

  private applyData(next: FoliaPlayerData): void {
    this.data = next;
    this.clock.applyState(next);
    this.maybeSampleTheme(next.pic);
    this.notify();
  }

  private maybeSampleTheme(pic: string): void {
    if (!pic || pic === this.sampledPic) return;
    this.sampledPic = pic;
    void sampleCoverColor(pic).then((color) => {
      if (!color || this.data.pic !== pic) return;
      this.theme = { ...DEFAULT_THEME, accentColor: color };
      this.notify();
    });
  }
}
