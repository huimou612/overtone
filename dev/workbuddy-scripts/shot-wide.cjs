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
  await ev(`(() => { const a = [...document.querySelectorAll('a,button')].find(x => (x.getAttribute('aria-label')||'') === '设置'); a?.click(); return !!a })()`)
  await wait(1800)
  await ev(`(() => { const el = document.querySelector('#basic_source'); el?.scrollIntoView({ block: 'center' }); return !!el })()`)
  await wait(700)
  console.log('宽屏:', await ev(`(() => {
    const h3 = document.querySelector('#basic_source')
    const wrap = h3 && h3.parentElement.querySelector('div')
    if (!wrap) return 'no-wrap'
    const kids = [...wrap.children].map(k => ({ w: Math.round(k.getBoundingClientRect().width), top: Math.round(k.getBoundingClientRect().top) }))
    return JSON.stringify({ wrapW: Math.round(wrap.getBoundingClientRect().width), scrollW: wrap.scrollWidth, kids })
  })()`))
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/source-card-wide.png', Buffer.from(shot.data, 'base64'))
  process.exit(0)
})()
