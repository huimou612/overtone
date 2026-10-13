import { BrowserWindow } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * 入场动画（启动画面）窗口。
 *
 * 存在的理由：主窗口是 `show: false` 等 `ready-to-show`，而应用设置要等数据库
 * 初始化完才能读 —— 从点图标到看见界面之间有一段真实的空窗期，开发模式下更明显
 * （还要额外等 dev server 与 bundle 编译）。这里用一个无边框透明小窗把空窗填上，
 * 主窗口就绪后再淡出，视觉上是「启动画面淡出露出主界面」。
 *
 * 刻意不做的事：不在此窗口里做任何业务初始化。它必须在设置可读之前就能显示，
 * 所以它拿到的第一批参数只能是默认值（见 configQuery 的注释）。
 */

const SPLASH_WIDTH = 460
const SPLASH_HEIGHT = 280
/** 与 splash.html 里 body 的 transition 时长保持一致 */
const FADE_OUT_MS = 340
/**
 * 兜底上限：主窗口迟迟不就绪时（例如渲染层崩溃）不能让入场动画一直挡着，
 * 它是 alwaysOnTop，挡住会让人误以为程序卡死。
 *
 * 开发模式下要放宽：主窗口要等 webpack dev server 编译完（几十秒），
 * 用生产环境的 15 秒会让入场动画提前收掉，用户看到的是「闪一下然后一片空白」。
 */
const GUARD_MS = process.env.NODE_ENV !== 'production' ? 60000 : 15000
const DEFAULT_TITLE = '泛音'

let browserWindow: Electron.BrowserWindow | null = null
let shownAt = 0
let fading = false
let guardTimer: ReturnType<typeof setTimeout> | null = null

const splashFile = () => path.join(__dirname, 'splash.html')

const clearGuard = () => {
  if (guardTimer) {
    clearTimeout(guardTimer)
    guardTimer = null
  }
}

/**
 * 首帧参数。创建窗口时设置可能还没读出来（此时 global.lx.appSetting 还是
 * defaultSetting），所以这里拿到的是默认值；真实外观随后由 applySetting() 刷入。
 * 即便如此也要先传一版，否则首帧会白底闪一下 —— 主题色必须一开始就正确。
 */
const configQuery = (): Record<string, string> => {
  const setting = global.lx.appSetting
  const image = setting['common.splashImage']
  const minMs = setting['common.splashMinMs']
  return {
    title: setting['common.splashTitle'] || DEFAULT_TITLE,
    image: image ? pathToFileURL(image).href : '',
    min: String(minMs > 0 ? minMs : 1400),
    dark: global.lx.theme.shouldUseDarkColors ? '1' : '0',
  }
}

/** 把参数注入页面。页面通过 window.__overtoneSplashApply 接收（见 splash.html）。 */
const pushConfig = () => {
  if (!browserWindow || browserWindow.isDestroyed()) return
  const query = configQuery()
  void browserWindow.webContents
    .executeJavaScript(`window.__overtoneSplashApply && window.__overtoneSplashApply(${JSON.stringify(query)})`)
    .catch(() => { /* 页面可能还没加载完，首帧参数已经够用 */ })
}

export const createWindow = () => {
  if (browserWindow) return
  fading = false

  const win = new BrowserWindow({
    width: SPLASH_WIDTH,
    height: SPLASH_HEIGHT,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    // 必须在主窗口之上：主窗口 show() 之后要露在它下面，再由本窗口淡出
    alwaysOnTop: true,
    center: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // 自定义启动图可以是磁盘上任意位置的文件，file:// 页面要能引用它
      webSecurity: false,
      enableWebSQL: false,
      spellcheck: false,
      devTools: false,
    },
  })
  browserWindow = win
  shownAt = Date.now()

  win.once('ready-to-show', () => {
    // 设置读完发现关掉了入场动画（fading 已被置位）时不要再显示，否则会闪一下
    if (fading || win.isDestroyed()) return
    win.show()
  })
  win.on('closed', () => {
    clearGuard()
    if (browserWindow === win) browserWindow = null
  })

  void win.loadFile(splashFile(), { query: configQuery() })

  guardTimer = setTimeout(() => { fadeOut() }, GUARD_MS)
}

export const fadeOut = () => {
  const win = browserWindow
  if (!win || win.isDestroyed() || fading) return
  fading = true
  clearGuard()

  void win.webContents
    .executeJavaScript('window.__overtoneSplashHide && window.__overtoneSplashHide()')
    .catch(() => { /* 页面没加载完就直接关，不需要淡出 */ })
  setTimeout(() => {
    if (browserWindow === win && !win.isDestroyed()) win.close()
  }, FADE_OUT_MS)
}

/**
 * 设置读完后调用：刷入真实外观；用户关掉了入场动画则立即淡出。
 * 注意此刻窗口可能还没显示（ready-to-show 未触发），fadeOut 会把它直接收掉，
 * 这正是「关掉开关就不该看见它」的预期行为。
 */
export const applySetting = () => {
  if (!global.lx.appSetting['common.splashEnable']) {
    fadeOut()
    return
  }
  pushConfig()
}

/** 主窗口 ready-to-show 后调用。不足最短时长则等满，避免快机器上一闪而过。 */
export const requestClose = () => {
  if (!browserWindow || browserWindow.isDestroyed()) return
  const minMs = global.lx.appSetting['common.splashMinMs']
  const wait = Math.max(0, (minMs > 0 ? minMs : 0) - (Date.now() - shownAt))
  setTimeout(() => { fadeOut() }, wait)
}

export const isExistWindow = () => !!browserWindow
