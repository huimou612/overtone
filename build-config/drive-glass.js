/**
 * 驱动界面验证「通透主题（阶段 7.5）」：
 *   1. 设置页的主题列表里真出现了「澄澈泛音 / 澄澈夜色」两张卡
 *      （i18n 键、index.json、主题列表三者是否真的接上了）；
 *   2. 点它能切过去，且内容层真的变成半透明（--color-main-background 的 alpha）；
 *   3. **同一张壁纸，两个主题下的画面不一样** —— 这是这一步的全部意义。
 *      默认主题的内容层不透明，播放详情页的 .bg::after 就是拿它当遮罩，
 *      壁纸被整个盖住；通透主题下那一层是 0.62 的白，壁纸能透出来。
 *      判定用像素：截图下来直接量「红度」（r-g），不靠推理。
 *   4. 主题编辑器里的「一键通透」能把任意不透明主题的内容层调透，
 *      省得用户自己去取色器里翻 alpha 通道；
 *   5. 收尾复原，不留脏配置。
 *
 * 为什么坚持用像素而不是「读一下 CSS 变量对不对」：变量对 ≠ 看得见。
 * 这个功能的坑恰恰是「变量全对，但被上层一块不透明的底盖住了」，
 * 只读变量会得出「一切正常」的错误结论。
 *
 * 前提：应用以 `npm run dev -- --remote-debugging-port=9222` 启动。
 */
const WebSocket = require('ws')
const http = require('node:http')
const zlib = require('node:zlib')
const fs = require('node:fs')
const path = require('node:path')

const PORT = 9222
const OUT_DIR = path.join(__dirname, '..', 'notes', 'preview', 'splash')

const wait = ms => new Promise(resolve => { setTimeout(resolve, ms) })

const problems = []
const check = (ok, okText, failText) => {
  if (ok) console.log('  ✓', okText)
  else { console.log('  ✗', failText); problems.push(failText) }
}

/* ── 最小 PNG 解码 ────────────────────────────────────────────────
   CDP 截图是标准 8 位 PNG，解它只需要 zlib + 四种反滤波。
   走这条路是为了不引入 Pillow / sharp 这类依赖 —— 采样一次而已，
   为它装一个图像库不划算。                                        */
function decodePng(buffer) {
  let pos = 8 // 跳过 8 字节签名
  const idat = []
  let width = 0
  let height = 0
  let colorType = 0
  while (pos < buffer.length) {
    const length = buffer.readUInt32BE(pos)
    const type = buffer.toString('ascii', pos + 4, pos + 8)
    const chunk = buffer.subarray(pos + 8, pos + 8 + length)
    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0)
      height = chunk.readUInt32BE(4)
      colorType = chunk[9]
    } else if (type === 'IDAT') {
      idat.push(chunk)
    } else if (type === 'IEND') break
    pos += length + 12
  }
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1
  const stride = width * channels
  const out = Buffer.alloc(height * stride)
  let prev = Buffer.alloc(stride)
  let cursor = 0
  for (let y = 0; y < height; y += 1) {
    const filter = raw[cursor]
    cursor += 1
    const line = out.subarray(y * stride, (y + 1) * stride)
    raw.copy(line, 0, cursor, cursor + stride)
    cursor += stride
    if (filter === 1) {
      for (let x = channels; x < stride; x += 1) line[x] = (line[x] + line[x - channels]) & 0xff
    } else if (filter === 2) {
      for (let x = 0; x < stride; x += 1) line[x] = (line[x] + prev[x]) & 0xff
    } else if (filter === 3) {
      for (let x = 0; x < stride; x += 1) {
        const left = x >= channels ? line[x - channels] : 0
        line[x] = (line[x] + ((left + prev[x]) >> 1)) & 0xff
      }
    } else if (filter === 4) {
      for (let x = 0; x < stride; x += 1) {
        const a = x >= channels ? line[x - channels] : 0
        const b = prev[x]
        const c = x >= channels ? prev[x - channels] : 0
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff
      }
    }
    prev = line
  }
  return { width, height, channels, data: out }
}

