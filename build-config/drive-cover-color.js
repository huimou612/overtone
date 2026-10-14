/**
 * 驱动界面验证「跟随封面取色（阶段 7.4）」：
 *   1. 开关关闭时不该有 --cover-color（功能默认不存在，不能悄悄染色）；
 *   2. 开启后来一张**已知主色**的封面，取到的颜色必须落在那个色相上
 *      —— 这是这个功能唯一的验收标准，「出来一个值」不算数；
 *   3. 换一张另一种颜色的封面，颜色要跟着变（不然就是取了一次就锁死）；
 *   4. 黑白封面不该染色（灰度图没有色相，硬提饱和度等于凭空撒谎）；
 *   5. 本地文件路径的封面（走主进程 nativeImage 那条路）也要能出颜色
 *      —— 它和 data URL 是两条完全不同的读图链路，只测一条等于没测；
 *   6. 关掉开关，变量与染色层都要消失；
 *   7. 在**播放详情页 + 真实壁纸**（自带壁纸的内置主题）里，染色层与遮罩都要跟着封面色走
 *      —— 主界面的 --color-main-background 是不透明白，染色层本来就该被内容盖住，
 *      这里才是取色看得见的地方。
 *
 * 为什么判定要用「色相」而不是「等于某个 hex」：取色走的是量化 + 氛围化
 * （饱和度托底、明度夹逼），结果本来就不是原图那个像素值，但对色相是忠实的。
 * 拿原值比会永远对不上，拿色相比才能同时验证「提取得对」和「没乱改色相」。
 *
 * 前提：应用以 `npm run dev -- --remote-debugging-port=9222` 启动。
 */
const WebSocket = require('ws')
const http = require('node:http')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const PORT = 9222
const OUT_DIR = path.join(__dirname, '..', 'notes', 'preview', 'splash')
const TEMP_COVER = path.join(os.tmpdir(), 'overtone-cover-probe.png')

const wait = ms => new Promise(resolve => { setTimeout(resolve, ms) })

const problems = []
const check = (ok, okText, failText) => {
  if (ok) console.log('  ✓', okText)
  else { console.log('  ✗', failText); problems.push(failText) }
}

const hexToHue = hex => {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  if (delta === 0) return 0
  let hue
  if (max === r) hue = ((g - b) / delta) % 6
  else if (max === g) hue = (b - r) / delta + 2
  else hue = (r - g) / delta + 4
  hue *= 60
  return hue < 0 ? hue + 360 : hue
}

/** 环形色差，用来判「取到的颜色是不是那个色系」 */
const hueDistance = (a, b) => {
  const delta = Math.abs(a - b) % 360
  return delta > 180 ? 360 - delta : delta
}

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
  // Windows 上窗口一旦被别的窗口盖住，合成就停了，截出来是陈旧甚至空白的画面。
  // 每张留档图之前都重新置前一次，别只在整个流程开头置前。
  await cdp.send('Page.bringToFront', {})
  await wait(700)
  const data = await cdp.send('Page.captureScreenshot', { format: 'png' })
  const target = path.join(OUT_DIR, name)
  fs.writeFileSync(target, Buffer.from(data.data, 'base64'))
  console.log('  →', name, fs.statSync(target).size, 'B')
  return target
}

async function waitAppReady(cdp, timeoutMs = 25000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const ok = await cdp
      .eval("!!(window.lxData && window.lxData.musicInfo && document.getElementById('container'))")
      .catch(() => false)
    if (ok) {
      await wait(800)
      return true
    }
    await wait(500)
  }
  return false
}

/** 关掉播放详情页：它盖住整个界面，不关掉留档图只能拍到它 */
async function closePlayDetail(cdp) {
  const result = await cdp.eval(`(() => {
    const detail = document.querySelector('[data-view="play-detail"]')
    if (!detail) return 'none'
    const btn = detail.querySelector('button[title]')
    if (!btn) return 'no-button'
    btn.click()
    return 'clicked'
  })()`)
  if (result === 'clicked') await wait(900)
  return result
}

