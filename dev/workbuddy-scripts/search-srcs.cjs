const http = require('node:http')
const get = () => new Promise(r => http.get('http://127.0.0.1:9224/json', res => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>r(JSON.parse(b))) }))
const wait = ms => new Promise(r => setTimeout(r, ms))
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
    ws.send(JSON.stringify({id, method:'Runtime.evaluate', params:{expression:expr, returnByValue:true, awaitPromise:true}}))
  })
  const names = ['酷我音乐', '酷狗音乐', '企鹅音乐', '网易音乐', '咪咕音乐', '开放曲库', '聚合搜索']
  for (const name of names) {
    const clicked = await ev(`(() => {
      const el = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && e.textContent.trim() === ${JSON.stringify(name)})
      if (!el) return 'notfound'
      el.click()
      return 'clicked'
    })()`)
    await wait(4500)
    const state = await ev(`(() => {
      const txt = document.body.innerText
      const loading = txt.includes('加载中')
      const noItem = txt.includes('没有找到') || txt.includes('无结果')
      const rows = document.querySelectorAll('[class*=list-item]').length
      return JSON.stringify({ loading, noItem, rows, hash: location.hash.slice(-40) })
    })()`)
    console.log(name.padEnd(5), clicked, state)
  }
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
