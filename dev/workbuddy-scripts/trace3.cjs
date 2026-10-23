const http = require('node:http')
const fs = require('node:fs')
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

  // 确保在封面墙
  const onWall = await ev(`!!document.querySelector('[data-view="song-wall"]')`)
  if (!onWall) {
    await ev(`(() => { const el = [...document.querySelectorAll('a,li')].find(x => (x.getAttribute('aria-label')||'').includes('封面墙')); el?.click(); return !!el })()`)
    await wait(2400)
  }
  const clicked = await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Lattice'); if (!b) return 'no-btn'; b.click(); return 'ok' })()`)
  console.log('点 Lattice:', clicked)
  await wait(2600)
  console.log('舞台:', await ev(`!!document.querySelector('[data-view="lattice-stage"]')`))
  console.log('canvas 数:', await ev(`document.querySelectorAll('[data-view="lattice-stage"] canvas').length`))
  console.log(events.slice(0, 4).join('\n---\n') || '（无错误）')
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/cv-open.png', Buffer.from(shot.data, 'base64'))
  process.exit(0)
})().catch(e => { console.log('ERR', e.message); process.exit(1) })
