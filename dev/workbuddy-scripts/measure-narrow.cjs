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
  const W = Number(process.argv[2] || 820)
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: 700, deviceScaleFactor: 1, mobile: false })
  await wait(900)
  console.log(`== 宽度 ${W} ==`)
  console.log('溢出:', await ev(`(() => {
    const h3 = document.querySelector('#basic_source')
    const wrap = h3 && h3.parentElement.querySelector('div')
    const r = wrap ? wrap.getBoundingClientRect() : null
    const scrollers = [...document.querySelectorAll('div')].filter(d => d.scrollWidth > d.clientWidth + 2)
    return JSON.stringify({
      wrapW: r ? Math.round(r.width) : null,
      wrapScrollW: wrap ? wrap.scrollWidth : null,
      listW: wrap ? Math.round(wrap.firstElementChild.getBoundingClientRect().width) : null,
      cardW: wrap && wrap.lastElementChild ? Math.round(wrap.lastElementChild.getBoundingClientRect().width) : null,
      overflowEls: scrollers.map(d => ({ cw: d.clientWidth, sw: d.scrollWidth })).slice(0, 3),
    })
  })()`))
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(`notes/preview/folia-acceptance/narrow-${W}.png`, Buffer.from(shot.data, 'base64'))
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
