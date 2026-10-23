const http = require('node:http')
const get = () => new Promise(r => http.get('http://127.0.0.1:9224/json', res => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>r(JSON.parse(b))) }))
const wait = ms => new Promise(r => setTimeout(r, ms))
;(async () => {
  const t = (await get()).find(x => x.type === 'page')
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  await new Promise(r => ws.addEventListener('open', r, {once:true}))
  let mid = 0
  const logs = []
  ws.addEventListener('message', raw => {
    let m; try { m = JSON.parse(raw.data) } catch { return }
    if (m.method === 'Runtime.consoleAPICalled') {
      const txt = m.params.args.map(a => a.value ?? a.description ?? '').join(' ')
      if (/error|Error|warn|Warn|failed|undefined/.test(txt)) logs.push(m.params.type + ': ' + txt.slice(0, 400))
    }
    if (m.method === 'Runtime.exceptionThrown') {
      logs.push('EXC: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 400))
    }
  })
  const send = (m, p={}) => new Promise(res => {
    const id = ++mid
    const h = raw => { let x; try { x = JSON.parse(raw.data) } catch { return }
      if (x.id === id) { ws.removeEventListener('message', h); res(x.result) } }
    ws.addEventListener('message', h)
    ws.send(JSON.stringify({id, method:m, params:p}))
  })
  const ev = e => send('Runtime.evaluate', {expression:e, returnByValue:true, awaitPromise:true}).then(r => r.result?.value)
  await send('Runtime.enable')
  await ev(`(() => { const b = [...document.querySelectorAll('[data-view="song-wall"] button')].find(x => (x.textContent||'').includes('Lattice')); b?.click(); return !!b })()`)
  await wait(2500)
  console.log('舞台:', await ev(`!!document.querySelector('[data-view="lattice-stage"]')`))
  console.log(logs.slice(0, 6).join('\n---\n') || '（无日志）')
  process.exit(0)
})().catch(e => { console.log('ERR', e.message); process.exit(1) })
