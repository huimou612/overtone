const http = require('node:http')
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
  // 找到 footer 里的进度条容器（.seek = footer 的第 5 个子元素）
  const box = JSON.parse(await ev(`(() => {
    const f = document.querySelector('[data-view=lattice-stage] footer')
    const kids = [...f.children]
    const seek = kids.find(k => k.querySelector('div[class]') && k.getBoundingClientRect().width > 120 && k.querySelectorAll('div').length >= 2)
    const r = seek.getBoundingClientRect()
    return JSON.stringify({ x: Math.round(r.x + r.width * 0.6), y: Math.round(r.y + r.height / 2), w: Math.round(r.width) })
  })()`))
  console.log('seek box:', JSON.stringify(box))
  await send('Input.dispatchMouseEvent', { type:'mouseMoved', x: box.x, y: box.y })
  await send('Input.dispatchMouseEvent', { type:'mousePressed', x: box.x, y: box.y, button:'left', clickCount:1, buttons:1 })
  await wait(150)
  await send('Input.dispatchMouseEvent', { type:'mouseReleased', x: box.x, y: box.y, button:'left', clickCount:1 })
  await wait(1500)
  const after = await ev(`document.querySelector('[data-view=lattice-stage] footer')?.innerText?.replace(/\\n/g,' ')`)
  console.log('time after click:', after)
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
