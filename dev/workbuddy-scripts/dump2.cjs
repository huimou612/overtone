const http = require('node:http')
const get = () => new Promise(r => http.get('http://127.0.0.1:9224/json', res => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>r(JSON.parse(b))) }))
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
  console.log('含时间/沉浸的 aria-label:', await ev(`JSON.stringify([...document.querySelectorAll('[aria-label]')].map(e => e.getAttribute('aria-label')).filter(l => /时间|沉浸|歌词/.test(l)))`))
  console.log('icon-immersive 用量:', await ev(`document.querySelectorAll('use[href="#icon-immersive"]').length`))
  console.log('播放栏文本:', await ev(`(() => { const el = [...document.querySelectorAll('div')].find(d => d.className && /playBar|playbar/i.test(String(d.className))); return el ? el.innerText.replace(/\\n/g,' | ').slice(0,120) : 'no-playbar' })()`))
  process.exit(0)
})()
