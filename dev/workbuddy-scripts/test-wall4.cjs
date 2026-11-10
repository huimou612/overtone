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

  // 打开「我的歌」这个 1140 首的列表，再进封面墙
  await ev(`(() => { const el = [...document.querySelectorAll('a,li')].find(x => (x.textContent||'').trim() === '我的歌'); el?.click(); return !!el })()`)
  await wait(1800)
  await ev(`(() => { const el = [...document.querySelectorAll('a,button,li')].find(x => (x.getAttribute('aria-label')||'').includes('封面墙')); el?.click(); return !!el })()`)
  await wait(2600)
  const info = await ev(`(() => {
    const root = document.querySelector('[data-view="song-wall"]')
    if (!root) return 'no-wall'
    const tiles = [...root.querySelectorAll('div')].filter(d => d.style && d.style.left && d.style.width)
    const stage = tiles.length ? tiles[0].parentElement : null
    return JSON.stringify({ tiles: tiles.length, stageW: stage && stage.clientWidth, stageH: stage && stage.clientHeight,
      sample: tiles.slice(0,3).map(d => ({ l: d.style.left, t: d.style.top, w: d.style.width })) })
  })()`)
  console.log('墙:', info)
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/wall-v3.png', Buffer.from(shot.data, 'base64'))
  process.exit(0)
})().catch(e => { console.log('ERR', e.message); process.exit(1) })
