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
    if (m.method === 'Runtime.consoleAPICalled' && ['error','warning','log'].includes(m.params.type))
      logs.push(m.params.type + ': ' + (m.params.args||[]).map(a=>a.value ?? a.description ?? '').join(' ').slice(0, 160))
    if (m.method === 'Runtime.exceptionThrown')
      logs.push('EXC: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').slice(0, 200)) })
  let mid = 0
  const ev = expr => new Promise(res => {
    const id = ++mid
    const h = raw => { let m; try { m = JSON.parse(raw.data) } catch { return }
      if (m.id === id) { ws.removeEventListener('message', h); res(m.result?.result?.value) } }
    ws.addEventListener('message', h)
    ws.send(JSON.stringify({id, method:'Runtime.evaluate', params:{expression:expr, returnByValue:true, awaitPromise:true}}))
  })
  // 进搜索页，走聚合
  await ev(`location.hash = '#/search?source=all&type=song&text=红&page=1'; 1`)
  await wait(6000)
  const out = await ev(`(() => {
    const srcs = window.__searchSources
    return JSON.stringify({
      hash: location.hash.slice(0, 60),
      bodyText: document.body.innerText.slice(0, 160).replace(/\\n/g, '|'),
      rows: document.querySelectorAll('[class*=list-item]').length,
    })
  })()`)
  console.log('page:', out)
  console.log('logs:', JSON.stringify(logs.slice(-12), null, 1))
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
