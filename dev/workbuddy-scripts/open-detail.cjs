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

  // 点左下角歌名区域进播放详情
  const r = JSON.parse(await ev(`(() => {
    const el = [...document.querySelectorAll('div')].find(d => /侧脸/.test(d.textContent||'') && d.getBoundingClientRect().bottom > 620 && d.getBoundingClientRect().left < 300)
    if (!el) return 'null'
    const b = el.getBoundingClientRect()
    return JSON.stringify({ x: Math.round(b.left + b.width/2), y: Math.round(b.top + b.height/2) })
  })()`))
  if (r !== 'null') {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', buttons: 1, clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', buttons: 0, clickCount: 1 })
  }
  await wait(1600)
  console.log('详情页出现:', await ev(`!!document.querySelector('[class*="playDetail"], [data-view="play-detail"]') || document.body.innerText.includes('打开播放器')`))
  console.log('沉浸式按钮:', await ev(`JSON.stringify([...document.querySelectorAll('[aria-label]')].map(e => e.getAttribute('aria-label')).filter(l => /沉浸|时间线/.test(l)))`))
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/detail.png', Buffer.from(shot.data, 'base64'))
  process.exit(0)
})().catch(e => { console.log('ERR', e.message); process.exit(1) })