/** 取一块区域的平均色。坐标超出范围就夹回来，不让采样点把脚本带崩。 */
function averageColor(image, x0, y0, x1, y1) {
  const left = Math.max(0, Math.min(image.width - 1, Math.round(x0)))
  const top = Math.max(0, Math.min(image.height - 1, Math.round(y0)))
  const right = Math.max(left + 1, Math.min(image.width, Math.round(x1)))
  const bottom = Math.max(top + 1, Math.min(image.height, Math.round(y1)))
  let r = 0
  let g = 0
  let b = 0
  let count = 0
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const i = (y * image.width + x) * image.channels
      r += image.data[i]
      g += image.data[i + 1]
      b += image.data[i + 2]
      count += 1
    }
  }
  return [Math.round(r / count), Math.round(g / count), Math.round(b / count)]
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

/** 截图并采样：返回 { file, center, lowerRight }（center 是页面正中 320×320 的平均色） */
async function shootAndSample(cdp, name) {
  // Windows 上窗口被别的窗口盖住时合成会暂停，截到的是陈旧画面。
  // 每次截图前都重新置前一次，只在开头置前不够。
  await cdp.send('Page.bringToFront', {})
  await wait(700)
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  const buffer = Buffer.from(shot.data, 'base64')
  const file = path.join(OUT_DIR, name)
  fs.writeFileSync(file, buffer)
  const image = decodePng(buffer)
  const cx = image.width / 2
  const cy = image.height / 2
  const center = averageColor(image, cx - 160, cy - 160, cx + 160, cy + 160)
  console.log(`  → ${name}  ${image.width}×${image.height}  中部平均 rgb(${center.join(', ')})`)
  return { file, center, image }
}

const red = value => value[0] - value[1]

async function openAllThemes(cdp) {
  // 主题列表默认只显示当前那一张，得先点「更多」把全部摊开
  await cdp.eval(`(() => {
    const more = [...document.querySelectorAll('li')].find(e => e.textContent.includes('更多'))
    if (more) more.click()
    return true
  })()`)
  await wait(600)
}

async function readThemeCards(cdp) {
  const raw = await cdp.eval(`(() => {
    const items = [...document.querySelectorAll('li[aria-label]')]
      .filter(e => e.querySelector('span'))
      // CSS module 给出的类名是 _active_<hash>，前后都是下划线，
      // 所以不能用 \bactive\b —— 下划线也算 word 字符，边界匹配不上。
      .map(e => ({ name: e.getAttribute('aria-label'), active: /active/i.test(e.className) }))
    return JSON.stringify(items)
  })()`)
  return JSON.parse(raw ?? '[]')
}

async function clickTheme(cdp, name) {
  return cdp.eval(`(() => {
    const item = [...document.querySelectorAll('li[aria-label]')].find(e => e.getAttribute('aria-label') === ${JSON.stringify(name)})
    if (!item) return false
    item.click()
    return true
  })()`)
}

async function goSetting(cdp) {
  await cdp.eval("location.hash = '#/setting'")
  await wait(2000)
  const ok = await cdp.eval(`(() => {
    const tab = [...document.querySelectorAll('h2[role="tab"]')].find(e => e.getAttribute('aria-label') === '基本设置')
    if (!tab) return false
    tab.click()
    return true
  })()`)
  if (!ok) throw new Error('找不到「基本设置」tab')
  await wait(900)
}

async function goHome(cdp) {
  await cdp.eval("location.hash = '#/'")
  await wait(1200)
}

async function setWallpaper(cdp, dataUrl) {
  await cdp.eval(`document.documentElement.style.setProperty('--background-image', 'url("${dataUrl}")')`)
  await wait(600)
}

async function clearWallpaper(cdp) {
  await cdp.eval("document.documentElement.style.removeProperty('--background-image')")
  await wait(400)
}

