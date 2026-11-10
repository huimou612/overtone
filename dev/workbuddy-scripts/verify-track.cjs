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
  // 关面板 + seek 到 35s
  await ev(`document.querySelector('[data-view=lattice-stage] [aria-label="关闭面板"]')?.click()`)
  await wait(500)
  await ev(`window.app_event.setProgress(35); 1`)
  await wait(2500)
  const s1 = await ev(`(() => {
    const a = document.querySelector('[data-view=lattice-stage] [data-state=active]')
    const track = a?.querySelector('i')
    return JSON.stringify({
      states: [...document.querySelectorAll('[data-view=lattice-stage] [data-state]')].map(e => e.getAttribute('data-state')),
      text: a?.innerText?.replace(/\\n/g,' ').slice(0, 40) || null,
      trackWidth: track?.style?.width || null,
      trackBg: track ? getComputedStyle(track).backgroundImage.slice(0, 40) : null,
    })
  })()`)
  console.log('after seek 35s:', s1)
  await wait(1200)
  console.log('track width later:', await ev(`document.querySelector('[data-view=lattice-stage] [data-state=active] i')?.style?.width || null`))
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/lattice-stage-v2-active.png', Buffer.from(shot.data, 'base64'))
  console.log('screenshot saved')
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
