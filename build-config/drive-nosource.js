#!/usr/bin/env node
/**
 * 阶段 5「清理内置平台接口」的驱动验证。
 *
 * 目的：证明删掉六个平台的接口实现之后，界面在「一个源都没有」的状态下
 * 既不会崩，也不会留下平台音源的入口。
 *
 * 六步：
 *   1. 起点守卫 —— dev 一旦弹编译错误 overlay，界面被盖住、截图全废
 *   2. 开网络记录 → 整页重载，然后注入未捕获错误收集器（error + unhandledrejection）
 *   3. 依次访问 搜索 / 排行榜 / 歌单 / 我的列表 / 下载，每页都要有内容、不白屏
 *   4. 这些页面上不该再出现任何平台音源的名字（内置源的 tab 应当已经消失），
 *      URL 里也不该残留失效的 `?source=kw`
 *   5. 全程未捕获错误数应为 0
 *   6. 网络层：不该有「平台接口」请求 —— 这是红线最硬的证据。图片类请求
 *      （用户自有音乐数据里记着的封面地址）单独报告，不算违规
 *
 * 前提：`env -u ELECTRON_RUN_AS_NODE npm run dev -- --remote-debugging-port=9222`
 *
 * 通用规矩见 MEMORY.md「驱动验证脚本」一节。这里特别用到的几条：
 *   - 起点整页重载（dev 是 HMR，可能停在半热替换状态）
 *   - 每次截图前 Page.bringToFront（Windows 上被盖住的窗口会暂停合成）
 *   - 重载后要等够久：启动期 `viewPrevState` 恢复视图 / `handleEnvParams` 会
 *     连着跳几次，等太短的话脚本设的 hash 会被盖掉（实测过）
 */

const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const WebSocket = require('ws')

const PORT = 9222
const OUT_DIR = path.join(__dirname, '..', 'notes', 'preview', 'splash')

/** 路由路径来自 src/renderer/router.ts（createWebHashHistory） */
const ROUTES = [
  ['/search', '搜索', 'search'],
  ['/leaderboard', '排行榜', 'leaderboard'],
  ['/songList/list', '歌单', 'songlist'],
  ['/list', '我的列表', 'mylist'],
  ['/download', '下载', 'download'],
]

/**
 * 内置源已经删掉了，这些名字不该再出现在界面上。
 * 中英两套别名都列上 —— 设置项 common.sourceNameType 决定显示哪一套。
 */
const PLATFORM_WORDS = [
  '酷我音乐', '酷狗音乐', '企鹅音乐', '咪咕音乐', '百度音乐', '虾米音乐',
  '小蜗音乐', '小枸音乐', '小秋音乐', '小蜜音乐', '小芸音乐', '小霞音乐', '小杜音乐',
]

/**
 * 内置平台源的 id。
 *
 * 用来查 URL 里有没有残留的 `?source=kw` —— 那是本轮新修的一处：页面守卫
 * 过去只在 `source == null` 时才去读持久化设置，显式带在 URL 上的失效 source
 * 会被直接接受；而存量用户的盘上（和搜索结果页旧书签里）就落着 `'kw'`。
 * 归一化见 `renderer/utils/data.ts` 的 `clearInvalidSourceField`。
 */
const PLATFORM_IDS = ['kw', 'kg', 'tx', 'wy', 'mg', 'bd', 'xm']
const STALE_SOURCE_RXP = new RegExp(`[?&]source=(${PLATFORM_IDS.join('|')})(&|$)`)

/**
 * 平台服务器域名。
 *
 * 这一步是**红线最硬的证据**：删掉接口实现之后，运行期不该再向任何音乐平台
 * 的服务器发请求。界面上看不到入口 ≠ 没有请求 —— 上游那些实现里是真有
 * `httpFetch('http://www.kuwo.cn/api/www/music/musicInfo?mid=...')` 这类调用的
 * （见 01 文档「死代码这个判断只对了一半」）。所以这里从网络层正面取证。
 *
 * 用子串匹配，覆盖各自常见的几个域名形态。
 */
const PLATFORM_HOSTS = [
  'kuwo.cn',
  'kugou.com',
  'y.qq.com', 'qqmusic.qq.com',
  'music.163.com', 'music.126.net',
  'migu.cn',
  'taihe.com',
  'xiami.com',
]

/**
 * 图片 / 封面类请求的判定。
 *
 * 为什么要单独拎出来 —— 实测确实会有请求发往 `img1.kuwo.cn`，来源不是代码：
 * 本地音乐列表存在 `OvertoneData/overtone.data.db`，里面每首歌带着当初抓取时
 * 记下的**封面地址**（`img: 'http://img1.kuwo.cn/star/albumcover/...'`）。
 * 用户旧数据 → 界面渲染封面 → 出网一次。
 *
 * 这不是「内置了平台接口」，但也不能装作没发生：脚本因此分两级断言 ——
 *   硬断言：**平台接口类请求必须为 0**（那才是红线）
 *   软报告：图片类请求逐条打印，供人工确认来源
 *
 * 封面 CDN 的 host 通常以 img / pic / star 开头，路径以图片扩展名结尾。
 */
