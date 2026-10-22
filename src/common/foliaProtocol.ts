// ── Folia 视觉窗口数据桥接协议（v1，路线 B 阶段二）──────────────────
// 单一权威数据源：主进程 global.lx.player_status（由渲染层 player_status IPC
// 持续更新，见 winMain/rendererEvent/app.ts:120 与 AppEvent.ts:56）。
// 本文件被两侧引用：主进程（@common alias）与 folia-viewer（相对路径）。

export const FOLIA_PROTOCOL_VERSION = 1

/** 页面 → 主进程（preload 内 ipcRenderer.send，channel 固定白名单） */
export const FOLIA_IPC_READY = 'folia:ready'
export const FOLIA_IPC_CLOSE = 'folia:close'
/** 主进程 → 页面（webContents.send，唯一下行 channel） */
export const FOLIA_IPC_MESSAGE = 'folia:message'

export type FoliaPlayStatus = '' | 'playing' | 'paused' | 'stoped' | 'error'

/** 完整快照：页面 ready 时或重开窗口时发送，字段为 global.lx.player_status 的相关子集 */
export interface FoliaPlayerSnapshot {
  v: number
  /** 主进程单调递增序号：快照与增量共用同一计数器，页面丢弃 seq 小于已处理值的任何消息 */
  seq: number
  status: FoliaPlayStatus
  name: string
  singer: string
  album: string
  pic: string
  /** 当前播放进度（秒） */
  progress: number
  /** 总时长（秒） */
  duration: number
  playbackRate: number
  /** 原始歌词（LX 格式文本；逐字为 <start,duration>字，ms 相对行首） */
  lyric: string
  tlyric: string
  lxlyric: string
}

/** 增量更新：仅携带变化的字段（player_status 事件本就是 Partial 语义） */
export type FoliaPlayerUpdate = Partial<Omit<FoliaPlayerSnapshot, 'v' | 'seq'>> & {
  v: number
  seq: number
}

export type FoliaMessage =
  | { type: 'snapshot', data: FoliaPlayerSnapshot }
  | { type: 'update', data: FoliaPlayerUpdate }

// ── 字段白名单策略（D2-2 修复）────────────────────────────────────
// 快照与增量共用同一份白名单：LX.Player.Status 里的无关字段
// （collect / rlyric / lyricLineText / lyricLineAllText 等）一律不得进入
// 下行消息与 latestPayload 缓存。本文件被主进程与 folia-viewer 两侧引用，
// 且必须保持**零运行时依赖**（测试框架以 data: URL 直接加载）。

/** Folia 关心的 LX.Player.Status 字段集合（原字段名） */
export const SNAPSHOT_FIELDS = [
  'status', 'name', 'singer', 'albumName', 'picUrl',
  'progress', 'duration', 'playbackRate',
  'lyric', 'tlyric', 'lxlyric',
] as const

/** LX 字段名 → Folia 协议字段名的别名映射（其余字段同名） */
export const FIELD_ALIAS: Record<string, string> = {
  albumName: 'album',
  picUrl: 'pic',
}

/** 快照/缓存的载荷形状（不含 v/seq） */
export type FoliaPayloadData = Omit<FoliaPlayerSnapshot, 'v' | 'seq'>

const isWhitelisted = (key: string): boolean => (SNAPSHOT_FIELDS as readonly string[]).includes(key)

/**
 * 下行消息校验（D2-3 修复）：校验位置必须与真实消息结构一致。
 * 主进程发送形状为 `{ type: 'snapshot'|'update', data: { v, seq, …字段 } }` ——
 * v（协议版本）与 seq（单调序号）都在 **data 内层**，不在消息顶层。
 * 此前 preload 在顶层找 v/seq，导致所有合法消息被拒、页面收不到任何数据。
 * 保持校验强度：类型、协议版本、序号一个不少；只是对准了位置。
 */
export const isValidFoliaMessage = (msg: unknown): boolean => {
  if (typeof msg !== 'object' || msg === null) return false
  const m = msg as Record<string, unknown>
  if (m.type !== 'snapshot' && m.type !== 'update') return false
  if (typeof m.data !== 'object' || m.data === null) return false
  const d = m.data as Record<string, unknown>
  if (d.v !== FOLIA_PROTOCOL_VERSION) return false
  if (typeof d.seq !== 'number' || !Number.isFinite(d.seq)) return false
  return true
}

/**
 * 权威快照 → Folia 载荷：按白名单取字段 + 别名映射。
 * 数值保持数值；null/undefined 归一为 ''（渲染层发送侧也用 `?? ''`，双保险）。
 * 入参用 object 而非 LX.Player.Status：本文件同时被 folia-viewer（浏览器侧，
 * 无 LX 全局类型）引用，不能引入 LX 命名空间；接口类型没有索引签名，
 * 在函数内部一次性收窄后按字段名取值。
 */
export const buildFoliaPayload = (source: object): FoliaPayloadData => {
  const rec = source as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const field of SNAPSHOT_FIELDS) {
    const raw = rec[field]
    out[FIELD_ALIAS[field] ?? field] = typeof raw === 'number' ? raw : (raw ?? '')
  }
  return out as FoliaPayloadData
}

/**
 * 增量 → 白名单补丁：只保留白名单内字段（做别名映射并归一化），
 * 无关字段（collect/lyricLineText/lyricLineAllText/rlyric…）直接丢弃。
 * 返回值既用于合入 latestPayload 缓存，也用于组装下行 update 消息，
 * 保证「缓存」与「下发」永远一致。
 */
export const pickFoliaFields = (params: object): Partial<FoliaPayloadData> => {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(params)) {
    if (!isWhitelisted(key)) continue
    out[FIELD_ALIAS[key] ?? key] = typeof value === 'number' ? value : (value ?? '')
  }
  return out as Partial<FoliaPayloadData>
}
