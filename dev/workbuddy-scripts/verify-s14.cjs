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

  // 1) 走「沉浸式歌词」入口（播放详情页按钮）——应打开统一界面
  const opened = await ev(`(() => {
    const btns = [...document.querySelectorAll('button')].filter(b => (b.getAttribute('aria-label')||'') === '沉浸式歌词')
    if (btns.length) { btns[0].click(); return 'clicked:' + btns.length }
    return 'not-found'
  })()`)
  console.log('1 immersive entry:', opened)
  await wait(2000)
  console.log('1 unified view:', await ev(`JSON.stringify({ stage: !!document.querySelector('[data-view=lattice-stage]'), oldImmersive: !!document.querySelector('[data-immersive-stage]') })`))

  // 2) 打开时间线
  await ev(`window.app_event.setProgress(60); 1`)
  await wait(2000)
  await ev(`(() => { const b = [...document.querySelectorAll('[data-view=lattice-stage] button')].find(x => (x.getAttribute('aria-label')||'') === '时间线'); b?.click(); return !!b })()`)
  await wait(1200)
  const tl = await ev(`(() => {
    const rows = [...document.querySelectorAll('[data-tl-index]')]
    const active = document.querySelector('[data-tl-index].JwShw, [data-tl-index]')
    return JSON.stringify({
      open: rows.length > 0,
      rows: rows.length,
      firstText: rows[0]?.innerText?.replace(/\\n/g,' ').slice(0, 40),
      hasActiveClass: rows.some(r => r.className.includes('tlRowActive')),
      activeIndex: [...document.querySelectorAll('[data-tl-index]')].findIndex(r => r.getAttribute('data-tl-index') === r.getAttribute('data-tl-index') && r.innerText && r.className.split(' ').length > 2),
    })
  })()`)
  console.log('2 timeline:', tl)
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/lattice-timeline.png', Buffer.from(shot.data, 'base64'))
  console.log('screenshot saved')

  // 3) 点第 5 行 → seek
  const before = await ev(`document.querySelector('[data-view=lattice-stage] footer')?.innerText?.replace(/\\n/g,' ')`)
  await ev(`(() => { const r = document.querySelectorAll('[data-tl-index]')[5]; r?.click(); return !!r })()`)
  await wait(1500)
  const after = await ev(`document.querySelector('[data-view=lattice-stage] footer')?.innerText?.replace(/\\n/g,' ')`)
  console.log('3 seek by click:', JSON.stringify({ before, after }))
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