const isImageLikeRequest = url => {
  try {
    const { host, pathname } = new URL(url)
    if (/^(img|pic|imge|star|p\d)/i.test(host)) return true
    return /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(pathname)
  } catch { return false }
}

let failed = 0
const check = (ok, label, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${!ok && detail ? ' —— ' + detail : ''}`)
  if (!ok) failed += 1
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

const getTargets = () => new Promise((resolve, reject) => {
  http.get(`http://127.0.0.1:${PORT}/json`, response => {
    let body = ''
    response.on('data', chunk => { body += chunk })
    response.on('end', () => {
      try { resolve(JSON.parse(body)) } catch (error) { reject(error) }
    })
  }).on('error', reject)
})

async function connect() {
  const targets = await getTargets()
  // 必须滤掉 devtools:// —— 否则调试器自己的页面会被当成主窗口
  const page = targets.find(target => target.type === 'page' && String(target.url).startsWith('http'))
  if (!page) throw new Error('没有找到主窗口页面（dev 起来了吗？）')

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise(resolve => ws.once('open', resolve))

  let seq = 0
  const send = (method, params) => new Promise((resolve, reject) => {
    const id = ++seq
    const onMessage = data => {
      const message = JSON.parse(data)
      if (message.id !== id) return
      ws.off('message', onMessage)
      if (message.error) reject(new Error(JSON.stringify(message.error)))
      else resolve(message.result)
    }
    ws.on('message', onMessage)
    ws.send(JSON.stringify({ id, method, params: params ?? {} }))
  })

  const evalJs = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) {
      throw new Error(String(result.exceptionDetails.text) + ' ' + String(result.exceptionDetails.exception?.description ?? ''))
    }
    return result.result.value
  }

  const shot = async name => {
    await send('Page.bringToFront')
    await wait(320)
    const data = await send('Page.captureScreenshot', { format: 'png' })
    const target = path.join(OUT_DIR, name)
    fs.writeFileSync(target, Buffer.from(data.data, 'base64'))
    console.log('  →', name, fs.statSync(target).size, 'B')
  }

  /**
   * 网络请求记录。
   *
   * `send()` 只认「带 id 的响应」，这里另起一个监听收事件流里的
   * `Network.requestWillBeSent`。必须单独挂 —— 事件消息没有 id，
   * 会被 `send()` 那个 handler 全部忽略。
   */
  const requests = []
  ws.on('message', data => {
    let message
    try { message = JSON.parse(data) } catch { return }
    if (message.method !== 'Network.requestWillBeSent') return
    requests.push(message.params.request.url)
  })

  return { ws, send, evalJs, shot, requests }
}

