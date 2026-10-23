const http = require('node:http')
const get = () => new Promise(r => http.get('http://127.0.0.1:9224/json', res => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>r(JSON.parse(b))) }))
const MAIN = t => t.type==='page' && String(t.url).includes('index.html') && !String(t.url).includes('/folia/')
;(async () => {
  const t = (await get()).find(MAIN)
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  await new Promise(r => ws.addEventListener('open', r, {once:true}))
  let mid = 0
  const raw = (expr) => new Promise(res => {
    const id = ++mid
    const h = m => { let x; try { x = JSON.parse(m.data) } catch { return }
      if (x.id === id) { ws.removeEventListener('message', h); res(x) } }
    ws.addEventListener('message', h)
    ws.send(JSON.stringify({id, method:'Runtime.evaluate', params:{expression:expr, returnByValue:true, awaitPromise:true}}))
  })
  const show = async label => { const r = await raw(label); console.log(JSON.stringify(r).slice(0, 400)) }
  await show(`document.querySelectorAll('[data-view=lattice-stage]').length`)
  await show(`document.querySelectorAll('[data-view=lattice-stage] [data-state]').length`)
  await show(`[...document.querySelectorAll('[data-view=lattice-stage] [data-state]')].map(e => e.getAttribute('data-state')).join(',')`)
  await show(`document.querySelector('[data-view=lattice-stage]').innerText.slice(0, 120).replace(/\\n/g, '|')`)
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
