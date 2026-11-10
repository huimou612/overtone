const http = require('node:http')
const fs = require('node:fs')
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
  const ev = e => send('Runtime.evaluate', {expression:e, returnByValue:true, awaitPromise:true}).then(r => r.result?.value)
  const dbl = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type:'mouseMoved', x, y })
    for (let i = 1; i <= 2; i++) {
      await send('Input.dispatchMouseEvent', { type:'mousePressed', x, y, button:'left', clickCount:i, buttons:1 })
      await send('Input.dispatchMouseEvent', { type:'mouseReleased', x, y, button:'left', clickCount:i })
      await wait(60)
    }
  }
  const probe = view => ev(`(() => {
    const root = document.querySelector('[data-view=${view}]')
    if (!root) return JSON.stringify({ none: true })
    const z = [...root.querySelectorAll('div')].find(d => d.querySelector('button[aria-label="最小化"]'))
    if (!z) return JSON.stringify({ zone: false })
    const r = z.getBoundingClientRect()
    return JSON.stringify({ op: getComputedStyle(z).opacity, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), btns: [...z.querySelectorAll('button')].map(b => b.getAttribute('aria-label')) })
  })()`)

  await ev(`document.querySelector('a[aria-label="封面墙"]')?.click()`)
  await wait(2000)
  console.log('wall idle:', await probe('song-wall'))
  await send('Input.dispatchMouseEvent', { type:'mouseMoved', x: 1095, y: 20 })
  await wait(600)
  console.log('wall hover corner:', await probe('song-wall'))
  const s1 = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/win-controls-wall.png', Buffer.from(s1.data, 'base64'))
  await send('Input.dispatchMouseEvent', { type:'mouseMoved', x: 500, y: 420 })
  await wait(900)
  console.log('wall after leave:', await probe('song-wall'))

  const p = JSON.parse(await ev(`(() => { const r = document.querySelectorAll('[data-view=song-wall] div[role=button]')[1].getBoundingClientRect(); return JSON.stringify({x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2)}) })()`))
  await dbl(p.x, p.y)
  await wait(2500)
  console.log('stage idle:', await probe('lattice-stage'))
  await send('Input.dispatchMouseEvent', { type:'mouseMoved', x: 1095, y: 20 })
  await wait(600)
  console.log('stage hover corner:', await probe('lattice-stage'))
  const s2 = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/win-controls-stage.png', Buffer.from(s2.data, 'base64'))
  console.log('saved')
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
