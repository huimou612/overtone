/**
 * 驱动界面验证「双档外观（阶段 7.3）」：
 *   1. 设置页读回「外观模式」组（两档选项文案 + 当前档提示）；
 *   2. 切到个性模式，量几何：侧栏收起（right≈0）、内容区铺满；
 *   3. 把鼠标移到窗口左边缘，确认侧栏真的滑出来（这靠 CSS :has() + :hover，
 *      编译过了不代表能触发 —— 必须用真实输入事件走一遍）；
 *   4. 重载后设一个当前歌曲，确认自动进播放详情页（启动即沉浸）；
 *   5. 切回经典模式，确认一切复原。
 *
 * 为什么不能只看编译结果：`#left` 的收放全靠绝对定位 + transform，这类东西
 * 编译期一路绿灯，而漏掉一个 `position: absolute` 就会让「收起」变成
 * 「内容区被挤走一半」—— 只有量真实 rect 才知道。
 *
 * 前提：应用以 `npm run dev -- --remote-debugging-port=9222` 启动。
 */
const WebSocket = require('ws')
const http = require('node:http')
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

/** 量侧栏与内容区的几何：收没收起、铺没铺满，全看这里的数字 */
async function readLayout(cdp) {
  const raw = await cdp.eval(`(() => {
    const container = document.getElementById('container')
    const left = document.getElementById('left')
    const right = document.getElementById('right')
    const hotzone = document.getElementById('aside-hotzone')
    if (!container || !left || !right) return null
    const c = container.getBoundingClientRect()
    const l = left.getBoundingClientRect()
    const r = right.getBoundingClientRect()
    return JSON.stringify({
      personal: container.classList.contains('mode-personal'),
      hasHotzone: !!hotzone,
      // 注意所有判定都要以 containerLeft 为基准：透明窗口下 #root 有一圈 8px 的
      // rootOffset，绝对定位的 #left 的 left:0 是从那里开始的，直接拿 0 比会误判成「没收起」
      containerLeft: Math.round(c.left),
      containerWidth: Math.round(c.width),
      leftLeft: Math.round(l.left),
      leftRight: Math.round(l.right),
      leftPosition: getComputedStyle(left).position,
      rightLeft: Math.round(r.left),
      rightWidth: Math.round(r.width),
      leftTransform: getComputedStyle(left).transform,
    })
  })()`)
  return raw ? JSON.parse(raw) : null
}

/** 热区中心的视口坐标：派发鼠标事件要用它，别自己猜（会被 rootOffset 坑） */
async function readHotzoneCenter(cdp) {
  const raw = await cdp.eval(`(() => {
    const el = document.getElementById('aside-hotzone')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), width: Math.round(r.width) })
  })()`)
  return raw ? JSON.parse(raw) : null
}

/** 直接改配置项。只用在「把起点拨回经典模式」和最后的复原上 ——
 *  真正的切换链路（点下拉项）在第 2 步里单独走了一遍，不靠这个。 */
async function setMode(cdp, mode) {
  await cdp.eval(`window.lxData.updateSetting({ 'common.appMode': ${JSON.stringify(mode)} })`)
  await wait(1400)
}

/** 等应用就绪：整页重载之后要重新拉 bundle，固定 sleep 不可靠 */
async function waitAppReady(cdp, timeoutMs = 25000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const ok = await cdp
      .eval("!!(window.lxData && window.lxData.musicInfo && document.getElementById('container'))")
      .catch(() => false)
    if (ok) {
      await wait(800) // 再给路由和首屏一点时间
      return true
    }
    await wait(500)
  }
  return false
}

/** 关掉播放详情页：它盖在整个界面上，不关掉就看不到侧栏，留档图也说明不了问题。
 *  取右上角那个带 title 的「隐藏」按钮（ControlBtnsRightHeader 的第一个按钮）。 */
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

/** 把鼠标挪到右下角空白处：CDP 派发的鼠标位置会留在页面上，
 *  不挪开的话下一次截图里可能挂着一个 tooltip。 */
async function parkMouse(cdp) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1080, y: 660, button: 'none' })
  await wait(300)
}

