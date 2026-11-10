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
  const ev = e => send('Runtime.evaluate', {expression:e, returnByValue:true, awaitPromise:true}).then(r => r.result?.value)
  const firstTileY = () => ev(`(() => { const t = document.querySelector('[data-view="song-wall"] [data-tile-index]'); const s = document.querySelector('[data-view="song-wall"]').children[3]; return Math.round(t.getBoundingClientRect().top - s.getBoundingClientRect().top) })()`)

  console.log('滚轮前首个卡片 y:', await firstTileY())
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 500, y: 350, deltaX: 0, deltaY: 400, button: 'none' })
  await wait(500)
  console.log('滚轮后首个卡片 y:', await firstTileY())
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 500, y: 350, deltaX: 0, deltaY: 400, button: 'none' })
  await wait(500)
  console.log('再滚一次 y:', await firstTileY())
  console.log('卡片总数:', await ev(`document.querySelectorAll('[data-view="song-wall"] [data-tile-index]').length`))
  process.exit(0)
})().catch(e => { console.log('ERR', e.message); process.exit(1) })
