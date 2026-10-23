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
  const send = (method, params={}) => new Promise(res => {
    const id = ++mid
    const h = raw => { let m; try { m = JSON.parse(raw.data) } catch { return }
      if (m.id === id) { ws.removeEventListener('message', h); res(m.result) } }
    ws.addEventListener('message', h)
    ws.send(JSON.stringify({id, method, params}))
  })
  const ev = expr => send('Runtime.evaluate', {expression:expr, returnByValue:true, awaitPromise:true}).then(r => r.result?.value)
  const TILES = `[...document.querySelectorAll('[data-view=song-wall] div[role=button]')]`
  // 悬停第 3 张
  const tile = JSON.parse(await ev(`(() => { const t = ${TILES}[2]; const r = t.getBoundingClientRect(); return JSON.stringify({x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2)}) })()`))
  await send('Input.dispatchMouseEvent', { type:'mouseMoved', x: tile.x, y: tile.y })
  await wait(700)
  const hover = await ev(`(() => {
    const tiles = ${TILES}
    const h = tiles[2], cs = getComputedStyle(h)
    return JSON.stringify({
      transform: cs.transform, z: cs.zIndex, outline: cs.outlineStyle,
      othersOpacity: tiles.slice(0, 5).map(e => getComputedStyle(e).opacity),
      mx: h.style.getPropertyValue('--mx'), my: h.style.getPropertyValue('--my'),
    })
  })()`)
  console.log('hover:', hover)
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/wall-hover.png', Buffer.from(shot.data, 'base64'))
  console.log('screenshot saved')
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