async function main() {
  const targets = await getTargets()
  const pages = targets.filter(item => item.type === 'page' && String(item.url).startsWith('http'))
  if (!pages.length) throw new Error('找不到主窗口页面，应用没起来？')
  const cdp = await Cdp.connect(pages[0].webSocketDebuggerUrl)
  console.log('调试目标：', pages[0].title)

  // Windows 的窗口遮挡检测会把被盖住的窗口判成 hidden，验证前先把窗口恢复正常并带到前台
  try {
    const { windowId } = await cdp.send('Browser.getWindowForTarget', { targetId: pages[0].id })
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } })
  } catch (error) {
    console.log('  （恢复窗口状态失败，继续：', error.message, '）')
  }
  await cdp.send('Page.bringToFront', {})
  await wait(500)

  // 先整页重载一次：dev 是 HMR 热替换，改完代码后页面可能停在半热替换的状态
  // （路由或组件树不干净，连设置页都渲染不出来）。重载让所有步骤跑在确定状态上，
  // 顺带让这个脚本可以重复跑。
  await cdp.eval('location.reload()')
  if (!await waitAppReady(cdp)) throw new Error('重载后应用没就绪')

  // 起点必须是经典模式、且播放详情页关着，否则后面「切过去 / 切回来」的对照没有意义
  await setMode(cdp, 'classic')
  const closedAtStart = await closePlayDetail(cdp)
  console.log('  起点：经典模式，播放详情页', closedAtStart === 'none' ? '本来就没开' : '已关闭')

  console.log('\n[1/5] 设置页读回「外观模式」组')
  await cdp.eval("location.hash = '#/setting'")
  await wait(2200)
  const tabOk = await cdp.eval(`(() => {
    const tab = [...document.querySelectorAll('h2[role="tab"]')].find(e => e.getAttribute('aria-label') === '外观与个性化')
    if (!tab) return false
    tab.click()
    return true
  })()`)
  if (!tabOk) throw new Error('找不到「外观与个性化」tab')
  await wait(900)

  const panel = await cdp.eval(`(() => {
    // h3#appearance_mode 在 dd 内部，所以要从它往上找最近的 dd
    // （往后找 nextElementSibling 永远找不到）。取选择器时再收窄到它所在的组容器，
    // 免得拿到同一个 dd 里「启动动画」那组的控件。
    const dt = document.getElementById('appearance_mode')
    if (!dt) return null
    const group = dt.parentElement
    const sel = group.querySelector('.label-content')
    return JSON.stringify({
      title: dt.textContent.trim(),
      text: group.textContent.replace(/\\s+/g, ' ').trim(),
      current: sel ? (sel.querySelector('.label') || sel).textContent.trim() : null,
    })
  })()`)
  if (!panel) throw new Error('设置页里找不到「外观模式」组')
  const p = JSON.parse(panel)
  console.log('  标题：', p.title, '| 当前档：', p.current)
  check(p.title.length > 0, '外观模式组有标题', '外观模式组没有标题')
  check(p.current === '经典模式', `默认档是经典模式（读到「${p.current}」）`, `默认档不对：${p.current}`)
  check(p.text.includes('侧栏常驻'), '当前档的说明文案已渲染', '说明文案没渲染')

  // 展开下拉，确认两档都在（base-selection 只显示当前选中项，不展开是看不到另一个的）
  await cdp.eval(`(() => {
    const group = document.getElementById('appearance_mode').parentElement
    group.querySelector('.label-content').click()
    return true
  })()`)
  await wait(700)
  const listRaw = await cdp.eval(`(() => {
    const group = document.getElementById('appearance_mode').parentElement
    return JSON.stringify([...group.querySelectorAll('.selection-list li')].map(e => e.textContent.trim()))
  })()`)
  const options = JSON.parse(listRaw ?? '[]')
  console.log('  下拉选项：', options.join(' / '))
  check(options.includes('经典模式') && options.includes('个性模式'), '下拉里两档都在', `下拉选项不全：${options}`)
  await shot(cdp, '05-mode-setting.png')

  console.log('\n[2/5] 点「个性模式」，量几何')
  // 走真实交互（点下拉项）而不是直接调 updateSetting —— 后者绕过了整条 UI 链路
  const switched = await cdp.eval(`(() => {
    const group = document.getElementById('appearance_mode').parentElement
    const item = [...group.querySelectorAll('.selection-list li')].find(e => e.textContent.trim() === '个性模式')
    if (!item) return false
    item.click()
    return true
  })()`)
  if (!switched) throw new Error('下拉里点不到「个性模式」')
  await wait(1400)
  await cdp.eval("location.hash = '#/'")
  await wait(1200)
  // 回主页后确保播放详情页关着（它会盖住整个界面），留档图才拍得到侧栏收放
  await closePlayDetail(cdp)
  await parkMouse(cdp)
  const personal = await readLayout(cdp)
  console.log('  布局：', JSON.stringify(personal))
  // 所有横向判定都以 containerLeft 为基准（#root 那圈 8px 的 rootOffset 不算「没收起」）
  const base = personal.containerLeft
  check(personal.personal, '#container 带上了 mode-personal', '模式 class 没挂上')
  check(personal.hasHotzone, '左侧唤出热区已挂出', '唤出热区没挂出')
  check(personal.leftPosition === 'absolute', '#left 脱离文档流（absolute）', `#left 仍是 ${personal.leftPosition}，收起会挤走内容区`)
  check(personal.leftRight <= base + 1, `侧栏已收起（right=${personal.leftRight}，基准 ${base}）`, `侧栏没收起（right=${personal.leftRight}，基准 ${base}）`)
  check(Math.abs(personal.rightWidth - personal.containerWidth) <= 2,
    `内容区铺满（${personal.rightWidth}/${personal.containerWidth}）`,
    `内容区没铺满（${personal.rightWidth}/${personal.containerWidth}）`)
  await shot(cdp, '06-mode-personal.png')

  console.log('\n[3/5] 鼠标移到左边缘，确认侧栏滑出')
  // 派发真实输入事件：:hover 与 :has() 都靠它触发，直接改 class 是测不到的。
  // 坐标必须从热区 rect 算 —— 自己写个 x=3 会落到 rootOffset 那圈空边上，什么都hover不到。
  const hotzone = await readHotzoneCenter(cdp)
  if (!hotzone) throw new Error('读不到唤出热区的坐标')
  console.log(`  热区中心：x=${hotzone.x}, y=${hotzone.y}（宽 ${hotzone.width}）`)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hotzone.x, y: hotzone.y, button: 'none' })
  await wait(900)
  const hovered = await readLayout(cdp)
  console.log('  布局：', JSON.stringify({ leftRight: hovered.leftRight, rightLeft: hovered.rightLeft }))
  check(hovered.leftRight >= base + 10, `侧栏已滑出（right=${hovered.leftRight}）`, `侧栏没滑出（right=${hovered.leftRight}）`)
  check(hovered.rightLeft <= base + 1, '滑出时内容区没被推走（浮层，不挤压）', `滑出时内容区被推走了（left=${hovered.rightLeft}）`)
  await shot(cdp, '07-mode-aside-hover.png')

  console.log('\n[4/5] 重载，确认「启动即沉浸」')
  // 这台机器的 dev 实例里本来就有一首在放的歌（标题会显示歌名），所以分两种情况验证：
  // 有歌 → 重载后应当直接进播放页；没歌 → 不该自动进，设一首进去才该进。
  const hadSong = await cdp.eval("!!(window.lxData && window.lxData.musicInfo && window.lxData.musicInfo.id)")
  console.log('  重载前有当前歌曲：', hadSong)
  await cdp.eval('location.reload()')
  if (!await waitAppReady(cdp)) throw new Error('重载后应用没就绪')
  await wait(1500)
  const afterReload = await cdp.eval("!!document.querySelector('[data-view=\"play-detail\"]')")
  if (hadSong) {
    check(afterReload, '重载后有当前歌曲 → 自动进了播放详情页', '有当前歌曲却没自动进播放详情页')
  } else {
    check(!afterReload, '没有当前歌曲时不自动进播放页', '没有歌曲却打开了播放页')
    // 直接改 musicInfo：它就是 store 里那个 reactive 对象，watch 会被触发
    await cdp.eval("window.lxData.musicInfo.id = 'probe-1'; window.lxData.musicInfo.name = '探针曲目'")
    await wait(1500)
    const viaWatch = await cdp.eval("!!document.querySelector('[data-view=\"play-detail\"]')")
    check(viaWatch, '设入当前歌曲后自动进了播放详情页', '设入当前歌曲后没进播放详情页')
  }
  await shot(cdp, '08-mode-immersive.png')

  console.log('\n[5/5] 切回经典模式，确认复原')
  // 播放页盖着的话看不到侧栏，先关掉
  console.log('  关闭播放详情页：', await closePlayDetail(cdp))
  await parkMouse(cdp)
  await cdp.eval("location.hash = '#/'")
  await wait(800)
  await setMode(cdp, 'classic')
  const back = await readLayout(cdp)
  console.log('  布局：', JSON.stringify({ personal: back.personal, leftRight: back.leftRight, leftPosition: back.leftPosition, hasHotzone: back.hasHotzone }))
  check(!back.personal, 'mode-personal 已摘掉', 'mode-personal 没摘掉')
  check(!back.hasHotzone, '唤出热区已移除', '唤出热区还在')
  check(back.leftPosition === 'static', `侧栏恢复为文档流内（position=${back.leftPosition}）`, `侧栏仍是 ${back.leftPosition}`)
  check(back.leftRight >= back.containerLeft + 10, `侧栏恢复常驻占位（right=${back.leftRight}）`, `侧栏没恢复占位（right=${back.leftRight}）`)
  await shot(cdp, '09-mode-back-classic.png')

  console.log('\n' + '='.repeat(52))
  if (problems.length) {
    console.log('FAIL：')
    for (const text of problems) console.log('  -', text)
    process.exitCode = 1
  } else {
    console.log('PASS：双档外观切换、侧栏收放、启动即沉浸全部通过')
  }
  cdp.ws.close()
}

main().catch(error => {
  console.error('脚本出错：', error.message)
  // 出错时 WebSocket 还开着，node 不会自己退出（出了名的不退出），直接硬退
  process.exit(1)
})
