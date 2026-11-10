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
  await send('Emulation.clearDeviceMetricsOverride')
  await wait(800)
  await ev(`(() => { const el = document.querySelector('#basic_source'); el?.scrollIntoView({ block: 'center' }); return !!el })()`)
  await wait(500)
  console.log('宽屏布局:', await ev(`(() => {
    const h3 = document.querySelector('#basic_source')
    const wrap = h3.parentElement.querySelector('div')
    const kids = [...wrap.children].map(k => Math.round(k.getBoundingClientRect().width))
    return JSON.stringify({ wrapW: Math.round(wrap.getBoundingClientRect().width), scrollW: wrap.scrollWidth, kids, sameRow: wrap.children.length > 1 ? wrap.children[0].getBoundingClientRect().top === wrap.children[1].getBoundingClientRect().top : null })
  })()`))
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/source-card-wide.png', Buffer.from(shot.data, 'base64'))
  process.exit(0)
})()
