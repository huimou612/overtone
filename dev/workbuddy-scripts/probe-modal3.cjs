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
    const root = document.querySelector('.show-modal')
    const dialog = root && [...root.children].find(c => c.className.includes('y4j_4'))
    const dcs = dialog ? getComputedStyle(dialog) : null
    const dr = dialog ? dialog.getBoundingClientRect() : null
    // 找遮罩层（可能覆盖全屏的元素）
    const overlays = []
    if (root) {
      for (const c of root.children) {
        const cs = getComputedStyle(c)
        const r = c.getBoundingClientRect()
        if (r.width >= window.innerWidth * 0.9 && r.height >= window.innerHeight * 0.9) {
          overlays.push({ cls: String(c.className).slice(0, 30), z: cs.zIndex, pe: cs.pointerEvents, bg: cs.backgroundColor, op: cs.opacity, disp: cs.display })
        }
      }
    }
    // 墙的位置
    const wall = document.querySelector('[data-view=song-wall]')
    const wcs = wall ? getComputedStyle(wall) : null
    return JSON.stringify({
      rootCls: root ? root.className.slice(0, 40) : null,
      dialog: dialog ? { cls: dialog.className.slice(0, 30), display: dcs.display, vis: dcs.visibility, op: dcs.opacity, z: dcs.zIndex, rect: dr ? { x: dr.x, y: dr.y, w: dr.width, h: dr.height } : null } : null,
      fullscreenOverlays: overlays,
      wall: wall ? { z: wcs.zIndex, parent: wall.parentElement ? wall.parentElement.className.toString().slice(0, 30) : null } : null,
    })
  })()`)
  console.log(out)
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
