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
  await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('Lattice')); b?.click(); return !!b })()`)
  await wait(2200)
  const bar = await ev(`(() => {
    const stage = document.querySelector('[data-view=lattice-stage]')
    const btns = [...stage.querySelectorAll('footer button')].map(b => b.getAttribute('aria-label') || b.textContent.trim())
    const mask = stage.querySelector('footer [class*=progressMask], footer [class*=Mask]')
    const time = stage.querySelector('footer')?.innerText?.replace(/\\n/g,' ').slice(0, 40)
    return JSON.stringify({ buttons: btns, seekMask: !!mask, timeText: time })
  })()`)
  console.log('bar:', bar)
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/lattice-stage-bar.png', Buffer.from(shot.data, 'base64'))
  console.log('screenshot saved')
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
