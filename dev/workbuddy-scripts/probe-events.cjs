const http = require('node:http')
const get = () => new Promise(r => http.get('http://127.0.0.1:9224/json', res => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>r(JSON.parse(b))) }))
const MAIN = t => t.type==='page' && String(t.url).includes('index.html') && !String(t.url).includes('/folia/')
;(async () => {
  const t = (await get()).find(MAIN)
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  await new Promise(r => ws.addEventListener('open', r, {once:true}))
  let mid = 0
  const ev = e => new Promise(res => {
    const id = ++mid
    const h = m => { let x; try { x = JSON.parse(m.data) } catch { return }
      if (x.id === id) { ws.removeEventListener('message', h); res(x.result?.result?.value) } }
    ws.addEventListener('message', h)
    ws.send(JSON.stringify({id, method:'Runtime.evaluate', params:{expression:e, returnByValue:true, awaitPromise:true}}))
  })
  // 埋计数器
  await ev(`(() => {
    window.__evt = { move: 0, enter: 0, over: 0 }
    document.addEventListener('pointermove', () => window.__evt.move++, true)
    const z = (() => { const root = document.querySelector('[data-view=lattice-stage]'); return [...root.querySelectorAll('div')].find(d => d.querySelector && d.querySelector('button[aria-label="最小化"]')) })()
    if (z) z.addEventListener('pointerenter', () => window.__evt.enter++, true)
    window.__zone = z
    return 'ok'
  })()`)
  console.log('focus:', await ev(`JSON.stringify({ hasFocus: document.hasFocus(), visibility: document.visibilityState })`))
  console.log('counters before:', await ev(`JSON.stringify(window.__evt)`))
  process.exit(0)
})()