/** 读当前生效的封面主色 + 染色层是否在 DOM 里 */
async function readState(cdp) {
  const raw = await cdp.eval(`(() => {
    const color = getComputedStyle(document.documentElement).getPropertyValue('--cover-color').trim()
    const wall = document.querySelector('[data-layer="wall"]')
    const tint = document.querySelector('[data-layer="cover-tint"]')
    return JSON.stringify({
      color,
      hasWall: !!wall,
      hasTint: !!tint,
      tintImage: tint ? getComputedStyle(tint).backgroundImage : '',
      pic: (window.lxData.musicInfo.pic || '').slice(0, 40),
    })
  })()`)
  return JSON.parse(raw)
}

/** 在页面里现画一张封面，返回 data URL。用已知颜色，判定才有基准。 */
async function makeCoverDataUrl(cdp, main, accent) {
  return cdp.eval(`(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 96
    canvas.height = 96
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = ${JSON.stringify(main)}
    ctx.fillRect(0, 0, 96, 96)
    ${accent ? `ctx.fillStyle = ${JSON.stringify(accent)}; ctx.fillRect(0, 0, 96, 16)` : ''}
    return canvas.toDataURL('image/png')
  })()`)
}

/** 设当前歌曲封面。musicInfo 就是 store 里那个 reactive 对象，赋值即可触发 watch。 */
async function setCover(cdp, pic, settle = 1400) {
  await cdp.eval(`window.lxData.musicInfo.pic = ${JSON.stringify(pic)}`)
  await wait(settle)
}

