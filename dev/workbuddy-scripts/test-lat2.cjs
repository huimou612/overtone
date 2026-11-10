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

  // 背景页签
  await ev(`document.querySelector('[data-view="lattice-stage"] aside button[aria-label="背景"]')?.click()`)
  await wait(900)
  let shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/lat-bg.png', Buffer.from(shot.data, 'base64'))
  console.log('背景预设:', await ev(`JSON.stringify([...document.querySelectorAll('[data-view="lattice-stage"] aside [title]')].map(e => e.getAttribute('title')).slice(-6))`))

  // 换一个背景预设
  await ev(`(() => { const b = [...document.querySelectorAll('[data-view="lattice-stage"] aside [title]')].find(e => e.getAttribute('title') === '余烬'); b?.click(); return !!b })()`)
  await wait(700)
  console.log('当前背景:', await ev(`document.querySelector('[data-view="lattice-stage"]').getAttribute('data-bg')`))

  // 歌词样式页签 + 选「流光」
  await ev(`document.querySelector('[data-view="lattice-stage"] aside button[aria-label="歌词样式"]')?.click()`)
  await wait(700)
  const ok = await ev(`(() => {
    const items = [...document.querySelectorAll('[data-view="lattice-stage"] aside button')].filter(b => b.querySelector('span') && b.textContent.includes('流光'))
    if (!items.length) return 'no'
    items[0].click(); return 'ok'
  })()`)
  await wait(900)
  console.log('切换流光:', ok, '| data-lyric-style:', await ev(`document.querySelector('[data-view="lattice-stage"]').getAttribute('data-lyric-style')`))
  shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/lat-style.png', Buffer.from(shot.data, 'base64'))
  process.exit(0)
})().catch(e => { console.log('ERR', e.message); process.exit(1) })
