const http = require('node:http')
const get = () => new Promise(r => http.get('http://127.0.0.1:9224/json', res => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>r(JSON.parse(b))) }))
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
  console.log(await ev(`(() => {
    const root = document.querySelector('[data-view="song-wall"]')
    const stage = root.children[3]
    const sr = stage.getBoundingClientRect()
    const tiles = [...stage.querySelectorAll('[data-tile-index]')]
    const info = tiles.map(t => { const b = t.getBoundingClientRect(); return { i: +t.dataset.tileIndex, x: Math.round(b.left - sr.left), y: Math.round(b.top - sr.top), w: Math.round(b.width), h: Math.round(b.height) } })
    const rows = [...new Set(info.map(t => t.y))].sort((a,b)=>a-b)
    return JSON.stringify({ stage: { w: Math.round(sr.width), h: Math.round(sr.height) }, count: tiles.length, rows, first: info.slice(0, 4), last: info.slice(-2) })
  })()`))
  process.exit(0)
})().catch(e => { console.log('ERR', e.message); process.exit(1) })
