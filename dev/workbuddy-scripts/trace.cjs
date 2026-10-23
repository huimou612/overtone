const http = require('node:http')
const get = () => new Promise(r => http.get('http://127.0.0.1:9224/json', res => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>r(JSON.parse(b))) }))
const wait = ms => new Promise(r => setTimeout(r, ms))
;(async () => {
  const t = (await get()).find(x => x.type === 'page')
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  await new Promise(r => ws.addEventListener('open', r, {once:true}))
  let mid = 0
  const events = []
  ws.addEventListener('message', raw => {
    let m; try { m = JSON.parse(raw.data) } catch { return }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails
      events.push('EXC: ' + (d.exception && d.exception.description ? d.exception.description.split('\n').slice(0, 4).join(' | ') : d.text))
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      events.push('ERR: ' + m.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 300))
    }
  })
  const send = (m, p={}) => new Promise(res => {
    const id = ++mid
    const h = raw => { let x; try { x = JSON.parse(raw.data) } catch { return }
      if (x.id === id) { ws.removeEventListener('message', h); res(x.result) } }
    ws.addEventListener('message', h)
    ws.send(JSON.stringify({id, method:m, params:p}))
  })
  await send('Runtime.enable')
  await send('Log.enable')
  await send('Page.enable')
  await send('Page.reload', { ignoreCache: true })
  await wait(6000)
  console.log(events.slice(0, 8).join('\n---\n') || '（无错误事件）')
  process.exit(0)
})().catch(e => { console.log('ERR', e.message); process.exit(1) })
