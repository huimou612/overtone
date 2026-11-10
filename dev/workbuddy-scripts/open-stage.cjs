const http = require('node:http')
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
  await wait(2500)
  console.log('stage:', await ev(`!!document.querySelector('[data-view=lattice-stage]')`))
  console.log('win pos:', await ev(`JSON.stringify({ x: window.screenX, y: window.screenY, w: window.innerWidth, h: window.innerHeight })`))
  console.log('zone:', await ev(`(() => { const root = document.querySelector('[data-view=lattice-stage]'); const z = [...root.querySelectorAll('div')].find(d => d.querySelector && d.querySelector('button[aria-label="最小化"]')); const r = z.getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), op: getComputedStyle(z).opacity }) })()`))
  process.exit(0)
})()
