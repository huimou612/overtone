import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import { encodePath } from '@common/utils/electron'

// ── Folia 视觉窗口（路线 B 阶段一）────────────────────────────────
// 单例：重复打开时聚焦既有窗口而非新建。生命周期仿 winLyric，但更简单：
// 阶段一只有「打开/关闭」，无配置持久化、无主窗口事件联动。
//
// 安全策略：比主窗口**收紧**（nodeIntegration:false + contextIsolation:true +
// 最小 preload 桥），页面阶段一为纯视觉 mock，不需要任何 Node 能力。

let browserWindow: Electron.BrowserWindow | null = null

export const isExistWindow = () => !!browserWindow && !browserWindow.isDestroyed()

export const getWindow = () => (isExistWindow() ? browserWindow : null)

export const createWindow = () => {
  if (isExistWindow()) {
    if (browserWindow!.isMinimized()) browserWindow!.restore()
    browserWindow!.show()
    browserWindow!.focus()
    return
  }
  const winURL = process.env.NODE_ENV !== 'production'
    ? 'http://localhost:9090'
    // 生产：CopyPlugin 把 folia-viewer 产物复制到 dist/folia/（userApi.html 同一先例）
    : `file://${join(encodePath(__dirname), 'folia', 'index.html')}`

  browserWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 640,
    minHeight: 400,
    useContentSize: true,
    frame: false,
    hasShadow: true,
    show: false,
    backgroundColor: '#0c0e13',
    title: 'Folia Lattice',
    webPreferences: {
      // 独立最小桥（contextBridge）：只暴露 close 与消息通道，不暴露 Node
      preload: join(__dirname, 'foliaPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload 需要require('electron')，沙箱化会限制；未开放任何 Node 给页面
      webgl: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  })

  browserWindow.once('ready-to-show', () => browserWindow?.show())
  // Esc 关窗兜底：即使页面 JS 异常（键盘事件被吞/React 未挂载），主进程也保证可退出
  browserWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      event.preventDefault()
      closeWindow()
    }
  })
  browserWindow.on('closed', () => { browserWindow = null })
  // 用户点系统任务栏关闭/Alt+F4 时同步置空
  browserWindow.webContents.on('render-process-gone', () => {
    console.log('[folia] renderer process gone')
    browserWindow = null
  })

  void browserWindow.loadURL(winURL).catch(err => {
    // 页面加载失败只记日志，不影响主窗口
    console.log('[folia] loadURL failed:', err?.message || err)
  })
}

export const closeWindow = () => {
  if (!isExistWindow()) return
  const win = browserWindow!
  browserWindow = null
  win.destroy()
}

export const openWindow = () => {
  // 单实例：已存在则聚焦
  createWindow()
}
