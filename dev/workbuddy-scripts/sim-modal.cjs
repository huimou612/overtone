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
  // 模拟弹窗打开状态：给 #root 加 show-modal（触发 .view-container opacity:.9 层叠上下文）
  const out = await ev(`(() => {
    const root = document.getElementById('root') || document.querySelector('#root')
    root.classList.add('show-modal')
    const wall = document.querySelector('[data-view=song-wall]')
    const btn = wall.querySelector('header button')
    const r = btn.getBoundingClientRect()
    const hit = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2)
    return JSON.stringify({
      rootCls: root.className.slice(0, 30),
      wallParent: wall.parentElement === document.body ? 'BODY' : 'other',
      hitIsButton: btn.contains(hit),
      wallZ: getComputedStyle(wall).zIndex,
      vcOpacity: getComputedStyle(root.querySelector('.view-container')).opacity,
    })
  })()`)
  console.log(out)
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
