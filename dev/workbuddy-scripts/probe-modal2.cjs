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
    const bodyKids = [...document.body.children].map(el => {
      const cs = getComputedStyle(el)
      return { tag: el.tagName, cls: String(el.className).slice(0, 50), z: cs.zIndex, pos: cs.position, pe: cs.pointerEvents, w: el.clientWidth, h: el.clientHeight }
    })
    const sm = document.querySelector('.show-modal')
    const smKids = sm ? [...sm.children].map(c => ({ tag: c.tagName, cls: String(c.className).slice(0, 40), text: (c.innerText || '').replace(/\\n/g,' ').slice(0, 40) })) : null
    return JSON.stringify({ bodyKids, showModalKids: smKids })
  })()`)
  console.log(out)
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
