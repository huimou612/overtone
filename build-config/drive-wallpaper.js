/**
 * 驱动界面验证「动态壁纸（阶段 7.2）」：
 *   1. 打开主题编辑器（基本设置 → 添加主题），读回壁纸组的结构与两个滑块；
 *   2. 直接 setTheme 注入一段视频壁纸，确认 AppBackground 真的挂出一个 <video>；
 *   3. 截图留档。
 *
 * 为什么不能只看编译结果：壁纸组是纯运行时渲染（v-if 缩略图、滑块 min/max），
 * AppBackground 更是靠 MutationObserver + getComputedStyle 感知主题变化，
 * 编译过了不代表视频真能挂出来。
 *
 * 前提：应用以 `npm run dev -- --remote-debugging-port=9222` 启动。
 */
const WebSocket = require('ws')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const PORT = 9222
const OUT_DIR = path.join(__dirname, '..', 'notes', 'preview', 'splash')
const VIDEO_URL = 'file:///F:/workbuddy/2026-10-12-13-28-07/fusion-music/app/notes/preview/splash/wallpaper-test.mp4'

const wait = ms => new Promise(resolve => { setTimeout(resolve, ms) })

const getTargets = () => new Promise((resolve, reject) => {
  http.get(`http://127.0.0.1:${PORT}/json`, response => {
    let body = ''
    response.on('data', chunk => { body += chunk })
    response.on('end', () => {
      try { resolve(JSON.parse(body)) } catch (error) { reject(error) }
    })
  }).on('error', reject)
})

class Cdp {
  constructor(ws) {
    this.ws = ws
    this.nextId = 0
    this.pending = new Map()
  }

  static async connect(url) {
    const ws = new WebSocket(url)
    await new Promise((resolve, reject) => {
      ws.once('open', resolve)
      ws.once('error', reject)
    })
    const cdp = new Cdp(ws)
    ws.on('message', data => {
      const message = JSON.parse(data)
      const slot = cdp.pending.get(message.id)
      if (!slot) return
      cdp.pending.delete(message.id)
      if (message.error) slot.reject(new Error(JSON.stringify(message.error)))
      else slot.resolve(message.result)
    })
    return cdp
  }

  send(method, params) {
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params: params ?? {} }))
    })
  }

  async eval(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'eval failed')
    return result.result.value
  }
}

async function shot(cdp, name) {
  const data = await cdp.send('Page.captureScreenshot', { format: 'png' })
  const target = path.join(OUT_DIR, name)
  fs.writeFileSync(target, Buffer.from(data.data, 'base64'))
  console.log('  →', name, fs.statSync(target).size, 'B')
  return target
}

async function readVideoState(cdp) {
  const raw = await cdp.eval(`(() => {
    // 注意不能用 [class*="wall"]：主题编辑器里也有 .wallpaper 分组，会撞车。
    // AppBackground 的媒体元素类名是 $style.media（CSS module 会带组件名前缀）。
    const video = document.querySelector('video[class*="media"]')
    const img = document.querySelector('img[class*="media"]')
    const wall = video ? video.parentElement : (img ? img.parentElement : null)
    return JSON.stringify({
      hidden: document.hidden,
      hasWall: !!wall,
      hasVideo: !!video,
      videoSrc: video ? video.getAttribute('src') : null,
      videoPaused: video ? video.paused : null,
      hasImg: !!img,
      blur: (video || img) ? getComputedStyle(video || img).filter : null,
    })
  })()`)
  return raw ? JSON.parse(raw) : null
}

