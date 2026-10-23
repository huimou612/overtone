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

  // 封面墙 → Lattice
  await ev(`(() => { const el = [...document.querySelectorAll('a,li')].find(x => (x.getAttribute('aria-label')||'').includes('封面墙')); el?.click(); return !!el })()`)
  await wait(2200)
  await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Lattice'); b?.click(); return !!b })()`)
  await wait(2600)
  console.log('舞台:', await ev(`!!document.querySelector('[data-view="lattice-stage"]')`))
  console.log('canvas 存在:', await ev(`(() => { const c = document.querySelectorAll('[data-view="lattice-stage"] canvas'); return c.length + ' | size=' + (c[0] ? c[0].width + 'x' + c[0].height : '-') })()`))
  let shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/cv-standard.png', Buffer.from(shot.data, 'base64'))

  // 切粒子
  await ev(`document.querySelector('[data-view="lattice-stage"] aside button[aria-label="歌词样式"]')?.click()`)
  await wait(600)
  await ev(`(() => { const b = [...document.querySelectorAll('[data-view="lattice-stage"] aside button')].find(x => x.textContent.includes('粒子')); b?.click(); return !!b })()`)
  await wait(1600)
  shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/cv-particle.png', Buffer.from(shot.data, 'base64'))
  console.log('样式:', await ev(`document.querySelector('[data-view="lattice-stage"]').getAttribute('data-lyric-style')`))
  process.exit(0)
})().catch(e => { console.log('ERR', e.message); process.exit(1) })
