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

  // 开墙
  await ev(`document.querySelector('a[aria-label="封面墙"]')?.click()`)
  await wait(2000)
  // 拖动区检查
  const drag = await ev(`(() => {
    const wall = document.querySelector('[data-view=song-wall]')
    const bar = wall.querySelector('header')
    const btn = wall.querySelector('header button')
    const cs = getComputedStyle(bar), bs = getComputedStyle(btn)
    return JSON.stringify({ barRegion: cs.webkitAppRegion, btnRegion: bs.webkitAppRegion })
  })()`)
  console.log('1 drag region:', drag)
  // 悬停效果：把鼠标移到第 3 个卡片的中心
  const tile = JSON.parse(await ev(`(() => { const t = document.querySelectorAll('[class*=tile]')[2]; const r = t.getBoundingClientRect(); return JSON.stringify({x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2)}) })()`))
  await send('Input.dispatchMouseEvent', { type:'mouseMoved', x: tile.x, y: tile.y })
  await wait(600)
  const hover = await ev(`(() => {
    const t = document.querySelectorAll('[class*=tile]')[2]
    const cs = getComputedStyle(t)
    const others = [...document.querySelectorAll('[class*=tile]')].slice(0, 6).map(e => getComputedStyle(e).opacity)
    return JSON.stringify({ hoveredTransform: cs.transform, hoveredZ: cs.zIndex, outline: cs.outlineStyle, othersOpacity: others })
  })()`)
  console.log('2 hover:', hover)
  const shot1 = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/wall-hover.png', Buffer.from(shot1.data, 'base64'))
  console.log('2 screenshot saved')
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
