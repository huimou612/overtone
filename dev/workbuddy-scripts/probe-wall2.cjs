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
  console.log('hit:', await ev(`(() => { const el = document.elementFromPoint(1045, 18); return el ? el.tagName + '|' + (el.getAttribute('aria-label')||'') + '|' + String(el.className).slice(0,20) : 'none' })()`))
  console.log('dragArea rect:', await ev(`(() => { const root = document.querySelector('[data-view=song-wall]'); const d = root.querySelector('header > div'); const r = d.getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), region: getComputedStyle(d).webkitAppRegion }) })()`))
  console.log('zone rect:', await ev(`(() => { const root = document.querySelector('[data-view=song-wall]'); const z = [...root.querySelectorAll('div')].find(d => d.querySelector && d.querySelector('button[aria-label="最小化"]')); const r = z.getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), op: getComputedStyle(z).opacity, pe: getComputedStyle(z).pointerEvents }) })()`))
  console.log('moves recorded:', await ev(`window.__pos ? JSON.stringify(window.__pos.slice(-3)) : 'no recorder'`))
  process.exit(0)
})()
