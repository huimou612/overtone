const http = require('node:http')
const get = () => new Promise(r => http.get('http://127.0.0.1:9224/json', res => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>r(JSON.parse(b))) }))
const MAIN = t => t.type==='page' && String(t.url).includes('index.html')
;(async () => {
  const list = await get()
  console.log('targets:', list.map(t => t.type + ' ' + String(t.url).slice(0, 60)).join('\n'))
  const t = list.find(MAIN)
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
  console.log('body 长度:', await ev(`document.body.innerText.length`))
  console.log('root 子节点:', await ev(`document.getElementById('root') ? document.getElementById('root').children.length : 'no-root'`))
  console.log('全局错误:', await ev(`JSON.stringify(window.__errs || [])`))
  process.exit(0)
})().catch(e => { console.log('ERR', e.message); process.exit(1) })
