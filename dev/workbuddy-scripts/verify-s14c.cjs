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

  // 1) 打开播放详情页
  console.log('open detail:', await ev(`(() => { const el = [...document.querySelectorAll('[aria-label]')].find(e => (e.getAttribute('aria-label')||'').startsWith('播放详情页')); if (el) { el.click(); return 'ok' } return 'no' })()`))
  await wait(1600)
  // 2) 点「沉浸式歌词」
  console.log('click immersive:', await ev(`(() => { const el = [...document.querySelectorAll('[aria-label="沉浸式歌词"]')].find(x => x.offsetParent); if (el) { el.click(); return 'ok' } return 'no' })()`))
  await wait(2200)
  console.log('unified stage open:', await ev(`!!document.querySelector('[data-view=lattice-stage]')`))
  // 3) seek 60s 后打开时间线
  await ev(`window.app_event.setProgress(60); 1`)
  await wait(1600)
  console.log('open timeline:', await ev(`(() => { const b = [...document.querySelectorAll('[data-view=lattice-stage] button')].find(x => (x.getAttribute('aria-label')||'') === '时间线'); if (b) { b.click(); return 'ok' } return 'no' })()`))
  await wait(1300)
  const tl = await ev(`(() => { const rows = [...document.querySelectorAll('[data-tl-index]')]; return JSON.stringify({ rows: rows.length, first: rows[0]?.innerText?.replace(/\\n/g,' ').slice(0, 30) || null }) })()`)
  console.log('timeline:', tl)
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/lattice-timeline.png', Buffer.from(shot.data, 'base64'))
  console.log('screenshot saved')
  // 4) 点第 6 行 seek
  const before = await ev(`document.querySelector('[data-view=lattice-stage] footer')?.innerText?.replace(/\\n/g,' ')`)
  await ev(`(() => { document.querySelectorAll('[data-tl-index]')[5]?.click(); return 1 })()`)
  await wait(1400)
  const after = await ev(`document.querySelector('[data-view=lattice-stage] footer')?.innerText?.replace(/\\n/g,' ')`)
  console.log('seek by row click:', JSON.stringify({ before, after }))
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
