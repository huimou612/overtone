const http = require('node:http')
const get = () => new Promise(r => http.get('http://127.0.0.1:9224/json', res => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>r(JSON.parse(b))) }))
const wait = ms => new Promise(r => setTimeout(r, ms))
const MAIN = t => t.type==='page' && String(t.url).includes('index.html') && !String(t.url).includes('/folia/')
async function conn() {
  const t = (await get()).find(MAIN)
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  await new Promise(r => ws.addEventListener('open', r, {once:true}))
  let mid = 0
  const send = (method, params={}) => new Promise(resolve => {
    const id = ++mid
    const h = raw => { let m; try { m = JSON.parse(raw.data) } catch { return }
      if (m.id === id) { ws.removeEventListener('message', h); resolve(m.result) } }
    ws.addEventListener('message', h)
    ws.send(JSON.stringify({id, method, params}))
  })
  const ev = expr => send('Runtime.evaluate', {expression:expr, returnByValue:true}).then(r => r.result?.value)
  return { send, ev }
}
;(async () => {
  const m = await conn()
  // 侧栏入口开墙（用户实际路径）
  await m.ev(`document.querySelector('a[aria-label="封面墙"]')?.click()`)
  await wait(2600)
  // 统计墙实例数 + 事件探针 + 坐标
  const info = await m.ev(`(() => {
    const walls = [...document.querySelectorAll('[data-view=song-wall]')]
    const top = walls[walls.length - 1]
    const btn = top?.querySelector('header button')
    const r = btn?.getBoundingClientRect()
    window.__diag = { pointerdown: 0, click: 0, target: '' }
    if (btn) {
      btn.addEventListener('pointerdown', e => { window.__diag.pointerdown++; window.__diag.target = e.target.tagName }, true)
      btn.addEventListener('click', e => { window.__diag.click++; window.__diag.target = e.target.tagName }, true)
    }
    return JSON.stringify({
      wallCount: walls.length,
      btnCenter: r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null,
      screen: { sx: window.screenX, sy: window.screenY, dpr: devicePixelRatio, ow: window.outerWidth, iw: window.innerWidth },
      focus: document.hasFocus(),
    })
  })()`)
  console.log('DIAG:', info)
})().catch(e => console.log('ERR:', e.message))
