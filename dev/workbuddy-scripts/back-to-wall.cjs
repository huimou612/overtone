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
  // 点舞台左上角返回按钮，真正退出
  await ev(`(() => { const root = document.querySelector('[data-view=lattice-stage]'); if (!root) return 'no-stage'; const b = [...root.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === '返回'); b?.click(); return !!b })()`)
  await wait(1500)
  console.log('stage gone:', await ev(`!document.querySelector('[data-view=lattice-stage]')`), '| wall:', await ev(`!!document.querySelector('[data-view=song-wall]')`))
  process.exit(0)
})()
