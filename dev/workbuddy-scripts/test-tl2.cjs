const http = require('node:http')
const fs = require('node:fs')
const get = () => new Promise(r => http.get('http://127.0.0.1:9224/json', res => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>r(JSON.parse(b))) }))
const wait = ms => new Promise(r => setTimeout(r, ms))
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

  // 封面墙 → 顶栏 Lattice → 舞台
  await ev(`(() => { const el = [...document.querySelectorAll('a,li')].find(x => (x.getAttribute('aria-label')||'').includes('封面墙')); el?.click(); return !!el })()`)
  await wait(2200)
  await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Lattice'); b?.click(); return !!b })()`)
  await wait(2200)
  console.log('舞台:', await ev(`!!document.querySelector('[data-view="lattice-stage"]')`))
  console.log('面板页签:', await ev(`JSON.stringify([...document.querySelectorAll('[data-view="lattice-stage"] aside button[aria-label]')].map(b => b.getAttribute('aria-label')))`))

  // 底部栏展开
  const fr = JSON.parse(await ev(`(() => { const f = document.querySelector('[data-view="lattice-stage"] footer'); const b = f.getBoundingClientRect(); return JSON.stringify({ x: Math.round(b.left + b.width/2), y: Math.round(b.top + b.height/2) }) })()`))
  console.log('底部栏位置:', fr)
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: fr.x, y: fr.y })
  await wait(300)
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: fr.x + 1, y: fr.y + 1 })
  await wait(900)
  console.log('底部栏按钮:', await ev(`JSON.stringify([...document.querySelectorAll('[data-view="lattice-stage"] footer button')].map(b => b.getAttribute('aria-label') || b.textContent.trim()).filter(Boolean))`))
  let shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/tl-bar.png', Buffer.from(shot.data, 'base64'))

  const tl = await ev(`(() => { const b = document.querySelector('[data-view="lattice-stage"] footer button[aria-label="时间线"]'); if (!b) return 'no'; b.click(); return 'ok' })()`)
  await wait(1300)
  console.log('点时间线:', tl, '| 弹窗:', await ev(`document.querySelectorAll('[data-view="lattice-stage"] [role="dialog"]').length`))
  shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/tl-open.png', Buffer.from(shot.data, 'base64'))
  process.exit(0)
})().catch(e => { console.log('ERR', e.message); process.exit(1) })
