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
  const mouse = (type, x, y, buttons) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1 })

  // 重开墙（回顶部）
  await ev(`(() => { const b = document.querySelector('[data-view="song-wall"] header button'); b?.click(); return true })()`)
  await wait(900)
  await ev(`(() => { const el = [...document.querySelectorAll('a,button,li')].find(x => (x.getAttribute('aria-label')||'').includes('封面墙')); el?.click(); return !!el })()`)
  await wait(2600)
  console.log('卡片数:', await ev(`document.querySelectorAll('[data-view="song-wall"] [data-tile-index]').length`))
  let shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/wall-v4.png', Buffer.from(shot.data, 'base64'))

  // 拖动测试（内容跟手）
  const y0 = await ev(`(() => { const s = document.querySelector('[data-view="song-wall"]').children[3]; const t = s.querySelector('[data-tile-index]'); return Math.round(t.getBoundingClientRect().top - s.getBoundingClientRect().top) })()`)
  await mouse('mousePressed', 500, 400, 1)
  for (let i = 1; i <= 5; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 500, y: 400 - i * 20, buttons: 1 }); await wait(30) }
  await mouse('mouseReleased', 500, 300, 0)
  await wait(500)
  const y1 = await ev(`(() => { const s = document.querySelector('[data-view="song-wall"]').children[3]; const t = s.querySelector('[data-tile-index]'); return Math.round(t.getBoundingClientRect().top - s.getBoundingClientRect().top) })()`)
  console.log('向上拖 100px：首个卡片 y', y0, '→', y1, '(应约 -100)')

  // 单击放大
  await mouse('mousePressed', 430, 320, 1); await mouse('mouseReleased', 430, 320, 0)
  await wait(1000)
  console.log('放大卡片:', await ev(`(() => { const f = document.querySelector('[data-view="song-wall"] [style*="z-index: 30"]'); if (!f) return 'none'; const r = f.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height) })()`))
  shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/wall-v4-focus.png', Buffer.from(shot.data, 'base64'))
  process.exit(0)
})().catch(e => { console.log('ERR', e.message); process.exit(1) })
