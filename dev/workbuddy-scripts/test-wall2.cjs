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

  console.log('侧栏项:', await ev(`JSON.stringify([...document.querySelectorAll('a[aria-label],button[aria-label]')].map(x => x.getAttribute('aria-label')).slice(0, 20))`))
  const opened = await ev(`(() => {
    const el = [...document.querySelectorAll('a,button,li')].find(x => (x.getAttribute('aria-label')||'').includes('封面墙'))
    if (!el) return 'not-found'
    el.click(); return 'clicked'
  })()`)
  console.log('打开:', opened)
  await wait(2500)
  console.log('画布:', await ev(`(() => {
    const root = document.querySelector('[data-view="song-wall"]')
    if (!root) return 'no-wall'
    const canvas = root.querySelector('[class*=canvas]')
    const tiles = root.querySelectorAll('[class*=tile]')
    return JSON.stringify({ tiles: tiles.length, canvasW: canvas && canvas.style.width, canvasH: canvas && canvas.style.height, tf: canvas && canvas.style.transform })
  })()`))
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/wall-canvas.png', Buffer.from(shot.data, 'base64'))
  process.exit(0)
})().catch(e => { console.log('ERR', e.message); process.exit(1) })
