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
  // 用文本定位小卡片（CSS 类名被哈希，不能用类名选择器）
  const box = await ev(`(() => {
    const mini = [...document.querySelectorAll('[data-view=lattice-stage] div')].find(d => d.innerText && d.innerText.includes('正在播放'))
    if (!mini) return 'none'
    const r = mini.getBoundingClientRect()
    return JSON.stringify({ x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2), text: mini.innerText.replace(/\\n/g,' ').slice(0,40) })
  })()`)
  console.log('mini bar:', box)
  if (box === 'none') { process.exit(0) }
  const p = JSON.parse(box)
  await send('Input.dispatchMouseEvent', { type:'mouseMoved', x: p.x, y: p.y })
  await wait(800)
  console.log('after hover:', await ev(`(() => {
    const mini = [...document.querySelectorAll('[data-view=lattice-stage] div')].find(d => d.innerText && d.innerText.includes('正在播放'))
    const full = document.querySelector('[data-view=lattice-stage] footer')
    return JSON.stringify({ miniOpacity: mini ? getComputedStyle(mini).opacity : null, fullOpacity: full ? getComputedStyle(full).opacity : null, fullPE: full ? getComputedStyle(full).pointerEvents : null })
  })()`))
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/folia-layout-hover.png', Buffer.from(shot.data, 'base64'))
  await send('Input.dispatchMouseEvent', { type:'mouseMoved', x: 420, y: 180 })
  await wait(900)
  console.log('after leave:', await ev(`(() => {
    const mini = [...document.querySelectorAll('[data-view=lattice-stage] div')].find(d => d.innerText && d.innerText.includes('正在播放'))
    const full = document.querySelector('[data-view=lattice-stage] footer')
    return JSON.stringify({ miniOpacity: mini ? getComputedStyle(mini).opacity : null, fullOpacity: full ? getComputedStyle(full).opacity : null })
  })()`))
  const shot2 = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/folia-layout-idle.png', Buffer.from(shot2.data, 'base64'))
  console.log('saved')
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
