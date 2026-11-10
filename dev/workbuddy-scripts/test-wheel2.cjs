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
  const state = () => ev(`(() => {
    const root = document.querySelector('[data-view="song-wall"]')
    const stage = root.children[3]
    const sr = stage.getBoundingClientRect()
    const tiles = [...stage.querySelectorAll('[data-tile-index]')]
    const idx = tiles.map(t => +t.dataset.tileIndex).sort((a,b)=>a-b)
    const ys = tiles.map(t => Math.round(t.getBoundingClientRect().top - sr.top))
    return JSON.stringify({ n: tiles.length, min: idx[0], max: idx[idx.length-1], topY: Math.min(...ys) })
  })()`)

  console.log('初始:', await state())
  for (let i = 1; i <= 3; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 500, y: 350, deltaX: 0, deltaY: 500, button: 'none' })
    await wait(450)
    console.log(`滚第 ${i} 次:`, await state())
  }
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/wall-scrolled.png', Buffer.from(shot.data, 'base64'))
  process.exit(0)
})().catch(e => { console.log('ERR', e.message); process.exit(1) })
