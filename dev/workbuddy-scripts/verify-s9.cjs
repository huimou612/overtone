const http = require('node:http')
const get = () => new Promise(r => http.get('http://127.0.0.1:9224/json', res => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>r(JSON.parse(b))) }))
const wait = ms => new Promise(r => setTimeout(r, ms))
const MAIN = t => t.type==='page' && String(t.url).includes('index.html') && !String(t.url).includes('/folia/')
;(async () => {
  const t = (await get()).find(MAIN)
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  await new Promise(r => ws.addEventListener('open', r, {once:true}))
  const logs = []
  ws.addEventListener('message', raw => { let m; try { m = JSON.parse(raw.data) } catch { return }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
      logs.push((m.params.args||[]).map(a=>a.value ?? a.description ?? '').join(' ').slice(0, 120)) })
  let mid = 0
  const ev = expr => new Promise(res => {
    const id = ++mid
    const h = raw => { let m; try { m = JSON.parse(raw.data) } catch { return }
      if (m.id === id) { ws.removeEventListener('message', h); res(m.result?.result?.value) } }
    ws.addEventListener('message', h)
    ws.send(JSON.stringify({id, method:'Runtime.evaluate', params:{expression:expr, returnByValue:true, awaitPromise:true}}))
  })
  // 进搜索页（聚合）
  await ev(`location.hash = '#/search?source=all&type=song&text=红&page=1'; 1`)
  await wait(9000)
  const out = await ev(`(() => {
    const tabs = [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && ['酷我音乐','酷狗音乐','企鹅音乐','网易音乐','咪咕音乐','开放曲库','聚合搜索'].includes(e.textContent.trim())).map(e => e.textContent.trim())
    const txt = document.body.innerText
    return JSON.stringify({
      tabs,
      hasOvTab: txt.includes('开放曲库'),
      loading: txt.includes('加载中'),
      rows: document.querySelectorAll('[class*=list-item]').length,
      firstRows: [...document.querySelectorAll('[class*=list-item]')].slice(0, 3).map(e => (e.innerText || '').replace(/\\n/g, ' ').slice(0, 40)),
    })
  })()`)
  console.log('aggregate:', out)
  console.log('console errors:', logs.length ? JSON.stringify(logs.slice(0, 4)) : 'NONE')
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
