#!/usr/bin/env node
// 安装版受控验收 CDP 驱动（零依赖，Node 22 原生 WebSocket）。
// 用法：node .git/acc/drive.mjs <cmd> [args...]
// 目标过滤：生产实例页面是 file:// 协议（dev 才是 http）。
'use strict'
const http = require('node:http')

const PORT = process.env.ACC_PORT || 9224
const wait = ms => new Promise(r => setTimeout(r, ms))

const getTargets = () => new Promise((resolve, reject) => {
  http.get(`http://127.0.0.1:${PORT}/json`, res => {
    let b = ''
    res.on('data', c => { b += c })
    res.on('end', () => { try { resolve(JSON.parse(b)) } catch (e) { reject(e) } })
  }).on('error', reject)
})

let msgId = 0
const pending = new Map()
const consoleLogs = []

async function connect(filter) {
  const targets = await getTargets()
  const page = targets.find(filter)
  if (!page) throw new Error('target not found. have: ' + targets.map(t => `${t.type}|${t.title}|${String(t.url).slice(0,60)}`).join('  ///  '))
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', rej, { once: true })
  })
  ws.addEventListener('message', raw => {
    let msg; try { msg = JSON.parse(String(raw.data)) } catch { return }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args || []).map(a => a.value ?? a.description ?? '').join(' ')
      consoleLogs.push(`[${msg.params.type}] ${text.slice(0, 300)}`)
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails
      consoleLogs.push(`[EXCEPTION] ${(d.exception?.description || d.text || '').slice(0, 300)}`)
    }
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++msgId
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
  await send('Runtime.enable')
  return { ws, send, page }
}

async function evaluate(send, expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true })
  if (r.exceptionDetails) {
    const d = r.exceptionDetails
    throw new Error(d.exception?.description || d.text || 'evaluate failed')
  }
  return r.result.value
}

const MAIN_FILTER = t => t.type === 'page' && String(t.url).startsWith('file://') && !String(t.url).includes('/folia/')
const FOLIA_FILTER = t => t.type === 'page' && String(t.url).includes('/folia/')

const cmds = {
  // 列出目标
  async targets() {
    const ts = await getTargets()
    for (const t of ts) console.log(`${t.type} | ${t.title} | ${String(t.url).slice(0, 90)}`)
  },

  // 探测主窗口全局对象
  async probe() {
    const { send } = await connect(MAIN_FILTER)
    const out = await evaluate(send, `(() => ({
      href: location.href,
      lx: typeof window.lx === 'object' ? Object.keys(window.lx) : String(typeof window.lx),
      lxData: typeof window.lxData === 'object' ? Object.keys(window.lxData) : String(typeof window.lxData),
      app_event: typeof window.app_event === 'object' ? Object.keys(window.app_event) : String(typeof window.app_event),
      require: typeof require,
      ipcRenderer: (() => { try { return Object.keys(require('electron').ipcRenderer) } catch (e) { return 'ERR:' + e.message } })(),
      listItems: document.querySelectorAll('.list-item').length,
      playBtns: document.querySelectorAll('button[aria-label="播放"]').length,
      navs: [...document.querySelectorAll('.root-nav, nav a, [class*=nav] button')].slice(0, 20).map(e => e.textContent?.trim()).filter(Boolean),
    }))()`)
    console.log(JSON.stringify(out, null, 1))
  },
}

const cmd = process.argv[2]
if (!cmds[cmd]) {
  console.log('cmds:', Object.keys(cmds).join(', '))
  process.exit(1)
}
cmds[cmd](...process.argv.slice(3)).then(() => process.exit(0)).catch(e => {
  console.error('ERROR:', e.message)
  process.exit(1)
})
