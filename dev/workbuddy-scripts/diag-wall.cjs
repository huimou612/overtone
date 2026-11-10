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

  await ev(`(() => { const el = [...document.querySelectorAll('a,li')].find(x => (x.textContent||'').trim() === '我的歌'); el?.click(); return !!el })()`)
  await wait(1500)
  await ev(`(() => { const el = [...document.querySelectorAll('a,button,li')].find(x => (x.getAttribute('aria-label')||'').includes('封面墙')); el?.click(); return !!el })()`)
  await wait(2800)

  console.log(await ev(`(() => {
    const root = document.querySelector('[data-view="song-wall"]')
    const stage = root.querySelector('div[class*=stage]')
    const tiles = [...stage.querySelectorAll('[data-tile-index]')]
    const r = stage.getBoundingClientRect()
    const boxes = tiles.slice(0, 6).map(t => { const b = t.getBoundingClientRect(); return { i: t.dataset.tileIndex, x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width) } })
    const ys = [...new Set(tiles.map(t => Math.round(t.getBoundingClientRect().top)))].sort((a,b)=>a-b)
    return JSON.stringify({ stage: { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) }, tiles: tiles.length, rows: ys, sample: boxes }, null, 0)
  })()`))
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/diag-wall.png', Buffer.from(shot.data, 'base64'))
  process.exit(0)
})().catch(e => { console.log('ERR', e.message); process.exit(1) })
