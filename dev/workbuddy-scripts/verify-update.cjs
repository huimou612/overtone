const http = require('node:http')
const fs = require('node:fs')
const get = () => new Promise(r => http.get('http://127.0.0.1:9224/json', res => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>r(JSON.parse(b))) }))
const wait = ms => new Promise(r => setTimeout(r, ms))
const MAIN = t => t.type==='page' && String(t.url).includes('index.html') && !String(t.url).includes('/folia/')
;(async () => {
  const t = (await get()).find(MAIN)
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  await new Promise(r => ws.addEventListener('open', r, {once:true}))
  let mid = 0
  const send = (m, p={}) => new Promise(res => {
    const id = ++mid
    const h = raw => { let x; try { x = JSON.parse(raw.data) } catch { return }
      if (x.id === id) { ws.removeEventListener('message', h); res(x.result) } }
    ws.addEventListener('message', h)
    ws.send(JSON.stringify({id, method:m, params:p}))
  })
  const ev = e => send('Runtime.evaluate', {expression:e, returnByValue:true, awaitPromise:true}).then(r => r.result?.value)

  console.log('app version:', await ev(`JSON.stringify({ version: window.lxData?.versionInfo?.version, current: window.lxData?.appSetting ? 'ok' : 'n/a' })`))
  // 页面内直接请求版本源，验证可达性与内容
  console.log('fetch version.json:', await ev(`(async () => {
    try {
      const r = await fetch('https://raw.githubusercontent.com/huimou612/overtone/master/publish/version.json', { cache: 'no-store' })
      const d = await r.json()
      return JSON.stringify({ status: r.status, version: d.version })
    } catch (e) { return 'ERR ' + e.message }
  })()`))
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
