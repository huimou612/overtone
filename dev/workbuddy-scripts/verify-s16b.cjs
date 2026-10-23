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

  // 打开播放详情
  await ev(`(() => { const el = [...document.querySelectorAll('[aria-label]')].find(e => (e.getAttribute('aria-label')||'').startsWith('播放详情页')); el?.click(); return 1 })()`)
  await wait(2000)
  console.log('immersive btn present:', await ev(`[...document.querySelectorAll('[aria-label="沉浸式歌词"]')].filter(x => x.offsetParent).length`))
  await ev(`(() => { const el = [...document.querySelectorAll('[aria-label="沉浸式歌词"]')].filter(x => x.offsetParent)[0]; el?.click(); return 1 })()`)
  await wait(2500)
  console.log('stage open:', await ev(`!!document.querySelector('[data-view=lattice-stage]')`))
  if (!(await ev(`!!document.querySelector('[data-view=lattice-stage]')`))) { process.exit(1) }
  await ev(`window.app_event.setProgress(60); 1`)
  await wait(1600)

  console.log('1 lineTrack nodes:', await ev(`document.querySelectorAll('[data-view=lattice-stage] [data-state=active] i').length`))

  const barW = () => ev(`(() => { const b = document.querySelector('[data-view=lattice-stage] footer'); if (!b) return JSON.stringify({ none: true }); const r = b.getBoundingClientRect(); return JSON.stringify({ w: Math.round(r.width), op: getComputedStyle(b).opacity }) })()`)
  console.log('2 bar default:', await barW())
  const bb = JSON.parse(await ev(`(() => { const r = document.querySelector('[data-view=lattice-stage] footer').getBoundingClientRect(); return JSON.stringify({x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2)}) })()`))
  await send('Input.dispatchMouseEvent', { type:'mouseMoved', x: bb.x, y: bb.y })
  await wait(800)
  console.log('2b bar hover:', await barW())
  const shot1 = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/bar-expanded.png', Buffer.from(shot1.data, 'base64'))
  await send('Input.dispatchMouseEvent', { type:'mouseMoved', x: 400, y: 150 })
  await wait(800)
  console.log('2c bar after leave:', await barW())

  for (const name of ['封面', '音效', '播放列表', '时间线']) {
    await ev(`(() => { const b = [...document.querySelectorAll('[data-view=lattice-stage] button')].find(x => x.getAttribute('aria-label') === ${JSON.stringify(name)}); b?.click(); return !!b })()`)
    await wait(700)
    console.log(`3 tab ${name}:`, await ev(`(() => { const p = document.querySelector('[data-immersive-panel=open]'); return p ? p.innerText.replace(/\\n/g,'|').slice(0, 80) : 'no-panel' })()`))
  }
  const shot2 = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/panel-timeline.png', Buffer.from(shot2.data, 'base64'))

  await ev(`(() => { const b = [...document.querySelectorAll('[data-immersive-panel=open] button')].find(x => x.textContent.trim() === '✕'); b?.click(); return !!b })()`)
  await wait(800)
  console.log('4 after ✕:', await ev(`JSON.stringify({ panel: !!document.querySelector('[data-immersive-panel=open]'), stage: !!document.querySelector('[data-view=lattice-stage]') })`))
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
