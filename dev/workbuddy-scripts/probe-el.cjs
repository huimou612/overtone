const http = require('node:http')
const get = () => new Promise(r => http.get('http://127.0.0.1:9224/json', res => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>r(JSON.parse(b))) }))
const MAIN = t => t.type==='page' && String(t.url).includes('index.html') && !String(t.url).includes('/folia/')
;(async () => {
  const t = (await get()).find(MAIN)
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  await new Promise(r => ws.addEventListener('open', r, {once:true}))
  let mid = 0
  const ev = expr => new Promise(res => {
    const id = ++mid
    const h = raw => { let m; try { m = JSON.parse(raw.data) } catch { return }
      if (m.id === id) { ws.removeEventListener('message', h); res(m.result?.result?.value) } }
    ws.addEventListener('message', h)
    ws.send(JSON.stringify({id, method:'Runtime.evaluate', params:{expression:expr, returnByValue:true}}))
  })
  const out = await ev(`(() => {
    const el = document.elementFromPoint(44, 36)
    const chain = []
    let n = el
    while (n && chain.length < 8) {
      chain.push(n.tagName + (typeof n.className === 'string' && n.className ? '.' + n.className.slice(0, 28) : ''))
      n = n.parentElement
    }
    const btn = document.querySelector('[data-view=song-wall] header button')
    const r = btn ? btn.getBoundingClientRect() : null
    return JSON.stringify({ atPoint: chain, btnRect: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null, sameEl: el === btn, isInside: btn ? btn.contains(el) : null })
  })()`)
  console.log(out)
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
