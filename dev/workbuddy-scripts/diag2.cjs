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
  console.log('root 子元素 class:', await ev(`(() => {
    const root = document.querySelector('[data-view="song-wall"]')
    if (!root) return 'no-root'
    return JSON.stringify([...root.children].map(c => ({ tag: c.tagName, cls: String(c.className).slice(0, 50), h: Math.round(c.getBoundingClientRect().height) })))
  })()`))
  console.log('tiles:', await ev(`document.querySelectorAll('[data-view="song-wall"] [data-tile-index]').length`))
  process.exit(0)
})().catch(e => { console.log('ERR', e.message); process.exit(1) })
