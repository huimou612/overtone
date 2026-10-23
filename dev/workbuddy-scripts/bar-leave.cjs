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
  const w = () => ev(`Math.round(document.querySelector('[data-view=lattice-stage] footer').getBoundingClientRect().width)`)
  console.log('now:', await w())
  // 移开很远，多步移动确保 pointerleave 触发
  for (const [x, y] of [[300, 300], [200, 200], [120, 120]]) {
    await send('Input.dispatchMouseEvent', { type:'mouseMoved', x, y })
    await wait(150)
  }
  await wait(1200)
  console.log('after moving away:', await w())
  process.exit(0)
})()
