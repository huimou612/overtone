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
  const dbl = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type:'mouseMoved', x, y })
    for (let i = 1; i <= 2; i++) {
      await send('Input.dispatchMouseEvent', { type:'mousePressed', x, y, button:'left', clickCount:i, buttons:1 })
      await send('Input.dispatchMouseEvent', { type:'mouseReleased', x, y, button:'left', clickCount:i })
      await wait(60)
    }
  }
  await ev(`document.querySelector('a[aria-label="封面墙"]')?.click()`)
  await wait(2000)
  const p = JSON.parse(await ev(`(() => { const r = document.querySelectorAll('[data-view=song-wall] div[role=button]')[1].getBoundingClientRect(); return JSON.stringify({x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2)}) })()`))
  await dbl(p.x, p.y)
  await wait(2400)
  await ev(`(() => { const b = [...document.querySelectorAll('[data-view=lattice-stage] button')].find(x => x.getAttribute('aria-label') === '音效'); b?.click(); return 1 })()`)
  await wait(800)
  await ev(`(() => { const b = [...document.querySelectorAll('[data-immersive-panel=open] button')].find(x => x.textContent.includes('音效设置')); b?.click(); return 1 })()`)
  await wait(1300)
  console.log('titles:', await ev(`(() => { const m = document.querySelector('[role=dialog][aria-label="音效设置"]'); return m ? JSON.stringify([...m.querySelectorAll('h2,h3')].map(h => h.textContent.trim()).slice(0, 8)) : 'none' })()`))
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/fx-window-final.png', Buffer.from(shot.data, 'base64'))
  console.log('saved')
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
