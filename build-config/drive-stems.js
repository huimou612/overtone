/*
 * 音源分离的端到端验收：打开播放详情 → 右键歌词 → 点「音源分离…」→ 观察状态 →
 * 开始分离 → 跟进度 → 记录结果。
 *
 * 前提：应用以 --remote-debugging-port=9222 启动（见 capture-ai-ui.js 顶部说明）。
 * 用法：node build-config/drive-stems.js [--run] [输出目录]
 *   不带 --run：只打开对话框、读状态、截图。用来在不动 CPU 的前提下验界面与 IPC。
 *   带 --run  ：真的跑一次分离（一首歌几分钟）。
 *
 * 这一路每一步都真的触发业务逻辑：开对话框会走 analysis_get_status（查模型与运行时），
 * 点开始会走「渲染层解码 → 写 mix.in → Python sidecar → 主进程落盘」整条链，
 * 所以它能验到「界面接线 + IPC + 解码 + 推理 + 导出」。
 */

const fs = require('fs')
const path = require('path')
const http = require('http')
const WebSocket = require('ws')

const PORT = 9222
const RUN = process.argv.includes('--run')
const outDir = path.resolve(process.argv.filter(a => !a.startsWith('--'))[2] || 'notes/preview/stems')
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
      // 必须滤掉 devtools:// —— 它也是 type=page，截出来的会是 DevTools 界面
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
    const clickText = async (text, tag = 'button') => ev(`(() => {
      const TARGET = ${JSON.stringify(text)}
      const hit = Array.from(document.querySelectorAll(${JSON.stringify(tag)}))
        .find(n => n.offsetParent && n.textContent.trim() === TARGET)
      if (!hit) return 'not-found'
      const r = hit.getBoundingClientRect()
      const opts = { bubbles: true, cancelable: true, clientX: r.x + r.width/2, clientY: r.y + r.height/2, view: window }
      hit.dispatchEvent(new MouseEvent('mousedown', opts))
      hit.dispatchEvent(new MouseEvent('mouseup', opts))
      hit.dispatchEvent(new MouseEvent('click', opts))
      return 'clicked'
    })()`)

    // 对话框正文。用 textContent 而不是 innerText —— 后者每次读都强制重排。
    const modalBody = `(() => {
      const root = document.querySelector('#root') || document.body
      const h2 = Array.from(root.querySelectorAll('h2')).find(n => n.offsetParent && n.textContent.trim() === '音源分离')
      return h2 ? h2.parentElement.textContent.replace(/\\s{2,}/g, ' | ').trim() : ''
    })()`

    console.log('[1/4] 回到列表页并确保播放详情打开')
    await ev("location.hash = '#/list'")
    await sleep(2000)

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

    let hasLyric = false
    for (let i = 0; i < 12; i += 1) {
      hasLyric = await ev(`(() => { const el = ${findLyricEl}; return !!(el && (el.textContent || '').trim().length > 20) })()`)
      if (hasLyric) break
      if (i === 0) {
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

    console.log('[2/4] 右键歌词 → 点「音源分离…」')
    await ev(`(() => {
      const el = ${findLyricEl}
      if (!el) return
      const r = el.getBoundingClientRect()
      el.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true, cancelable: true,
        clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, view: window,
      }))
    })()`)
    await sleep(1000)

    let clicked = 'not-found'
    for (let i = 0; i < 12; i += 1) {
      clicked = await clickText('音源分离…')
      if (clicked === 'clicked') break
      await sleep(400)
    }
    console.log('  ', clicked)

    console.log('[3/4] 对话框状态')
    let body = ''
    const started = Date.now()
    for (let i = 0; i < 40; i += 1) {
      body = await ev(modalBody)
      if (body && body.includes('分离')) break
      await sleep(500)
    }
    console.log('  正文就绪耗时：', ((Date.now() - started) / 1000).toFixed(1) + 's')
    console.log('  正文：\n    ' + String(body || '(为空)').slice(0, 900))
    await shot('01-stem-modal.png')

    if (!RUN) {
      console.log('\n（未带 --run，跳过实际分离）')
      return
    }

    console.log('[4/4] 开始分离')
    const startedAt = Date.now()
    const click = await clickText('开始分离')
    console.log('  ', click)
    if (click !== 'clicked') throw new Error('找不到「开始分离」按钮')

    let last = ''
    for (let i = 0; i < 300; i += 1) {
      await sleep(2000)
      const text = await ev(modalBody)
      if (text !== last) {
        last = text
        console.log(`  [${((Date.now() - startedAt) / 1000).toFixed(0)}s] ` + String(text || '').slice(0, 260))
      }
      if (text.includes('已导出两个文件')) break
      if (/失败|错误|不完整|拿不到|没有/.test(text) && !text.includes('开始分离')) {
        // 轮询窗口内可能只是「正在解码」阶段的中性文案；等到出现明确失败词再退出
        if (/失败|不完整|拿不到|还没下载/.test(text)) break
      }
    }
    await shot('02-stem-result.png')
    console.log('  最终正文：\n    ' + String(last || '(为空)').slice(0, 900))
    console.log('  总耗时：', ((Date.now() - startedAt) / 1000).toFixed(1) + 's')
  })

  console.log('\n渲染进程日志（error/异常）：', consoleErrors.length ? '' : '无')
  consoleErrors.slice(0, 20).forEach(l => console.log('  !', l))
})().catch(err => {
  console.error('失败：', err.message)
  process.exit(1)
})
