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
  console.log('stack at corner:', await ev(`(() => {
    return JSON.stringify(document.elementsFromPoint(1045, 18).slice(0, 6).map(e => e.tagName + '|' + (e.getAttribute('aria-label')||'') + '|' + String(e.className).slice(0,14)))
  })()`))
  console.log('ancestor chain regions:', await ev(`(() => {
    const el = document.elementFromPoint(1045, 18)
    const out = []
    let n = el
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n)
      const r = n.getBoundingClientRect()
      out.push({ tag: n.tagName, region: cs.webkitAppRegion || cs.getPropertyValue('-webkit-app-region'), w: Math.round(r.width), x: Math.round(r.x), y: Math.round(r.y), h: Math.round(r.height) })
      n = n.parentElement
    }
    return JSON.stringify(out)
  })()`))
  process.exit(0)
})()
