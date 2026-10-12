/*
 * 通过 Chrome DevTools Protocol 抓取 Electron 主窗口截图。
 *
 * 前提：应用以 --remote-debugging-port=9222 启动。
 * 用法：node notes/capture-window.js [输出路径] [宽] [高]
 *
 * 之所以不直接截屏，是因为 CDP 能拿到渲染进程真实画面（窗口即使被遮挡也没关系），
 * 而且可以显式指定视口尺寸，做出稳定的验收截图。
 */

const fs = require('fs')
const path = require('path')
const http = require('http')
const WebSocket = require('ws')

const PORT = 9222
const outlinePath = process.argv[2] || 'notes/preview/main-window.png'
const WIDTH = Number(process.argv[3] || 1280)
const HEIGHT = Number(process.argv[4] || 800)

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

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

async function waitForTarget(timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs
  let last = ''
  while (Date.now() < deadline) {
    try {
      const targets = await listTargets()
      const pages = targets.filter(t => t.type === 'page')
      if (pages.length) {
        // 优先取主窗口（非歌词窗）
        const main = pages.find(t => !/lyric/i.test(t.url)) || pages[0]
        return main
      }
      last = 'no page target yet'
    } catch (e) {
      last = e.message
    }
    await sleep(1500)
  }
  throw new Error('等待调试目标超时：' + last)
}

function cdp(wsUrl, calls) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 })
    let id = 0
    const pending = new Map()
    const results = {}

    const send = (method, params = {}) => new Promise((res, rej) => {
      const myId = ++id
      pending.set(myId, { res, rej, method })
      ws.send(JSON.stringify({ id: myId, method, params }))
    })

    ws.on('message', raw => {
      let msg
      try { msg = JSON.parse(raw) } catch { return }
      if (msg.id && pending.has(msg.id)) {
        const { res, rej, method } = pending.get(msg.id)
        pending.delete(msg.id)
        if (msg.error) rej(new Error(method + ': ' + JSON.stringify(msg.error)))
        else res(msg.result)
      }
    })

    ws.on('open', async () => {
      try {
        for (const [name, fn] of calls) {
          results[name] = await fn(send)
        }
        ws.close()
        resolve(results)
      } catch (e) {
        try { ws.close() } catch {}
        reject(e)
      }
    })

    ws.on('error', reject)
  })
}

;(async () => {
  const target = await waitForTarget()
  console.log('调试目标：', JSON.stringify({ title: target.title, url: target.url, type: target.type }))

  const { shot, metrics } = await cdp(target.webSocketDebuggerUrl, [
    ['metrics', async (send) => {
      // 用 Emulation 固定视口，保证截图尺寸稳定
      await send('Emulation.setDeviceMetricsOverride', {
        width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: false,
      })
      await sleep(1200)
      return (await send('Runtime.evaluate', {
        expression: 'JSON.stringify({title: document.title, href: location.href, w: innerWidth, h: innerHeight, dpr: devicePixelRatio})',
        returnByValue: true,
      })).result.value
    }],
    ['shot', async (send) => {
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      return r.data
    }],
  ])

  const out = path.resolve(outlinePath)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, Buffer.from(shot, 'base64'))
  console.log('页面状态：', metrics)
  console.log('截图已保存：', out, '(', fs.statSync(out).size, 'B )')
})().catch(err => {
  console.error('抓图失败：', err.message)
  process.exit(1)
})