/** 打开播放详情页；返回是否成功 */
async function openPlayDetail(cdp) {
  const opened = await cdp.eval(`(() => {
    if (document.querySelector('[data-view="play-detail"]')) return 'already'
    const trigger = document.querySelector('[class*="__picContent--"]')
    if (!trigger) return 'no-trigger'
    trigger.click()
    return 'clicked'
  })()`)
  await wait(1600)
  return opened
}

async function closePlayDetail(cdp) {
  // 关闭按钮在 ControlBtnsRightHeader 里，是 3 个带 title 的按钮之一（关闭 / 最小化 / 隐藏）。
  // 注意取 `button[title]` —— 播放详情页没有 <header> 元素（`header button` 一定选不到，
  // 会静默地"关不掉"，后面所有截图就都拍在播放详情页上了）。
  const result = await cdp.eval(`(() => {
    const detail = document.querySelector('[data-view="play-detail"]')
    if (!detail) return 'none'
    const btn = detail.querySelector('button[title]')
    if (!btn) return 'no-button'
    btn.click()
    return 'clicked'
  })()`)
  if (result === 'clicked') await wait(1000)
  return result
}

/** 主界面上做一张纯色壁纸。用 canvas 出 data URL，不依赖任何外部文件。 */
const makeWallUrl = (cdp, color) => cdp.eval(`(() => {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = ${JSON.stringify(color)}
  ctx.fillRect(0, 0, 64, 64)
  return canvas.toDataURL('image/png')
})()`)

const readMainBg = cdp => cdp.eval(`(() => {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--color-main-background').trim()
  const nums = value.match(/[\\d.]+/g) || []
  return JSON.stringify({ raw: value, alpha: nums.length >= 4 ? Number(nums[3]) : 1 })
})()`)

