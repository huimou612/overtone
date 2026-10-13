/**
 * 给入场动画拍留档图（暗色 / 亮色）。
 *
 * 为什么不复用 dev 实例截图：入场动画在生产里只活 1.4 秒，靠轮询 CDP 去抓它既不可靠也不必要
 * —— 它的外观只取决于 splash.html ＋ 那四个 query 参数，直接按参数渲染出来就行。
 * 启动时机的验证交给 probe-splash.py（它看的是 CDP 时间线，不看外观）。
 */
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const OUT_DIR = path.join(__dirname, '..', 'notes', 'preview', 'splash')
const SPLASH = path.join(__dirname, '..', 'dist', 'splash.html')

const SHOTS = [
  { name: '01-splash-dark.png', query: { title: '泛音', min: '5000', dark: '1' } },
  { name: '02-splash-light.png', query: { title: '泛音', min: '5000', dark: '0' } },
]

const wait = ms => new Promise(resolve => { setTimeout(resolve, ms) })

// 只开一个窗口、来回换参数：拍完第一张就 destroy 的话，唯一的窗口没了会触发
// window-all-closed 的默认退出，第二张必然 ERR_FAILED。
app.on('window-all-closed', () => { /* 由下面的 app.quit() 收尾，不要在这里退出 */ })

app.whenReady().then(async() => {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const win = new BrowserWindow({
    width: 460,
    height: 280,
    frame: false,
    transparent: true,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, webSecurity: false },
  })
  for (const shot of SHOTS) {
    await win.loadFile(SPLASH, { query: shot.query })
    // 必须真的显示：隐藏窗口不参与合成，CSS 动画一帧都不走，截出来的是初始态
    win.showInactive()
    // 入场动画最后一环（底部提示）在 700ms 才起步、400ms 淡入，等满 1200ms 才是它的完整样子
    await wait(1200)
    const image = await win.webContents.capturePage()
    const target = path.join(OUT_DIR, shot.name)
    fs.writeFileSync(target, image.toPNG())
    console.log('写出', target, fs.statSync(target).size, 'B')
  }
  win.destroy()
  app.quit()
})
