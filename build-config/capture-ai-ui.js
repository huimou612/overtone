/*
 * 界面冒烟验收：启动应用后自动导航到「设置 → AI 歌词分词」并截图。
 *
 * 前提：应用以 --remote-debugging-port=9222 启动：
 *   npm run dev -- --remote-debugging-port=9222
 *
 * 用法：node build-config/capture-ai-ui.js [输出目录]
 *   → <输出目录>/01-main.png     主窗口（证明应用能起来）
 *     <输出目录>/02-setting.png  设置页
 *     <输出目录>/03-ai-panel.png 滚到 AI 歌词分词面板
 *
 * 为什么要走 CDP 而不是截屏：窗口被遮挡也能拿到真实渲染结果，且能顺便把
 * 渲染进程的 console 错误捞出来 —— 组件接线错了会在这里现形。
 */

const fs = require('fs')
const path = require('path')
const http = require('http')
const WebSocket = require('ws')

const PORT = 9222
const outDir = path.resolve(process.argv[2] || 'notes/preview/ai-ui')
const WIDTH = 1280
const HEIGHT = 860

const sleep = ms => new Promise(r => setTimeout(r, ms))

function listTargets() {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/json', timeout: 3000 }, res => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', c => { body += c })
      res.on('end', () => {
        try { resolve(JSON.parse(body)) } catch (e) { reject(e) }
      })
    })
    req.on('timeout', () => { req.destroy(new Error('timeout')) })
    req.on('error', reject)
  })
}

async function waitForTarget(timeoutMs = 240000) {
  const deadline = Date.now() + timeoutMs
  let last = ''
  while (Date.now() < deadline) {
    try {
      const pages = (await listTargets()).filter(t => t.type === 'page')
      // 开发模式下 Electron 会自动打开 DevTools，它也是一个 page 目标（devtools://）。
      // 必须滤掉，否则截到的是 DevTools 界面。
      const appPages = pages.filter(t => /^https?:\/\//.test(t.url))
      if (appPages.length) {
        return appPages.find(t => !/lyric/i.test(t.url)) || appPages[0]
      }
      last = pages.length
        ? '只找到非 http 目标：' + pages.map(t => t.url.slice(0, 60)).join(' | ')
        : '还没有 page 目标'
    } catch (e) {
      last = e.message
    }
    await sleep(1500)
  }
  throw new Error('等待调试目标超时：' + last)
}

function cdp(wsUrl, fn) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 })
    let id = 0
    const pending = new Map()
    const consoleErrors = []

    const send = (method, params = {}) => new Promise((res, rej) => {
      const myId = ++id
      pending.set(myId, { res, rej, method })
      ws.send(JSON.stringify({ id: myId, method, params }))
    })

    ws.on('message', raw => {
      let msg
      try { msg = JSON.parse(raw) } catch { return }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        consoleErrors.push((msg.params.args || []).map(a => a.value ?? a.description ?? '').join(' '))
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        consoleErrors.push('EXCEPTION: ' + (msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || ''))
      }
      if (msg.id && pending.has(msg.id)) {
        const { res, rej, method } = pending.get(msg.id)
        pending.delete(msg.id)
        if (msg.error) rej(new Error(method + ': ' + JSON.stringify(msg.error)))
        else res(msg.result)
      }
    })

    ws.on('open', async () => {
      try {
        const result = await fn(send)
        // 必须显式关掉：留着 socket 会让 node 进程不退出，表现成「脚本卡死」
        try { ws.close() } catch {}
        resolve({ result, consoleErrors })
      } catch (e) {
        try { ws.close() } catch {}
        reject(e)
      }
    })
    ws.on('error', reject)
  })
}

const shot = async (send, name) => {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  const file = path.join(outDir, name)
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'))
  console.log('  →', name, fs.statSync(file).size, 'B')
}

;(async () => {
  const target = await waitForTarget()
  console.log('调试目标：', target.title || '(无标题)')

  const { consoleErrors } = await cdp(target.webSocketDebuggerUrl, async (send) => {
    await send('Page.enable')
    await send('Runtime.enable')
    await send('Emulation.setDeviceMetricsOverride', {
      width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: false,
    })
    await sleep(2500)

    console.log('[1/4] 主窗口')
    await shot(send, '01-main.png')

    console.log('[2/4] 导航到 #/setting')
    await send('Runtime.evaluate', {
      expression: "location.hash = '#/setting'",
      returnByValue: true,
    })
    await sleep(2500)
    await shot(send, '02-setting.png')

    console.log('[3/4] 点开「AI 歌词分词」面板')
    // 设置页的导航是 <h2 role="tab" aria-label="标题" @click="toggleTab">，
    // 面板由 <component :is> 懒渲染 —— 点导航之前 #ai 根本不在 DOM 里。
    const clicked = await send('Runtime.evaluate', {
      expression: `(() => {
        const TARGET = 'AI 歌词分词'
        const tab = document.querySelector('h2[role="tab"][aria-label="' + TARGET + '"]')
        if (tab) {
          tab.click()
          return 'clicked-h2-tab'
        }
        // 找不到就按文案兜底，并带回真实结构便于定位
        const tabs = Array.from(document.querySelectorAll('h2[role="tab"]'))
        const byText = tabs.find(n => n.innerText.trim() === TARGET)
        if (byText) { byText.click(); return 'clicked-by-text' }
        return 'not-found; tabs=' + JSON.stringify(tabs.map(n => n.getAttribute('aria-label')))
      })()`,
      returnByValue: true,
    })
    console.log('  点击结果：', clicked.result.value)
    await sleep(1800)

    console.log('[4/4] AI 面板')
    await shot(send, '03-ai-panel.png')

    // 顺手把面板里的可见文案带回来，便于确认渲染出了内容而不是空白
    const text = await send('Runtime.evaluate', {
      expression: `(() => {
        const el = document.querySelector('#ai')
        if (!el) return '(找不到 #ai)'
        const dd = el.nextElementSibling
        return (dd ? dd.innerText : el.innerText).slice(0, 400)
      })()`,
      returnByValue: true,
    })
    console.log('面板可见文案：\n' + String(text.result.value).replace(/^/gm, '    '))
  })

  console.log('\n渲染进程日志（error/异常）：', consoleErrors.length ? '' : '无')
  consoleErrors.slice(0, 20).forEach(line => console.log('  !', line))
})().catch(err => {
  console.error('抓图失败：', err.message)
  process.exit(1)
})
