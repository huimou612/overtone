const http = require('node:http')
const get = () => new Promise(r => http.get('http://127.0.0.1:9224/json', res => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>r(JSON.parse(b))) }))
const MAIN = t => t.type==='page' && String(t.url).includes('index.html') && !String(t.url).includes('/folia/')
;(async () => {
  const t = (await get()).find(MAIN)
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  await new Promise(r => ws.addEventListener('open', r, {once:true}))
  let mid = 0
  const ev = expr => new Promise(res => {
    const id = ++mid
    const h = m => { let x; try { x = JSON.parse(m.data) } catch { return }
      if (x.id === id) { ws.removeEventListener('message', h); res(x.result?.result?.value) } }
    ws.addEventListener('message', h)
    ws.send(JSON.stringify({id, method:'Runtime.evaluate', params:{expression:expr, returnByValue:true, awaitPromise:true}}))
  })
  console.log('state:', await ev(`JSON.stringify({
    hash: location.hash.slice(0, 30),
    wall: !!document.querySelector('[data-view=song-wall]'),
    stage: !!document.querySelector('[data-view=lattice-stage]'),
    playBar: !!document.querySelector('#player'),
    picTip: [...document.querySelectorAll('[aria-label]')].map(e => e.getAttribute('aria-label')).filter(l => l && l.includes('播放详情')).slice(0,3),
    immersive: [...document.querySelectorAll('[aria-label]')].map(e => e.getAttribute('aria-label')).filter(l => l && l.includes('沉浸')).slice(0,3),
  })`))
  process.exit(0)
})()
