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

  const tf0 = await ev(`(() => { const c = [...document.querySelectorAll('[data-view="song-wall"] div')].find(d => d.style.transform && d.style.width); return c ? c.style.transform : 'none' })()`)
  console.log('拖动前:', tf0)

  // 真实鼠标拖动：500,400 → 380,300
  const mouse = (type, x, y, buttons) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1 })
  await mouse('mousePressed', 500, 420, 1)
  for (let i = 1; i <= 6; i++) {
    await mouse('mouseMoved', 500 - i * 20, 420 - i * 20, 1)
    await wait(40)
  }
  await mouse('mouseReleased', 380, 300, 0)
  await wait(500)
  const tf1 = await ev(`(() => { const c = [...document.querySelectorAll('[data-view="song-wall"] div')].find(d => d.style.transform && d.style.width); return c ? c.style.transform : 'none' })()`)
  console.log('拖动后:', tf1)
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/wall-drag.png', Buffer.from(shot.data, 'base64'))
  process.exit(0)
})().catch(e => { console.log('ERR', e.message); process.exit(1) })
