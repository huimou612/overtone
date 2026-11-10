const http = require('node:http')
const get = () => new Promise(r => http.get('http://127.0.0.1:9224/json', res => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>r(JSON.parse(b))) }))
const wait = ms => new Promise(r => setTimeout(r, ms))
const MAIN = t => t.type==='page' && String(t.url).includes('index.html') && !String(t.url).includes('/folia/')
;(async () => {
  const t = (await get()).find(MAIN)
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  await new Promise(r => ws.addEventListener('open', r, {once:true}))
  let mid = 0
  const ev = e => new Promise(res => {
    const id = ++mid
    const h = m => { let x; try { x = JSON.parse(m.data) } catch { return }
      if (x.id === id) { ws.removeEventListener('message', h); res(x.result?.result?.value) } }
    ws.addEventListener('message', h)
    ws.send(JSON.stringify({id, method:'Runtime.evaluate', params:{expression:e, returnByValue:true, awaitPromise:true}}))
  })
  // 切到内置源
  console.log('updateSetting:', await ev(`(() => { window.lxData.updateSetting({ 'common.apiSource': 'user_api_fanyin_builtin' }); return 'ok' })()`))
  await wait(3000)
  console.log('apiSource:', await ev(`window.lxData.appSetting['common.apiSource']`))
  console.log('inputs on page:', await ev(`JSON.stringify([...document.querySelectorAll('input')].map(i => ({ type: i.type, ph: i.placeholder, cls: String(i.className).slice(0,20) })).slice(0,6))`))
  process.exit(0)
})()
