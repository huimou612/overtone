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

  // 单击第一张卡片
  const box = await ev(`(() => {
    const root = document.querySelector('[data-view="song-wall"]')
    const tiles = [...root.querySelectorAll('div')].filter(d => d.style && d.style.left && d.style.width)
    const el = tiles[0]
    const r = el.getBoundingClientRect()
    return JSON.stringify({ x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2), w: Math.round(r.width) })
  })()`)
  console.log('目标卡片:', box)
  const b = JSON.parse(box)
  const mouse = (type, x, y, buttons, clickCount=1) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount })
  await mouse('mousePressed', b.x, b.y, 1); await mouse('mouseReleased', b.x, b.y, 0)
  await wait(1200)
  const after = await ev(`(() => {
    const root = document.querySelector('[data-view="song-wall"]')
    const tiles = [...root.querySelectorAll('div')].filter(d => d.style && d.style.left && d.style.width)
    const focus = tiles.find(d => d.style.zIndex === '30')
    if (!focus) return 'no-focus'
    const r = focus.getBoundingClientRect()
    return JSON.stringify({ w: Math.round(r.width), h: Math.round(r.height), cx: Math.round(r.left + r.width/2), cy: Math.round(r.top + r.height/2), total: tiles.length })
  })()`)
  console.log('放大后:', after)
  const shot1 = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/wall-v3-focus.png', Buffer.from(shot1.data, 'base64'))

  // 再点一次收回，然后双击进歌词
  await mouse('mousePressed', b.x, b.y, 1); await mouse('mouseReleased', b.x, b.y, 0)
  await wait(900)
  console.log('收回:', await ev(`(() => { const root = document.querySelector('[data-view="song-wall"]'); return root.querySelectorAll('[style*="z-index: 30"]').length })()`))

  // 双击（两次快速点击）
  await mouse('mousePressed', b.x, b.y, 1); await mouse('mouseReleased', b.x, b.y, 0)
  await wait(90)
  await mouse('mousePressed', b.x, b.y, 1); await mouse('mouseReleased', b.x, b.y, 0)
  await wait(1600)
  console.log('歌词舞台:', await ev(`(() => {
    const el = document.querySelector('[class*=latticeStage], [class*=lattice-stage], [data-view="lattice"]')
    const text = document.body.innerText.includes('Lattice') ? 'has-text' : 'none'
    return JSON.stringify({ stage: !!el, text })
  })()`))
  const shot2 = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/wall-v3-dblclick.png', Buffer.from(shot2.data, 'base64'))
  process.exit(0)
})().catch(e => { console.log('ERR', e.message); process.exit(1) })