async function main() {
  const targets = await getTargets()
  const pages = targets.filter(item => item.type === 'page' && String(item.url).startsWith('http'))
  if (!pages.length) throw new Error('找不到主窗口页面，应用没起来？')
  const cdp = await Cdp.connect(pages[0].webSocketDebuggerUrl)
  console.log('调试目标：', pages[0].title)

  // Windows 会把被遮住的窗口判成 hidden（壁纸会按设计暂停），验证前先带到前台
  try {
    const { windowId } = await cdp.send('Browser.getWindowForTarget', { targetId: pages[0].id })
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } })
  } catch (error) {
    console.log('  （恢复窗口状态失败，继续：', error.message, '）')
  }
  await cdp.send('Page.bringToFront', {})
  await wait(500)

  // dev 是 HMR，改完代码页面可能停在半热替换状态，先整页重载到确定状态
  await cdp.eval('location.reload()')
  if (!await waitAppReady(cdp)) throw new Error('重载后应用没就绪')
  await closePlayDetail(cdp)

  // 记下原始设置，跑完复原 —— 这是用户的开发实例，不能留下被改过的痕迹
  const original = JSON.parse(await cdp.eval(`JSON.stringify({
    coverColor: !!window.lxData.appSetting['common.coverColor'],
    pic: window.lxData.musicInfo.pic || '',
  })`))
  console.log('  原始状态：coverColor =', original.coverColor)

  try {
    console.log('\n[1/7] 开关关闭时：不该有任何染色')
    await cdp.eval("window.lxData.updateSetting({ 'common.coverColor': false })")
    await wait(600)
    const blueCover = await makeCoverDataUrl(cdp, '#2f6fd0', '#ffffff')
    await setCover(cdp, blueCover)
    const off = await readState(cdp)
    console.log('  状态：', JSON.stringify(off))
    check(!off.color, `没有 --cover-color（读到「${off.color}」）`, `开关关着却写入了 --cover-color：${off.color}`)
    check(!off.hasTint, '染色层没有挂出', '染色层不该挂出')

    console.log('\n[2/7] 打开开关 + 蓝色封面 → 取到的必须是蓝色系')
    await cdp.eval("window.lxData.updateSetting({ 'common.coverColor': true })")
    await wait(1500)
    const blue = await readState(cdp)
    console.log('  状态：', JSON.stringify(blue))
    check(/^#[0-9a-f]{6}$/i.test(blue.color), `写出了合法的十六进制颜色（${blue.color}）`, `颜色不合法：${blue.color}`)
    if (/^#[0-9a-f]{6}$/i.test(blue.color)) {
      const hue = hexToHue(blue.color)
      const distance = hueDistance(hue, hexToHue('#2f6fd0'))
      console.log(`  色相：取到 ${hue.toFixed(1)}°，封面 ${hexToHue('#2f6fd0').toFixed(1)}°，差 ${distance.toFixed(1)}°`)
      check(distance <= 20, `取到的是封面那个颜色（色相差 ${distance.toFixed(1)}°）`, `取到的颜色不对（色相差 ${distance.toFixed(1)}°）`)
    }
    check(blue.hasTint, '染色层已挂出', '染色层没挂出')
    check(blue.tintImage.includes('linear-gradient'), `染色层画的是渐变（${blue.tintImage.slice(0, 60)}…）`, `染色层没有渐变背景：${blue.tintImage}`)
    await shot(cdp, '10-cover-color-blue.png')

    console.log('\n[3/7] 换成绿色封面 → 颜色要跟着变')
    const greenCover = await makeCoverDataUrl(cdp, '#3aa76d', '#ffffff')
    await setCover(cdp, greenCover)
    const green = await readState(cdp)
    console.log('  状态：', JSON.stringify({ color: green.color }))
    if (/^#[0-9a-f]{6}$/i.test(green.color)) {
      const hue = hexToHue(green.color)
      const distance = hueDistance(hue, hexToHue('#3aa76d'))
      console.log(`  色相：取到 ${hue.toFixed(1)}°，封面 ${hexToHue('#3aa76d').toFixed(1)}°，差 ${distance.toFixed(1)}°`)
      check(distance <= 20, `跟着换成了绿色系（色相差 ${distance.toFixed(1)}°）`, `颜色没跟着变（色相差 ${distance.toFixed(1)}°）`)
    } else {
      check(false, '', `换封面后没取到颜色：${green.color}`)
    }
    check(green.color !== blue.color, '和上一首的颜色不同（确实在跟随，不是锁死）', '两首不同颜色的歌取到了同一个颜色')
    await shot(cdp, '11-cover-color-green.png')

    console.log('\n[4/7] 黑白封面 → 不染色')
    const greyCover = await makeCoverDataUrl(cdp, '#808080', null)
    await setCover(cdp, greyCover)
    const grey = await readState(cdp)
    console.log('  状态：', JSON.stringify({ color: grey.color, hasTint: grey.hasTint }))
    check(!grey.color, `灰度封面没有取色（读到「${grey.color}」）`, `灰度封面凭空造了一个颜色：${grey.color}`)
    check(!grey.hasTint, '染色层已撤掉', '染色层还在')

    console.log('\n[5/7] 本地文件路径封面 → 走主进程读图，也要能取色')
    // 先在页面里画一张已知颜色的图，落成临时文件，再把「文件路径」当封面。
    // 这条链路和 data URL 完全不同（渲染层读不了 file://，必须由主进程 nativeImage 代读），
    // 只测 data URL 等于没测到 IPC 那一半。
    const fileCoverUrl = await makeCoverDataUrl(cdp, '#d2452f', '#ffffff')
    fs.writeFileSync(TEMP_COVER, Buffer.from(fileCoverUrl.split(',')[1], 'base64'))
    console.log('  临时封面：', TEMP_COVER, fs.statSync(TEMP_COVER).size, 'B')
    await setCover(cdp, TEMP_COVER, 2200)
    const fileState = await readState(cdp)
    console.log('  状态：', JSON.stringify({ color: fileState.color, pic: fileState.pic }))
    check(/^#[0-9a-f]{6}$/i.test(fileState.color), `本地文件路径也取到了颜色（${fileState.color}）`, `本地文件路径没取到颜色：${fileState.color}`)
    if (/^#[0-9a-f]{6}$/i.test(fileState.color)) {
      const hue = hexToHue(fileState.color)
      const distance = hueDistance(hue, hexToHue('#d2452f'))
      console.log(`  色相：取到 ${hue.toFixed(1)}°，封面 ${hexToHue('#d2452f').toFixed(1)}°，差 ${distance.toFixed(1)}°`)
      check(distance <= 20, `走 IPC 那条路取的也是封面那个颜色（色相差 ${distance.toFixed(1)}°）`, `走 IPC 取到的颜色不对（色相差 ${distance.toFixed(1)}°）`)
    }
    await shot(cdp, '12-cover-color-file.png')

    console.log('\n[6/7] 关掉开关 → 变量与染色层都消失')
    await cdp.eval("window.lxData.updateSetting({ 'common.coverColor': false })")
    await wait(1200)
    const restored = await readState(cdp)
    console.log('  状态：', JSON.stringify({ color: restored.color, hasTint: restored.hasTint }))
    check(!restored.color, '--cover-color 已撤掉', `--cover-color 还在：${restored.color}`)
    check(!restored.hasTint, '染色层已移除', '染色层还在')

    console.log('\n[7/7] 播放详情页 + 真实壁纸：取色看得见的地方')
    // 主界面的 --color-main-background 是「不透明白」，染色层被内容盖住 —— 这是**正确的**，
    // 不能为了看得见就去盖内容。取色的舞台在播放详情页：那里 .bg 自己就在画壁纸。
    //
    await cdp.eval("window.lxData.updateSetting({ 'common.coverColor': true })")
    await wait(1000)

    // 构造一个「有壁纸 + 遮罩调到 40」的场景。
    //
    // 这里没有去切主题：渲染层的 applyTheme 被上游固定传了 'auto'（useEventListener 的
    // rThemeChange 里），而 theme_change 又在 theme.id 没变时提前 return —— 从外部改
    // lightId 根本刷不动主题，只有走设置页的主题卡片（那里自己调了一次 applyTheme）才行。
    // 所以这里直接把壁纸/遮罩两个变量写进 :root 的内联样式。
    //
    // 这不改变被验证的东西：AppBackground 读的是**计算样式**，主题写 :root 规则和这里写
    // 内联样式，对它是同一件事，消费路径一模一样。遮罩 40 也正等于用户拖那个滑块的取值。
    // 壁纸用内置主题自带的图（dev 下 /theme_images 由 webpack-dev-server 提供）。
    await cdp.eval(`(() => {
      const root = document.documentElement
      root.style.setProperty('--background-image', 'url(/theme_images/china_ink.jpg)')
      root.style.setProperty('--background-image-size', 'cover')
      root.style.setProperty('--background-mask', '40')
    })()`)
    await wait(900)

    const scene = JSON.parse(await cdp.eval(`(async () => {
      const raw = getComputedStyle(document.documentElement).getPropertyValue('--background-image').trim()
      const start = raw.indexOf('url(')
      const url = start < 0 ? '' : raw.slice(start + 4).replace(/[)]+$/, '')
      const loaded = url ? await new Promise(resolve => {
        const img = new Image()
        img.onload = () => resolve(img.naturalWidth + 'x' + img.naturalHeight)
        img.onerror = () => resolve('')
        img.src = url
      }) : ''
      return JSON.stringify({ url, loaded })
    })()`))
    console.log('  场景：壁纸 =', scene.url, '加载 =', scene.loaded || '失败')
    check(!!scene.loaded, `壁纸图已加载（${scene.loaded}）`, `壁纸图没加载出来：${scene.url}`)

    const warmCover = await makeCoverDataUrl(cdp, '#d2452f', '#ffffff')
    await setCover(cdp, warmCover, 1800)

    const opened = await cdp.eval(`(() => {
      const trigger = document.querySelector('[class*="__picContent--"]')
      if (!trigger) return 'no-trigger'
      trigger.click()
      return 'clicked'
    })()`)
    await wait(2600)

    const detail = JSON.parse(await cdp.eval(`(() => {
      const view = document.querySelector('[data-view="play-detail"]')
      if (!view) return JSON.stringify({ open: false })
      const tint = view.querySelector('[data-layer="cover-tint"]')
      const mask = view.querySelector('[data-layer="wall-mask"]')
      return JSON.stringify({
        open: true,
        hasWall: !!view.querySelector('[data-layer="wall"]'),
        hasTint: !!tint,
        tintBg: tint ? getComputedStyle(tint).backgroundImage.slice(0, 46) : '',
        maskColor: mask ? getComputedStyle(mask).backgroundColor : '',
        maskAlpha: mask ? getComputedStyle(mask).opacity : '',
      })
    })()`))
    console.log('  状态：', JSON.stringify(detail))
    check(detail.open, '播放详情页已打开', `没能打开播放详情页（${opened}）`)
    check(detail.hasWall, '壁纸层挂出来了', '壁纸层没挂出来')
    check(detail.hasTint, '播放详情页里也有染色层', '播放详情页里没有染色层')
    check(detail.tintBg.includes('gradient'), `染色层画的是封面色的渐变（${detail.tintBg}…）`, `染色层没有渐变：${detail.tintBg}`)
    check(Number(detail.maskAlpha) > 0.3, `遮罩已按设置生效（opacity ${detail.maskAlpha}）`, `遮罩没生效：${detail.maskAlpha}`)
    // 遮罩色 = 封面主色 —— 「跟随封面取色」落在遮罩上最直接的体现：
    // 同一个不透明度，压下去的不再是主题底色，而是这首歌的颜色。
    const maskRgb = (detail.maskColor.match(/\d+/g) || []).slice(0, 3).map(Number)
    check(maskRgb.length === 3, `遮罩色已跟着封面走（${detail.maskColor}）`, `没读到遮罩色：${detail.maskColor}`)
    if (maskRgb.length === 3) {
      const maskHue = hexToHue('#' + maskRgb.map(v => v.toString(16).padStart(2, '0')).join(''))
      const distance = hueDistance(maskHue, hexToHue('#d2452f'))
      console.log(`  遮罩色相：${maskHue.toFixed(1)}°，封面 ${hexToHue('#d2452f').toFixed(1)}°，差 ${distance.toFixed(1)}°`)
      check(distance <= 20, `遮罩取的就是封面那个颜色（色相差 ${distance.toFixed(1)}°）`, `遮罩颜色不对（色相差 ${distance.toFixed(1)}°）`)
    }

    // 留档要能反映这个功能，所以这里得先说明一件事：
    // 播放详情页的 .bg 上压着一块 .bg::after = --color-main-background 的蒙版，默认主题给的是
    // 不透明白 —— 背景层被它整个盖住，静态截图只会是一张白纸（实测中部像素 254,254,254）。
    // 这不是 bug，是上游刻意的：内容不透明时背景就不该透出来。壁纸功能同理。
    // 所以截图前把这块蒙版临时改透明，等价于「用户用了主背景半透明的主题」——
    // 这是唯一能让静态截图说清这个功能的办法，跑完立刻撤掉。
    // 截图前先量一下那块蒙版，把「为什么静态截图是白的」记进日志里
    const veil = await cdp.eval(`(() => {
      const bg = document.querySelector('[data-view="play-detail"]').firstElementChild
      return getComputedStyle(bg, '::after').backgroundColor
    })()`)
    console.log('  .bg::after 蒙版色 =', veil, '（不透明时会把背景层整个盖住）')

    await cdp.eval(`(() => {
      const st = document.createElement('style')
      st.id = 'cover-color-probe-veil'
      st.textContent = '[data-view="play-detail"] > div:first-child::after { background-color: transparent !important; }'
      document.head.appendChild(st)
    })()`)
    await wait(800)
    await shot(cdp, '13-cover-color-playdetail.png')
    await cdp.eval("(document.getElementById('cover-color-probe-veil') || {}).remove && document.getElementById('cover-color-probe-veil').remove()")
  } finally {
    // 复原：封面回原样、设置回原值，构造场景用的三个变量撤掉
    await cdp.eval(`(() => {
      const root = document.documentElement
      root.style.removeProperty('--background-image')
      root.style.removeProperty('--background-image-size')
      root.style.removeProperty('--background-mask')
    })()`)
    await cdp.eval(`window.lxData.updateSetting({ 'common.coverColor': ${original.coverColor} })`)
    await cdp.eval(`window.lxData.musicInfo.pic = ${JSON.stringify(original.pic)}`)
    await wait(900)
    // 第 7 步把播放详情页打开过，退出来 —— 别给用户留在一个他没开过的页面
    await closePlayDetail(cdp)
    try { fs.unlinkSync(TEMP_COVER) } catch {}
  }

  console.log('\n' + '='.repeat(52))
  if (problems.length) {
    console.log('FAIL：')
    for (const text of problems) console.log('  -', text)
    process.exitCode = 1
  } else {
    console.log('PASS：取色跟随封面、两条读图链路都通、开关与灰度封面处理正确、播放详情页里染色与遮罩都跟着走')
  }
  cdp.ws.close()
}

main().catch(error => {
  console.error('脚本出错：', error.message)
  // 出错时 WebSocket 还开着，node 不会自己退出（出了名的不退出），直接硬退
  process.exit(1)
})
