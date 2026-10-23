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

  // 开墙 → 双击第一张进舞台
  await ev(`document.querySelector('a[aria-label="封面墙"]')?.click()`)
  await wait(1800)
  const p = JSON.parse(await ev(`(() => { const r = document.querySelectorAll('[data-view=song-wall] div[role=button]')[1].getBoundingClientRect(); return JSON.stringify({x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2)}) })()`))
  await send('Input.dispatchMouseEvent', { type:'mouseMoved', x: p.x, y: p.y })
  for (let i = 1; i <= 2; i++) {
    await send('Input.dispatchMouseEvent', { type:'mousePressed', x: p.x, y: p.y, button:'left', clickCount:i, buttons:1 })
    await send('Input.dispatchMouseEvent', { type:'mouseReleased', x: p.x, y: p.y, button:'left', clickCount:i })
    await wait(60)
  }
  await wait(1200)
  // 1) 舞台 + 控制岛浮现
  const bar1 = await ev(`(() => { const b = document.querySelector('[data-view=lattice-stage] footer'); const cs = getComputedStyle(b); return JSON.stringify({ opacity: cs.opacity, transform: cs.transform, backdrop: cs.backdropFilter, border: cs.borderTopColor }) })()`)
  console.log('1 bar (after 1.2s):', bar1)
  await wait(900)
  const bar2 = await ev(`(() => { const b = document.querySelector('[data-view=lattice-stage] footer'); const cs = getComputedStyle(b); return JSON.stringify({ opacity: cs.opacity, transform: cs.transform }) })()`)
  console.log('1b bar (after 2.1s):', bar2)
  // 2) 粒子画布有内容
  const parts = await ev(`(() => {
    const c = document.querySelector('[data-view=lattice-stage] canvas')
    if (!c) return 'no canvas'
    const ctx = c.getContext('2d')
    const d = ctx.getImageData(0, 0, Math.min(200, c.width), Math.min(200, c.height)).data
    let lit = 0
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) lit++
    return JSON.stringify({ w: c.width, h: c.height, litPixels: lit })
  })()`)
  console.log('2 particles:', parts)
  // 3) 行内时间线
  const track = await ev(`(() => {
    const a = document.querySelector('[data-view=lattice-stage] [data-state=active]')
    const t = a?.querySelector('i')
    return JSON.stringify({ hasTrack: !!t, width: t?.style?.width || null, text: a?.innerText?.replace(/\\n/g,' ').slice(0, 30) || null })
  })()`)
  console.log('3 line track:', track)
  // 4) 侧栏面板
  await ev(`(() => { const b = [...document.querySelectorAll('[data-view=lattice-stage] footer button')].find(x => (x.getAttribute('aria-label')||'').includes('面板') || (x.getAttribute('title')||'').includes('面板')); b?.click(); return !!b })()`)
  await wait(900)
  const panel = await ev(`(() => {
    const p = document.querySelector('[data-immersive-panel=open]')
    return JSON.stringify({ open: !!p, sections: p ? [...p.querySelectorAll('[data-panel-section]')].map(e => e.getAttribute('data-panel-section')) : [] })
  })()`)
  console.log('4 panel:', panel)
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/lattice-stage-v2.png', Buffer.from(shot.data, 'base64'))
  console.log('screenshot saved')
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
