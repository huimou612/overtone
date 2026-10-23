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

  await ev(`(() => { const el = [...document.querySelectorAll('a,button,li')].find(x => (x.getAttribute('aria-label')||'').includes('封面墙')); el?.click(); return !!el })()`)
  await wait(2600)
  const info = await ev(`(() => {
    const root = document.querySelector('[data-view="song-wall"]')
    if (!root) return 'no-wall'
    const stage = root.querySelector('div:nth-child(4)')
    const tiles = [...root.querySelectorAll('div')].filter(d => d.style && d.style.width && d.style.left)
    const canvas = tiles.length ? tiles[0].parentElement : null
    return JSON.stringify({ tiles: tiles.length, canvas: canvas ? { w: canvas.style.width, h: canvas.style.height } : null })
  })()`)
  console.log('墙:', info)
  const shot1 = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/wall-2.png', Buffer.from(shot1.data, 'base64'))

  // 点第一张卡片 → 应该放大居中
  const clicked = await ev(`(() => {
    const root = document.querySelector('[data-view="song-wall"]')
    const tiles = [...root.querySelectorAll('div')].filter(d => d.style && d.style.width && d.style.left)
    if (!tiles.length) return 'no-tiles'
    const el = tiles[0]
    const r = el.getBoundingClientRect()
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }))
    return 'clicked'
  })()`)
  console.log('点击:', clicked)
  await wait(1400)
  console.log('放大态:', await ev(`(() => {
    const root = document.querySelector('[data-view="song-wall"]')
    const tiles = [...root.querySelectorAll('div')].filter(d => d.style && d.style.transform)
    const canvas = tiles.length ? tiles[0].parentElement : null
    return JSON.stringify({ scaled: tiles.length, scale: tiles[0] && tiles[0].style.transform, canvasTf: canvas && canvas.style.transform })
  })()`))
  const shot2 = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/wall-focus.png', Buffer.from(shot2.data, 'base64'))
  process.exit(0)
})().catch(e => { console.log('ERR', e.message); process.exit(1) })
