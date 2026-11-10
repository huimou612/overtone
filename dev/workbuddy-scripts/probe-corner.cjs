const http = require('node:http')
const get = () => new Promise(r => http.get('http://127.0.0.1:9224/json', res => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>r(JSON.parse(b))) }))
const MAIN = t => t.type==='page' && String(t.url).includes('index.html') && !String(t.url).includes('/folia/')
;(async () => {
  const list = await get()
  const t = list.find(MAIN)
  if (!t) { console.log('no target; targets=', list.map(x=>x.type+':'+x.url.slice(0,40))); process.exit(0) }
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
  console.log('views:', await ev(`JSON.stringify({ wall: !!document.querySelector('[data-view=song-wall]'), stage: !!document.querySelector('[data-view=lattice-stage]') })`))
  console.log('inner:', await ev(`JSON.stringify({ w: innerWidth, h: innerHeight })`))
  console.log('hit at (1080,20):', await ev(`(() => {
    const el = document.elementFromPoint(1080, 20)
    return el ? (el.tagName + '.' + (el.className || '').toString().slice(0, 40)) : 'none'
  })()`))
  console.log('zone info:', await ev(`(() => {
    const root = document.querySelector('[data-view=lattice-stage]') || document.querySelector('[data-view=song-wall]')
    if (!root) return 'no root'
    const z = [...root.querySelectorAll('div')].find(d => d.querySelector && d.querySelector('button[aria-label="最小化"]'))
    if (!z) return 'no zone'
    const r = z.getBoundingClientRect(), cs = getComputedStyle(z)
    return JSON.stringify({ rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, op: cs.opacity, pe: cs.pointerEvents, z: cs.zIndex })
  })()`))
  process.exit(0)
})()
