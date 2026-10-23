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

  // 先关掉可能开着的舞台
  await ev(`(() => { const s = document.querySelector('[data-view="lattice-stage"]'); if (s) { const b = [...s.querySelectorAll('button')].find(x => (x.getAttribute('aria-label')||'').includes('关闭') || (x.getAttribute('aria-label')||'').includes('close')); b?.click() } return !!s })()`)
  await wait(700)

  const box = JSON.parse(await ev(`(() => {
    const root = document.querySelector('[data-view="song-wall"]')
    const tiles = [...root.querySelectorAll('div')].filter(d => d.style && d.style.left && d.style.width)
    const el = tiles[3] || tiles[0]
    const r = el.getBoundingClientRect()
    return JSON.stringify({ x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) })
  })()`))
  console.log('目标:', box)

  // 双击
  await mouse('mousePressed', box.x, box.y, 1); await mouse('mouseReleased', box.x, box.y, 0)
  await wait(110)
  await mouse('mousePressed', box.x, box.y, 1); await mouse('mouseReleased', box.x, box.y, 0)
  await wait(1800)
  console.log('舞台:', await ev(`!!document.querySelector('[data-view="lattice-stage"]')`))
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/wall-dbl-ok.png', Buffer.from(shot.data, 'base64'))
  process.exit(0)
})().catch(e => { console.log('ERR', e.message); process.exit(1) })
