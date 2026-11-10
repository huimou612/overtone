const http = require('node:http')
const get = () => new Promise(r => http.get('http://127.0.0.1:9224/json', res => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>r(JSON.parse(b))) }))
const wait = ms => new Promise(r => setTimeout(r, ms))
const MAIN = t => t.type==='page' && String(t.url).includes('index.html') && !String(t.url).includes('/folia/')
async function conn() {
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
  return { ev }
}
;(async () => {
  const m = await conn()
  const pre = await m.ev(`JSON.stringify({ modalOpen: !!document.querySelector('.show-modal'), modalText: (document.querySelector('.show-modal')?.innerText || '').slice(0, 40) })`)
  console.log('before wall:', pre)
  // 带弹窗开墙（正是用户场景）
  await m.ev(`document.querySelector('a[aria-label="封面墙"]')?.click()`)
  await wait(2500)
  const st = await m.ev(`(() => {
    const wall = document.querySelector('[data-view=song-wall]')
    if (!wall) return JSON.stringify({ wall: false })
    const btn = wall.querySelector('header button')
    const r = btn.getBoundingClientRect()
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    window.__diag = { pd: 0, cl: 0 }
    btn.addEventListener('pointerdown', () => window.__diag.pd++, true)
    btn.addEventListener('click', () => window.__diag.cl++, true)
    return JSON.stringify({
      wall: true,
      parent: wall.parentElement === document.body ? 'BODY' : wall.parentElement?.className?.toString?.().slice(0, 20),
      hitIsButton: btn.contains(hit),
      modalStillOpen: !!document.querySelector('.show-modal'),
      btn: { x: r.x + r.width / 2, y: r.y + r.height / 2 },
    })
  })()`)
  console.log('wall state:', st)
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
