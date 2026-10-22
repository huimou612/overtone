import { ipcMain } from 'electron'
import { mainOn } from '@common/mainIpc'
import { WIN_MAIN_RENDERER_EVENT_NAME } from '@common/ipcNames'
import {
  FOLIA_PROTOCOL_VERSION,
  FOLIA_IPC_CLOSE,
  FOLIA_IPC_READY,
  FOLIA_IPC_MESSAGE,
  type FoliaPlayerSnapshot,
  type FoliaPlayerUpdate,
  type FoliaPayloadData,
  buildFoliaPayload,
  pickFoliaFields,
} from '@common/foliaProtocol'
import { closeWindow, openWindow, isExistWindow, getWindow } from './main'

// ── Folia 视觉窗口数据桥（路线 B 阶段二）──────────────────────────
// 数据流（只读旁路，不改动任何现有播放器逻辑）：
//   渲染层 sendPlayerStatus（现有链路，utils/ipc.ts:175）→ player_status IPC
//     → winMain/rendererEvent/app.ts:120 → global.lx.event_app.player_status
//       ├ 累积写入 global.lx.player_status（权威快照，main/app.ts:56）
//       └ emit('player_status', 增量) ← 本模块监听并转发给 Folia 窗口
//   Folia 页面 ready → 读 global.lx.player_status 全量 → folia:snapshot
//
// 事件监听为模块级常驻（与 winLyric 的 global 监听同一惯例）；每次发送前用
// isExistWindow() 守卫——窗口不存在时零开销返回，无需反复解绑重绑。

// 字段白名单（SNAPSHOT_FIELDS/FIELD_ALIAS）与载荷构造逻辑统一放在
// @common/foliaProtocol（D2-2）：快照、增量下发、缓存合入三者共用同一份
// 白名单，LX.Player.Status 的无关字段（collect/rlyric/lyricLineText…）
// 不会透传给 Folia 页面，也不会污染缓存。

let seq = 0
/** 最近一次快照载荷缓存（只含白名单字段）：窗口重开且 player_status 事件长时间未来时，也能即时重发 */
let latestPayload: FoliaPayloadData | null = null

const sendToFolia = (msg: { type: 'snapshot' | 'update', data: unknown }) => {
  if (!isExistWindow()) return
  const win = getWindow()
  if (win && !win.isDestroyed()) win.webContents.send(FOLIA_IPC_MESSAGE, msg)
}

export default () => {
  // Folia 页面内关闭按钮（经最小 preload 桥，channel 固定且只做一件事）
  ipcMain.on(FOLIA_IPC_CLOSE, () => {
    closeWindow()
  })

  // 页面就绪 → 立即回权威快照（有缓存用缓存；无缓存从 global.lx.player_status 现取）
  ipcMain.on(FOLIA_IPC_READY, () => {
    if (!latestPayload) latestPayload = buildFoliaPayload(global.lx.player_status)
    const snapshot: FoliaPlayerSnapshot = { v: FOLIA_PROTOCOL_VERSION, seq: ++seq, ...latestPayload }
    sendToFolia({ type: 'snapshot', data: snapshot })
  })

  mainOn(WIN_MAIN_RENDERER_EVENT_NAME.open_folia_window, () => {
    // 打开动作本身由 main.ts openWindow 完成；此处保留以兼容未来的参数化打开
    openWindow()
  })

  mainOn(WIN_MAIN_RENDERER_EVENT_NAME.close_folia_window, () => {
    closeWindow()
  })

  // 主窗口真正退出（托盘退出/托盘禁用时的 close；隐藏到托盘不会发此事件）时，
  // 同步关闭 Folia 窗口，避免残留。与 winLyric/index.ts 的生命周期约定一致。
  global.lx.event_app.on('main_window_close', () => {
    closeWindow()
  })

  // 主窗口渲染层的播放状态增量（现有链路，零改动）→ 白名单过滤后转发给 Folia 窗口
  mainOn<Partial<LX.Player.Status>>(WIN_MAIN_RENDERER_EVENT_NAME.player_status, ({ params }) => {
    if (!latestPayload) latestPayload = buildFoliaPayload(global.lx.player_status)
    // 白名单补丁：无关字段（collect/lyricLineText…）在此被丢弃；
    // 同一份补丁既合入缓存又下发，保证窗口重开快照与已发消息一致
    const patch = pickFoliaFields(params)
    Object.assign(latestPayload, patch)
    const update: FoliaPlayerUpdate = { v: FOLIA_PROTOCOL_VERSION, seq: ++seq, ...patch }
    sendToFolia({ type: 'update', data: update })
  })
}
