// Folia 独立窗口的最小 preload（阶段一：close 桥；阶段二：数据桥）。
// 只暴露三个能力，全部经受控 IPC，不开放任何 Node API：
//   · close()                      —— 页面内的关闭按钮
//   · ready()                      —— 页面挂载完成，请求权威快照
//   · onMessage(cb) → 取消订阅函数 —— 接收主进程下行消息（白名单校验后回调）
// 阶段三如需更多能力（如视觉模式切换），继续在本桥上扩展，页面始终无法直接触达 Node。
import { contextBridge, ipcRenderer } from 'electron'
// 消息校验与通道常量统一来自协议模块（D2-3）：校验位置与主进程发送形状一致
// （{ type, data: { v, seq, … } }），避免两侧各自维护导致形状漂移。
import {
  FOLIA_IPC_CLOSE,
  FOLIA_IPC_READY,
  FOLIA_IPC_MESSAGE,
  isValidFoliaMessage,
} from '@common/foliaProtocol'

// 下行消息白名单校验：{ type: 'snapshot'|'update', data: { v, seq, … } }（v/seq 在 data 内层）
const isValidMessage = isValidFoliaMessage

contextBridge.exposeInMainWorld('foliaBridge', {
  close: () => { ipcRenderer.send(FOLIA_IPC_CLOSE) },
  ready: () => { ipcRenderer.send(FOLIA_IPC_READY) },
  onMessage: (cb: (msg: unknown) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, msg: unknown) => {
      if (isValidMessage(msg)) cb(msg)
    }
    ipcRenderer.on(FOLIA_IPC_MESSAGE, handler)
    return () => { ipcRenderer.removeListener(FOLIA_IPC_MESSAGE, handler) }
  },
})