async function main() {
  const targets = await getTargets()
  const pages = targets.filter(item => item.type === 'page' && String(item.url).startsWith('http'))
  if (!pages.length) throw new Error('找不到主窗口页面，应用没起来？')
  const cdp = await Cdp.connect(pages[0].webSocketDebuggerUrl)
  console.log('调试目标：', pages[0].title)
  // Windows 有原生窗口遮挡检测：窗口被最小化/被别的窗口盖住时 document.hidden = true，
  // AppBackground 的 visibilitychange 处理会（按设计）暂停壁纸视频。
  // 验证前先把窗口恢复正常并带到前台，否则测到的 paused 是遮挡导致的，不是 bug。
  try {
    const { windowId } = await cdp.send('Browser.getWindowForTarget', { targetId: pages[0].id })
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } })
  } catch (error) {
    console.log('  （恢复窗口状态失败，继续：', error.message, '）')
  }
  await cdp.send('Page.bringToFront', {})
  await wait(500)

  console.log('\n[1/5] 导航到设置页')
  await cdp.eval("location.hash = '#/setting'")
  await wait(2500)

  console.log('[2/5] 打开主题编辑器（切到「基本设置」→ 展开主题 → 添加主题）')
  const tabClicked = await cdp.eval(`(() => {
    const tab = [...document.querySelectorAll('h2[role="tab"]')].find(e => e.getAttribute('aria-label') === '基本设置')
    if (!tab) return false
    tab.click()
    return true
  })()`)
  if (!tabClicked) throw new Error('找不到「基本设置」tab')
  await wait(800)
  const expanded = await cdp.eval(`(() => {
    // 主题列表默认只展示前几套，要「更多主题」展开后才露出「添加主题」
    const byLabel = label => [...document.querySelectorAll('li')].find(e => e.getAttribute('aria-label') === label)
    const more = byLabel('更多主题')
    if (more) more.click()
    return true
  })()`)
  await wait(600)
  const opened2 = await cdp.eval(`(() => {
    const add = [...document.querySelectorAll('li')].find(e => e.getAttribute('aria-label') === '添加主题')
    if (!add) return false
    add.click()
    return true
  })()`)
  if (!opened2) throw new Error('找不到「添加主题」按钮')
  await wait(1500)

  console.log('[3/5] 读回壁纸组结构')
  const dump = await cdp.eval(`(() => {
    const modal = document.querySelector('.main') // ThemeEditModal 根元素
    const text = (modal ? modal.textContent : document.body.textContent).replace(/\\s+/g, ' ').trim()
    const sliders = [...document.querySelectorAll('input[type="range"]')].map(e => ({
      min: e.min, max: e.max, step: e.step, value: e.value,
      label: (e.parentElement ? e.parentElement.textContent : '').replace(/\\s+/g, ' ').trim(),
    }))
    const hasVideo = !!document.querySelector('video')
    return JSON.stringify({ text: text.slice(0, 600), sliders, hasVideo })
  })()`)
  const info = JSON.parse(dump)
  console.log('  面板正文（截取）：', info.text)
  console.log('  滑块：', JSON.stringify(info.sliders, null, 2))

  console.log('[4/5] 注入视频壁纸，确认 AppBackground 挂出 <video>')
  // 先关掉主题编辑器（@close → handleCancel 会 applyTheme 重置主题），再注入视频，
  // 截图才能拍到主界面的壁纸层。material-modal 的关闭钮是内容区里唯一的「无文字」按钮（×图标）。
  await cdp.eval(`(() => {
    const closeBtn = [...document.querySelectorAll('button[type="button"]')]
      .find(b => !b.textContent.trim() && b.querySelector('svg') && b.closest('[class*="content"]'))
    if (closeBtn) closeBtn.click()
    return closeBtn ? 'closed' : 'no close btn'
  })()`)
  await wait(800)
  const videoResult = await cdp.eval(`(() => {
    window.setTheme({
      '--background-video': 'url(${JSON.stringify(VIDEO_URL)})',
      '--background-image': 'none',
      '--background-blur': '8',
      '--background-mask': '40',
      '--background-image-position': 'center',
    })
    return 'setTheme called'
  })()`)
  console.log(' ', videoResult)
  await wait(1200)

  // 窗口可能在脚本运行途中又被别的窗口盖住（Windows 遮挡检测 → document.hidden →
  // AppBackground 按设计暂停视频）。被遮挡时带到前台再等 visibilitychange 恢复播放。
  let videoCheck = await readVideoState(cdp)
  if (videoCheck && videoCheck.hidden) {
    console.log('  窗口被遮挡，带到前台后重试')
    await cdp.send('Page.bringToFront', {})
    await wait(1200)
    videoCheck = await readVideoState(cdp)
  }
  console.log('  AppBackground 状态：', videoCheck)
  const shotPath = await shot(cdp, '04-wallpaper-video.png')

  console.log('[5/5] 结论')
  const problems = []
  if (!info.text.includes('壁纸')) problems.push('编辑器里没有「壁纸」组标题')
  if (!info.text.includes('支持图片与视频')) problems.push('没有壁纸提示文案')
  if (info.sliders.length < 2) problems.push('滑块数量不足 2')
  else {
    const blur = info.sliders.find(s => s.label.includes('壁纸模糊'))
    const mask = info.sliders.find(s => s.label.includes('壁纸遮罩'))
    if (!blur) problems.push('没有「壁纸模糊」滑块')
    else if (blur.max !== '40') problems.push('模糊滑块 max 不是 40：' + blur.max)
    if (!mask) problems.push('没有「壁纸遮罩」滑块')
    else if (mask.max !== '90') problems.push('遮罩滑块 max 不是 90：' + mask.max)
  }

  const wall = videoCheck
  if (!wall.hasWall) problems.push('AppBackground 图层没挂载')
  else if (!wall.hasVideo) problems.push('注入视频后没挂出 <video>（可能是 <img> 或没渲染）')
  else if (wall.videoPaused && !wall.hidden) problems.push('视频处于 paused 状态（没自动播放，且窗口没有被遮挡）')

  cdp.ws.close()
  if (problems.length) {
    console.log('\nFAIL：')
    for (const problem of problems) console.log('  -', problem)
    process.exitCode = 1
    return
  }
  console.log('\nPASS：壁纸组渲染正确，AppBackground 对视频壁纸挂出了 <video> 且自动播放')
}

main().catch(error => {
  console.error('失败：', error.message)
  process.exitCode = 1
})
