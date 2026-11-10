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
  // 开墙 → Lattice
  await ev(`document.querySelector('a[aria-label="封面墙"]')?.click()`)
  await wait(1800)
  await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('Lattice')); b?.click(); return !!b })()`)
  await wait(2200)
  // 布局：三行的纵向位置应递增（不再横向挤）
  const layout = await ev(`(() => {
    const stage = document.querySelector('[data-view=lattice-stage]')
    const lines = [...stage.querySelectorAll('[data-state]')].map(e => { const r = e.getBoundingClientRect(); return { state: e.getAttribute('data-state'), x: Math.round(r.x), y: Math.round(r.y), h: Math.round(r.height), size: getComputedStyle(e).fontSize } })
    return JSON.stringify({ count: lines.length, lines })
  })()`)
  console.log('layout:', layout)
  // 时间→行：seek 到 60s，看当前行是否变
  const before = await ev(`document.querySelector('[data-view=lattice-stage] [data-state=active]')?.innerText?.replace(/\\n/g,' ') || ''`)
  await ev(`window.app_event.setProgress(60); 1`)
  await wait(2500)
  const after = await ev(`document.querySelector('[data-view=lattice-stage] [data-state=active]')?.innerText?.replace(/\\n/g,' ') || ''`)
  console.log('active before seek:', JSON.stringify(before))
  console.log('active after  seek:', JSON.stringify(after))
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/lattice-stage.png', Buffer.from(shot.data, 'base64'))
  console.log('screenshot saved')
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
