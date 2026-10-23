// folia-viewer 宿主应用 —— Folia lattice 歌词切片（PixiJS）的宿主层。
//
// 数据入口：主进程数据桥（src/main/modules/folia/）经最小 preload
// 在页面上挂 `window.foliaBridge`（close / ready / onMessage）。
// 桥缺席时（普通浏览器打开）自动进入 mock 演示模式，见 ./mockSong.ts。
//
// 协议形状（权威定义见仓库 src/common/foliaProtocol.ts，本文件不复制其代码，
// 只声明本侧需要的结构 —— foliaProtocol 必须保持零运行时依赖地被主进程与
// 测试框架引用，viewer 侧通过相对类型引用保持同一形状即可）：
//   { type: 'snapshot', data: FoliaPlayerSnapshot }
//   { type: 'update',   data: FoliaPlayerUpdate }
//   data: { v: 1, seq, status, name, singer, album, pic,
//           progress(秒), duration(秒), playbackRate,
//           lyric, tlyric, lxlyric }

export type FoliaPlayStatus = '' | 'playing' | 'paused' | 'stoped' | 'error';

export interface FoliaPlayerData {
  status: FoliaPlayStatus;
  name: string;
  singer: string;
  album: string;
  pic: string;
  /** 当前播放进度（秒） */
  progress: number;
  /** 总时长（秒） */
  duration: number;
  playbackRate: number;
  /** 原始歌词（LX 格式文本） */
  lyric: string;
  tlyric: string;
  /** LX 逐字歌词：行首 [mm:ss.xx] + <startMs,durationMs>词（ms 相对行首） */
  lxlyric: string;
}

export interface FoliaPlayerSnapshot extends FoliaPlayerData {
  v: number;
  seq: number;
}

export type FoliaPlayerUpdate = Partial<FoliaPlayerData> & { v: number; seq: number };

export type FoliaMessage =
  | { type: 'snapshot'; data: FoliaPlayerSnapshot }
  | { type: 'update'; data: FoliaPlayerUpdate };

export interface FoliaBridge {
  close: () => void;
  ready: () => void;
  onMessage: (cb: (msg: unknown) => void) => () => void;
}


export const EMPTY_PLAYER_DATA: FoliaPlayerData = {
  status: '',
  name: '',
  singer: '',
  album: '',
  pic: '',
  progress: 0,
  duration: 0,
  playbackRate: 1,
  lyric: '',
  tlyric: '',
  lxlyric: '',
};

/** 与主进程 preload 的 isValidFoliaMessage 同判据（v/seq 在 data 内层）。 */
export const isValidFoliaMessage = (msg: unknown): msg is FoliaMessage => {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  if (m.type !== 'snapshot' && m.type !== 'update') return false;
  if (typeof m.data !== 'object' || m.data === null) return false;
  const d = m.data as Record<string, unknown>;
  if (d.v !== 1) return false;
  if (typeof d.seq !== 'number' || !Number.isFinite(d.seq)) return false;
  return true;
};