;(async () => {
  const cdp = await connect()
  console.log('\n阶段 5 · 内置平台接口清理后的界面验证\n')

  // ── 1. 起点守卫 ────────────────────────────────────────────
  const overlay = await cdp.evalJs("!!document.querySelector('#webpack-dev-server-client-overlay')")
  if (overlay) {
    throw new Error('dev 弹了编译错误 overlay（界面被盖住、截图全废），先修掉编译错误再跑')
  }
  console.log('步骤 1 · 起点守卫：没有编译错误 overlay')

  // ── 1.5 开网络记录（必须在重载前开，才能收到整页重载后的全部请求）──
  await cdp.send('Network.enable')
  console.log('步骤 1.5 · 已开启网络请求记录')

  // ── 2. 整页重载 + 注入错误收集器 ────────────────────────────
  console.log('步骤 2 · 整页重载并注入未捕获错误收集器')
  await cdp.evalJs('location.hash = "#/search"')
  await cdp.send('Page.reload')
  // 等久一点：重载后 `core/useApp` 会用 getViewPrevState 恢复上次视图、
  // handleEnvParams / initData 之后还可能再跳一次，几个异步导航会连成一串。
  // 只等 4 秒的话，下面第一轮设的 hash 会被这些启动期导航盖掉（实测过：
  // 第 1 轮看到的是 leaderboard、第 2 轮看到的是 list）。
  await wait(9000)
  await cdp.evalJs(`(() => {
    window.__errors = []
    window.__seen = new Set()
    const push = text => {
      if (window.__seen.has(text)) return
      window.__seen.add(text)
      window.__errors.push(text)
    }
    const detail = error => {
      const message = String((error && error.message) || error)
      const stack = String((error && error.stack) || '')
      // 只留前 3 行 stack —— 足够定位到文件与行号，又不会把日志淹掉
      return message + ' @ ' + stack.split('\\n').slice(1, 4).map(line => line.trim()).join(' / ')
    }
    window.addEventListener('error', event => { push('error: ' + detail(event.error || event.message)) })
    window.addEventListener('unhandledrejection', event => { push('rejection: ' + detail(event.reason)) })
    return true
  })()`)
  check(true, '错误收集器已注入（收 error 与 unhandledrejection）')

  // ── 3 & 4. 逐页检查 ────────────────────────────────────────
  /**
   * 等路由真正落到目标路径。
   *
   * 启动期的恢复导航可能滞后到达，设完 hash 立刻读会读到别人的路径。
   * 这里轮询到匹配为止（每次 250ms，最多 6 秒），最后无论如何都返回当前值
   * 交给断言，避免把「等超时」静默当成通过。
   */
  const waitForHash = async route => {
    for (let i = 0; i < 24; i++) {
      try {
        const hash = await cdp.evalJs('location.hash')
        if (String(hash).includes(route)) return hash
      } catch { /* 导航中 evaluate 可能被打断，下一轮再试 */ }
      await wait(250)
    }
    return await cdp.evalJs('location.hash')
  }

  const words = JSON.stringify(PLATFORM_WORDS)

  /**
   * 关掉阻断式提示。
   *
   * CDP 环境里没有声卡，上游会弹「音频输出设备为空」并常驻在内容区正中，
   * 把留档图挡住一半 —— 它跟本次验证无关，但要清掉才能看清页面。
   */
  const dismissBlockingDialog = async () => {
    try {
      await cdp.evalJs(`(() => {
        const el = [...document.querySelectorAll('button')].find(b => (b.textContent || '').trim() === '我知道了')
        if (!el) return false
        el.click()
        return true
      })()`)
    } catch { /* 导航中可能打断，忽略 */ }
  }

  for (const [route, label, slug] of ROUTES) {
    console.log(`步骤 3 · ${label}（${route}）`)
    await cdp.evalJs(`location.hash = '#${route}'`)
    await waitForHash(route)
    await dismissBlockingDialog()
    await wait(1400)
    const info = await cdp.evalJs(`(() => {
      const root = document.querySelector('#root')
      const text = document.body.textContent || ''
      return {
        hasRoot: !!root,
        textLen: text.length,
        hash: location.hash,
        hits: ${words}.filter(word => text.includes(word)),
      }
    })()`)
    await cdp.shot(`26-nosource-${slug}.png`)
    check(info.hasRoot && info.textLen > 200, `${label}页渲染出内容（textContent ${info.textLen} 字）`, JSON.stringify(info))
    check(String(info.hash).includes(route), `${label}页路由切过去了（${info.hash}）`, info.hash)
    check(info.hits.length === 0, `${label}页没有平台音源入口`, '命中：' + info.hits.join('、'))
    check(!STALE_SOURCE_RXP.test(info.hash), `${label}页 URL 里没有失效 source 残留`, info.hash)
  }

  // ── 5. 未捕获错误 ──────────────────────────────────────────
  console.log('步骤 5 · 全程未捕获错误')
  const errors = await cdp.evalJs('window.__errors || []')
  check(errors.length === 0, '全程 0 个未捕获错误 / 未处理 rejection', errors.map(text => '\n      ' + text).join(''))

  // ── 6. 网络层：不该访问任何音乐平台服务器（红线最硬的证据）────
  console.log(`步骤 6 · 网络请求（共记录 ${cdp.requests.length} 条）`)
  const platformHits = cdp.requests.filter(url => PLATFORM_HOSTS.some(host => url.includes(host)))
  const apiHits = platformHits.filter(url => !isImageLikeRequest(url))
  const imageHits = platformHits.filter(url => isImageLikeRequest(url))

  check(apiHits.length === 0, '全程 0 次「平台接口」请求（红线）',
    apiHits.map(url => '\n      ' + url).join(''))

  if (imageHits.length) {
    console.log(`     ⚠ 另有 ${imageHits.length} 次**图片类**请求发往平台 CDN —— 来自用户自有音乐数据里记着的封面地址，不是代码内置的接口：`)
    for (const url of [...new Set(imageHits)]) console.log('       ' + url)
  } else {
    console.log('     （连图片类请求也没有）')
  }

  const external = [...new Set(cdp.requests
    .filter(url => !/^(devtools|blob|data):/.test(url) && !url.includes('localhost') && !url.includes('127.0.0.1'))
    .map(url => { try { return new URL(url).host } catch { return url } }))]
  console.log(`     外部域名（${external.length} 个）：${external.join('、') || '（无）'}`)

  cdp.ws.close()
  console.log(`\n${failed ? `✗ ${failed} 项未通过` : '✓ 全部通过'}\n`)
  process.exit(failed ? 1 : 0)
})().catch(error => {
  console.error('\n✗ 脚本失败：', error.message, '\n')
  process.exit(1)
})
