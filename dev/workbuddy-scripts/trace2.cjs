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
      events.push('EXC: ' + (d.exception?.description ? d.exception.description.split('\n').slice(0,3).join(' | ') : d.text))
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      events.push('ERR: ' + m.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 400))
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
  await wait(400)
  const clicked = await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Lattice'); if (!b) return 'no-btn'; b.click(); return 'ok' })()`)
  console.log('点 Lattice:', clicked)
  await wait(2500)
  console.log('舞台:', await ev(`!!document.querySelector('[data-view="lattice-stage"]')`))
  console.log('canvas 数:', await ev(`document.querySelectorAll('canvas').length`))
  console.log(events.slice(0, 5).join('\n---\n') || '（无错误）')
  process.exit(0)
})().catch(e => { console.log('ERR', e.message); process.exit(1) })
