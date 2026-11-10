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
    const h = raw => { let m; try { m = JSON.parse(raw.data) } catch { return }
      if (m.id === id) { ws.removeEventListener('message', h); res(m.result?.result?.value) } }
    ws.addEventListener('message', h)
    ws.send(JSON.stringify({id, method:'Runtime.evaluate', params:{expression:expr, returnByValue:true}}))
  })
  const out = await ev(`(() => {
    const root = document.querySelector('.show-modal')
    if (!root) return 'no modal'
    const dialog = [...root.children].find(c => c.className.includes('y4j_4'))
    const btns = dialog ? [...dialog.querySelectorAll('button')].map(b => b.innerText.trim()) : []
    const btn = dialog ? [...dialog.querySelectorAll('button')].find(b => /确定|知道|好|关闭|OK/i.test(b.innerText)) || dialog.querySelector('button') : null
    if (btn) { btn.click(); return 'clicked: ' + btn.innerText.trim() + ' | all: ' + JSON.stringify(btns) }
    return 'no button | ' + JSON.stringify(btns)
  })()`)
  console.log(out)
  await new Promise(r => setTimeout(r, 1200))
  console.log('modal still open:', await ev(`!!document.querySelector('.show-modal')`))
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
