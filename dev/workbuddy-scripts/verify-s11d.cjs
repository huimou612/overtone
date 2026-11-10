const http = require('node:http')
const get = () => new Promise(r => http.get('http://127.0.0.1:9224/json', res => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>r(JSON.parse(b))) }))
const wait = ms => new Promise(r => setTimeout(r, ms))
const MAIN = t => t.type==='page' && String(t.url).includes('index.html') && !String(t.url).includes('/folia/')
;(async () => {
  const t = (await get()).find(MAIN)
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  await new Promise(r => ws.addEventListener('open', r, {once:true}))
  let mid = 0
  const send = (m, p={}) => new Promise(res => {
    const id = ++mid
    const h = raw => { let x; try { x = JSON.parse(raw.data) } catch { return }
      if (x.id === id) { ws.removeEventListener('message', h); res(x.result) } }
    ws.addEventListener('message', h)
    ws.send(JSON.stringify({id, method:m, params:p}))
  })
  const ev = expr => send('Runtime.evaluate', {expression:expr, returnByValue:true, awaitPromise:true}).then(r => r.result?.value)
  const esc = async () => { await send('Input.dispatchKeyEvent', { type:'keyDown', key:'Escape', code:'Escape', windowsVirtualKeyCode:27 }); await wait(900) }
  const state = () => ev(`JSON.stringify({ stage: !!document.querySelector('[data-view=lattice-stage]'), wall: !!document.querySelector('[data-view=song-wall]'), x: window.screenX, y: window.screenY })`)

  await ev(`document.querySelector('a[aria-label="封面墙"]')?.click()`)
  await wait(1800)
  await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('Lattice')); b?.click(); return !!b })()`)
  await wait(1800)
  console.log('open:', await state())
  await esc()
  console.log('ESC #1:', await state())
  await esc()
  console.log('ESC #2:', await state())
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
