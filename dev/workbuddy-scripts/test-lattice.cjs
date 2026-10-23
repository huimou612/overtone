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

  // 用顶部 Lattice 按钮开一次，确认舞台本身能用
  const clicked = await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Lattice'); b?.click(); return !!b })()`)
  await wait(1500)
  console.log('Lattice 按钮:', clicked)
  console.log('舞台元素:', await ev(`(() => {
    const root = document.querySelector('[data-view="song-wall"]')
    const all = [...root.querySelectorAll('*')]
    const cand = all.filter(el => el.className && String(el.className).toLowerCase().includes('lattice'))
    return JSON.stringify(cand.slice(0, 4).map(el => ({ tag: el.tagName, cls: String(el.className).slice(0, 40) })))
  })()`))
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/lattice-check.png', Buffer.from(shot.data, 'base64'))
  process.exit(0)
})().catch(e => { console.log('ERR', e.message); process.exit(1) })
