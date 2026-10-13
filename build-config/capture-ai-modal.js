/*
 * 分词对话框的端到端验收：点封面 → 右键歌词 → 点菜单项 → 打开对话框并截图。
 *
 * 前提：应用以 --remote-debugging-port=9222 启动（见 capture-ai-ui.js 顶部说明）。
 * 用法：node build-config/capture-ai-modal.js [输出目录]
 *   → <输出目录>/../ai-ui/04-lyric-menu.png  歌词右键菜单（带「AI 逐字歌词…」）
 *     <输出目录>/../ai-ui/05-ai-modal.png     分词对话框
 *
 * 这一路的每一步都会真的触发业务逻辑：开菜单会走 updateMusicInfo，
 * 开对话框会走 ai_get_lyric_lines（读库 → 解析歌词行），所以它能验到
 * 「界面接线 + IPC + 数据读取」整条链。
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
      res.on('end', () => { try { resolve(JSON.parse(body)) } catch (e) { reject(e) } })
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
      const pages = (await listTargets()).filter(t => t.type === 'page' && /^https?:\/\//.test(t.url))
      if (pages.length) return pages.find(t => !/lyric/i.test(t.url)) || pages[0]
      last = '还没有应用窗口'
    } catch (e) { last = e.message }
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
        const p = pending.get(msg.id)
        pending.delete(msg.id)
        msg.error ? p.rej(new Error(p.method + ': ' + JSON.stringify(msg.error))) : p.res(msg.result)
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

;(async () => {
  const target = await waitForTarget()
  console.log('调试目标：', target.title || '(无标题)')
  fs.mkdirSync(outDir, { recursive: true })

  const { consoleErrors } = await cdp(target.webSocketDebuggerUrl, async (send) => {
    await send('Page.enable')
    await send('Runtime.enable')
    await send('Emulation.setDeviceMetricsOverride', {
      width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: false,
    })

    const ev = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
      return r.result?.value
    }
    const shot = async (name) => {
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      const file = path.join(outDir, name)
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'))
      console.log('  →', name, fs.statSync(file).size, 'B')
    }

    console.log('[1/5] 回到列表页')
    await ev("location.hash = '#/list'")
    await sleep(2000)

    // 歌词元素要等歌词真的加载出来才有内容，所以用轮询而不是固定 sleep。
    // 用 textContent 而不是 innerText：后者每次读都强制重排，在大量节点上会卡死。
    const findLyricEl = `(() => {
      const cands = Array.from(document.querySelectorAll('div')).filter(n => {
        if (!n.offsetParent) return false
        const cls = String(n.className)
        if (!/lyric/i.test(cls)) return false
        if (/menu|setting|select|btn|progress|switch|font|offset|icon|scroll/i.test(cls)) return false
        return n.getBoundingClientRect().height > 60
      })
      return cands.length ? cands[cands.length - 1] : null
    })()`

    console.log('[2/5] 确保播放详情已打开')
    let hasLyric = false
    for (let i = 0; i < 12; i += 1) {
      hasLyric = await ev(`(() => { const el = ${findLyricEl}; return !!(el && (el.textContent || '').trim().length > 20) })()`)
      if (hasLyric) break
      if (i === 0) {
        // 没打开就先点封面
        const opened = await ev(`(() => {
          const pic = Array.from(document.querySelectorAll('img,[class*=cover],[class*=pic]'))
            .filter(n => n.offsetParent && n.getBoundingClientRect().width > 20)
          if (!pic.length) return 'no-cover'
          const el = pic[0]
          const r = el.getBoundingClientRect()
          const opts = { bubbles: true, cancelable: true, clientX: r.x + r.width/2, clientY: r.y + r.height/2, view: window }
          el.dispatchEvent(new MouseEvent('mousedown', opts))
          el.dispatchEvent(new MouseEvent('mouseup', opts))
          el.dispatchEvent(new MouseEvent('click', opts))
          return 'clicked-cover'
        })()`)
        console.log('  ', opened)
      }
      await sleep(1500)
    }
    console.log('  歌词已渲染：', hasLyric)

    console.log('[3/5] 在歌词上右键')
    const menuOpened = await ev(`(() => {
      const el = ${findLyricEl}
      if (!el) return 'no-lyric-el'
      const r = el.getBoundingClientRect()
      el.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true, cancelable: true,
        clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, view: window,
      }))
      return 'contextmenu on .' + String(el.className).slice(0, 50)
    })()`)
    console.log('  ', menuOpened)
    await sleep(1200)
    await shot('04-lyric-menu.png')

    console.log('[4/5] 点菜单里的「AI 逐字歌词…」')
    // 菜单项是 late 出现的，轮询等它挂上（最长 ~6s）
    let clicked = 'not-found'
    for (let i = 0; i < 12; i += 1) {
      clicked = await ev(`(() => {
        const TARGET = 'AI 逐字歌词…'
        const hit = Array.from(document.querySelectorAll('button')).find(n => n.offsetParent && n.textContent.trim() === TARGET)
        if (!hit) return 'not-found'
        const r = hit.getBoundingClientRect()
        const opts = { bubbles: true, cancelable: true, clientX: r.x + r.width/2, clientY: r.y + r.height/2, view: window }
        hit.dispatchEvent(new MouseEvent('mousedown', opts))
        hit.dispatchEvent(new MouseEvent('mouseup', opts))
        hit.dispatchEvent(new MouseEvent('click', opts))
        return 'clicked-menu-item'
      })()`)
      if (clicked === 'clicked-menu-item') break
      await sleep(500)
    }
    console.log('  ', clicked)

    console.log('[5/5] 分词对话框')
    // 对话框打开后要先读一次歌词行（走 worker DB RPC），首帧是空的。
    // 轮询到正文出现为止，并记下耗时 —— 这同时也是「IPC 通不通」的判据。
    const modalBodyExpr = `(() => {
      const root = document.querySelector('#root') || document.body
      const h2 = Array.from(root.querySelectorAll('h2')).find(n => n.offsetParent && n.textContent.trim() === 'AI 逐字歌词')
      return h2 ? h2.parentElement.textContent.replace(/\\s{2,}/g, ' | ').trim() : ''
    })()`
    let modalText = ''
    const started = Date.now()
    for (let i = 0; i < 40; i += 1) {
      modalText = await ev(modalBodyExpr)
      if (modalText && modalText.includes('行歌词')) break
      await sleep(500)
    }
    console.log('  正文就绪耗时：', ((Date.now() - started) / 1000).toFixed(1) + 's')
    await shot('05-ai-modal.png')
    console.log('对话框文案：\n    ' + String(modalText || '(正文仍为空)'))
  })

  console.log('\n渲染进程日志（error/异常）：', consoleErrors.length ? '' : '无')
  consoleErrors.slice(0, 20).forEach(l => console.log('  !', l))
})().catch(err => {
  console.error('失败：', err.message)
  process.exit(1)
})