// 这个分号不能省：上一行以函数表达式结尾，这里又以 `(` 开头，
// 没有它会被解析成 `readMainBg(...)(async () => ...)` —— 整个 IIFE 变成
// 箭头函数体的一部分，永远不执行，node 事件循环空掉后静默 exit 0（查了半天）。
;(async () => {
  const targets = await getTargets()
  const page = targets.find(t => t.type === 'page' && String(t.url).startsWith('http'))
  if (!page) throw new Error('没有找到主窗口页面，应用起了吗？')
  const cdp = await Cdp.connect(page.webSocketDebuggerUrl)
  console.log('已连接：', page.title)

  // 起点整页重载：dev 是 HMR，页面可能停在半热替换状态，
  // 那种状态下连设置页都渲染不出来，会得到一堆假失败。
  await cdp.eval('location.reload()')
  await wait(5000)
  const ready = await cdp.eval("!!(window.lxData && window.lxData.appSetting && document.getElementById('container'))")
  if (!ready) throw new Error('重载后应用没就绪')
  // dev 下只要 eslint 或编译报错，webpack-dev-server 就弹一个全屏 overlay。
  // 它盖在所有东西上面，会把每张截图染成一片暗色 —— 而暗色又特别像「深色壁纸生效了」，
  // 极容易读成「功能正常」。所以起点就把这种情况变成显式失败。
  const overlay = await cdp.eval("!!document.querySelector('#webpack-dev-server-client-overlay')")
  if (overlay) throw new Error('dev 弹了编译错误 overlay（界面被盖住，截图全废），先修掉编译错误再跑')
  console.log('应用就绪，当前歌曲：', await cdp.eval('window.lxData.musicInfo.name || "(无)"'))

  const WALL = '#d2452f' // 一个饱和度很高的红，透出来时一眼能看出「红度」
  let originalThemeName = ''

  try {
    console.log('\n[1/6] 设置页：通透主题进列表了吗')
    await goSetting(cdp)
    await openAllThemes(cdp)
    const cards = await readThemeCards(cdp)
    const names = cards.map(c => c.name)
    console.log('  主题数：', names.length)
    console.log('  卡片：', names.join(' · '))
    check(names.includes('澄澈泛音'), '列表里有「澄澈泛音」', `列表里没有「澄澈泛音」，只有：${names.join(' · ')}`)
    check(names.includes('澄澈夜色'), '列表里有「澄澈夜色」', '列表里没有「澄澈夜色」')

    const activeCard = cards.find(c => c.active)
    originalThemeName = activeCard ? activeCard.name : ''
    console.log('  当前主题：', originalThemeName || '(认不出来)')

    console.log('\n[2/6] 不透明主题 → 通透主题')
    // 先把起点落回「余音绕梁」（已知不透明）。上一次跑可能把主题留在「澄澈泛音」上，
    // 那样这一步就测不到「从看不见到看得见」这个真实转变了。
    const baseline = '余音绕梁'
    await clickTheme(cdp, baseline)
    await wait(1600)
    const before = JSON.parse(await readMainBg(cdp))
    console.log(`  「${baseline}」--color-main-background =`, before.raw, `(alpha ${before.alpha})`)
    check(before.alpha >= 0.99, `起点是不透明主题（alpha ${before.alpha}），壁纸本该看不见`, `起点就不是不透明主题（alpha ${before.alpha}），这一步测不到东西`)
    const switched = await clickTheme(cdp, '澄澈泛音')
    if (!switched) throw new Error('点不到「澄澈泛音」卡片')
    await wait(1600)
    const after = JSON.parse(await readMainBg(cdp))
    console.log('  切换后 --color-main-background =', after.raw, `(alpha ${after.alpha})`)
    check(after.alpha < 0.99, `内容层变半透明了（alpha ${after.alpha}）`, `内容层还是不透明（alpha ${after.alpha}）`)
    check(Math.abs(after.alpha - 0.62) < 0.02, `alpha 就是主题里写的 0.62`, `alpha 是 ${after.alpha}，与主题定义不符`)
    const blur = await cdp.eval("getComputedStyle(document.documentElement).getPropertyValue('--background-blur').trim()")
    console.log('  --background-blur =', blur)
    check(Number(blur) > 0, `主题自带模糊（${blur}），半透明上的文字不至于和壁纸细节打架`, `模糊没生效：${blur}`)
    await shootAndSample(cdp, '22-glass-theme-setting.png')

    console.log('\n[3/6] 通透主题 + 红壁纸：播放详情页')
    await goHome(cdp)
    await closePlayDetail(cdp)
    const wallUrl = await makeWallUrl(cdp, WALL)
    await setWallpaper(cdp, wallUrl)
    const opened = await openPlayDetail(cdp)
    if (opened === 'no-trigger') throw new Error('找不到打开播放详情页的入口')
    const glassShot = await shootAndSample(cdp, '23-glass-wallpaper.png')
    check(red(glassShot.center) > 12, `壁纸透出来了（中部 rgb(${glassShot.center.join(', ')})，红度 ${red(glassShot.center)}）`, `壁纸还是看不见（中部 rgb(${glassShot.center.join(', ')})，红度 ${red(glassShot.center)}）`)

    console.log('\n[4/6] 同一张壁纸，换回不透明主题')
    await closePlayDetail(cdp)
    await goSetting(cdp)
    await openAllThemes(cdp)
    const back = await clickTheme(cdp, baseline)
    check(back, `切回「${baseline}」`, `切不回「${baseline}」`)
    await wait(1600)
    const opaque = JSON.parse(await readMainBg(cdp))
    console.log('  现在 --color-main-background =', opaque.raw, `(alpha ${opaque.alpha})`)
    check(opaque.alpha >= 0.99, `内容层恢复不透明（alpha ${opaque.alpha}）`, `内容层还是半透明（alpha ${opaque.alpha}）`)
    await goHome(cdp)
    await openPlayDetail(cdp)
    const opaqueShot = await shootAndSample(cdp, '24-opaque-wallpaper.png')

    const glassRed = red(glassShot.center)
    const opaqueRed = red(opaqueShot.center)
    console.log(`  红度对比：通透 ${glassRed}  vs  不透明 ${opaqueRed}`)
    check(glassRed > opaqueRed + 8,
      `同一张壁纸，通透主题下明显更「透」（红度 ${glassRed} > ${opaqueRed}）`,
      `两个主题看不出差别（通透 ${glassRed} vs 不透明 ${opaqueRed}），壁纸可见性没被真正解决`)

    console.log('\n[5/6] 主题编辑器里的「一键通透」')
    await closePlayDetail(cdp)
    await clearWallpaper(cdp)
    await goSetting(cdp)
    await openAllThemes(cdp)
    // 内置主题是**不能编辑**的：handleEditTheme 第一行就是 `if (theme?.isDefault) return`
    // （内置主题只能被"另存为新主题"）。所以走「添加主题」卡片，
    // 它调到的是同一个编辑器，也就装得下同一个按钮。
    const openEditor = await cdp.eval(`(() => {
      const add = [...document.querySelectorAll('li[aria-label]')]
        .find(e => e.getAttribute('aria-label') === '添加主题')
      if (!add) return false
      add.click()
      return true
    })()`)
    check(openEditor, '打开了主题编辑器', '找不到「添加主题」卡片')
    await wait(1600)
    const editor = JSON.parse(await cdp.eval(`(() => {
      const buttons = [...document.querySelectorAll('button')]
      const button = buttons.find(e => /一键通透|恢复不透明/.test(e.textContent))
      return JSON.stringify({
        found: !!button,
        label: button ? button.textContent.replace(/\\s+/g, ' ').trim() : '',
        total: buttons.length,
        sample: buttons.slice(0, 16).map(e => e.textContent.replace(/\\s+/g, ' ').trim().slice(0, 10)),
      })
    })()`))
    console.log('  按钮：', editor.found ? `「${editor.label}」` : `(没找到，页面上共 ${editor.total} 个按钮)`)
    if (!editor.found) console.log('  前 16 个按钮的文字：', JSON.stringify(editor.sample))
    check(editor.found, `主题编辑器里有「${editor.label}」按钮`, '主题编辑器里找不到「一键通透」按钮')
    if (editor.found) {
      await cdp.eval(`(() => {
        const button = [...document.querySelectorAll('button')].find(e => /一键通透|恢复不透明/.test(e.textContent))
        button.click()
        return true
      })()`)
      await wait(800)
      const toggled = JSON.parse(await cdp.eval(`(() => {
        const button = [...document.querySelectorAll('button')].find(e => /一键通透|恢复不透明/.test(e.textContent))
        return JSON.stringify({ label: button ? button.textContent.trim() : '' })
      })()`))
      console.log('  点击后按钮变成：', toggled.label)
      check(toggled.label.includes('恢复'), `点完变成「${toggled.label}」，说明确实切到了半透明`, `点完按钮是「${toggled.label}」，状态没变`)
      await shootAndSample(cdp, '25-theme-editor-translucent.png')
    }
  } finally {
    console.log('\n[6/6] 复原')
    // 编辑器不用特意去关：它的「取消」按钮在上游被注释掉了（只剩点遮罩一条路），
    // 而且我们只点了「一键通透」、从没点保存，所以它不落盘、无副作用。
    // 最后 reload 一次，界面和 Vue 状态就都回到干净状态了。
    await clearWallpaper(cdp)
    await goSetting(cdp)
    await openAllThemes(cdp)
    if (originalThemeName) {
      const back = await clickTheme(cdp, originalThemeName)
      await wait(1400)
      const restored = JSON.parse(await readMainBg(cdp))
      console.log(`  主题回到运行前的「${originalThemeName}」（${back ? '已切回' : '没切到'}）：--color-main-background = ${restored.raw}`)
    }
    await cdp.eval('location.reload()')
    await wait(4000)
    console.log('  已重载，界面恢复干净状态')
    cdp.ws.close()
  }

  console.log('')
  if (problems.length) {
    console.log(`FAIL：${problems.length} 项没过`)
    problems.forEach(p => console.log('  -', p))
    process.exit(1)
  }
  console.log('PASS：通透主题进了列表、内容层可控，且同一张壁纸在两种主题下的可见性有量出来的差别')
  process.exit(0)
})().catch(error => {
  // 出错也要把 WebSocket 关掉，否则 node 会一直挂着不退出
  console.error('失败：', error.message)
  process.exit(1)
})
