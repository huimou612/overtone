const http = require('node:http')
const fs = require('node:fs')
const get = () => new Promise(r => http.get('http://127.0.0.1:9224/json', res => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>r(JSON.parse(b))) }))
const wait = ms => new Promise(r => setTimeout(r, ms))
;(async () => {
  const t = (await get()).find(x => x.type === 'page')
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  await new Promise(r => ws.addEventListener('open', r, {once:true}))
  let mid = 0
  const errs = []
  ws.addEventListener('message', raw => {
    let m; try { m = JSON.parse(raw.data) } catch { return }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 160))
    if (m.method === 'Runtime.exceptionThrown') errs.push('EXC ' + (m.params.exceptionDetails.exception?.description || '').slice(0, 160))
  })
  const send = (m, p={}) => new Promise(res => {
    const id = ++mid
    const h = raw => { let x; try { x = JSON.parse(raw.data) } catch { return }
      if (x.id === id) { ws.removeEventListener('message', h); res(x.result) } }
    ws.addEventListener('message', h)
    ws.send(JSON.stringify({id, method:m, params:p}))
  })
  const ev = e => send('Runtime.evaluate', {expression:e, returnByValue:true, awaitPromise:true}).then(r => r.result?.value)
  const click = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 })
  }
  await send('Runtime.enable')
  // 左侧栏封面墙图标
  await click(44, 339)
  await wait(2600)
  console.log('墙:', await ev(`!!document.querySelector('[data-view="song-wall"]')`))
  // 顶栏 Lattice
  const lb = JSON.parse(await ev(`(() => { const b = [...document.querySelectorAll('[data-view="song-wall"] button')].find(x => (x.textContent||'').includes('Lattice')); if (!b) return 'null'; const r = b.getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) }) })()`))
  console.log('Lattice 位置:', lb)
  if (lb !== 'null') await click(lb.x, lb.y)
  await wait(3200)
  console.log('舞台:', await ev(`!!document.querySelector('[data-view="lattice-stage"]')`), '| canvas:', await ev(`document.querySelectorAll('[data-view="lattice-stage"] canvas').length`))
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/cv-final.png', Buffer.from(shot.data, 'base64'))
  console.log('错误:', errs.slice(0, 2).join(' | ') || '无')
  process.exit(0)
})().catch(e => { console.log('ERR', e.message); process.exit(1) })
