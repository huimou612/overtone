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
    const modals = [...document.querySelectorAll('.show-modal')]
    const info = modals.map(m => {
      const cs = getComputedStyle(m)
      return {
        cls: m.className.slice(0, 60),
        zIndex: cs.zIndex,
        display: cs.display,
        visible: cs.visibility,
        opacity: cs.opacity,
        text: (m.innerText || '').replace(/\\n/g, ' ').slice(0, 120),
        childCount: m.children.length,
      }
    })
    const wall = document.querySelector('[data-view=song-wall]')
    const wcs = wall ? getComputedStyle(wall) : null
    return JSON.stringify({ modals: info, wallZ: wcs ? wcs.zIndex : null })
  })()`)
  console.log(out)
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
