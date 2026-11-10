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

  // 打开时间线（原沉浸式入口）
  const opened = await ev(`(() => {
    const b = [...document.querySelectorAll('[aria-label]')].find(x => (x.getAttribute('aria-label')||'').includes('时间线'))
    if (!b) return 'no-btn'
    b.click(); return 'clicked'
  })()`)
  console.log('入口:', opened)
  await wait(2200)
  console.log('舞台:', await ev(`!!document.querySelector('[data-view="lattice-stage"]')`))
  console.log('页签:', await ev(`JSON.stringify([...document.querySelectorAll('[data-view="lattice-stage"] aside button[aria-label]')].map(b => b.getAttribute('aria-label')).slice(0,8))`))
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/lat-panel.png', Buffer.from(shot.data, 'base64'))

  // 切到「背景」页签
  await ev(`(() => { const b = document.querySelector('[data-view="lattice-stage"] aside button[aria-label="背景"]'); b?.click(); return !!b })()`)
  await wait(800)
  const shot2 = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/lat-bg.png', Buffer.from(shot2.data, 'base64'))

  // 切到「歌词样式」并选「流光」
  await ev(`(() => { const b = document.querySelector('[data-view="lattice-stage"] aside button[aria-label="歌词样式"]'); b?.click(); return !!b })()`)
  await wait(700)
  const styled = await ev(`(() => {
    const b = [...document.querySelectorAll('[data-view="lattice-stage"] aside button')].find(x => x.textContent.trim().startsWith('流光'))
    if (!b) return 'no-flow'
    b.click(); return 'ok'
  })()`)
  await wait(900)
  console.log('切换流光:', styled, '| root 标记:', await ev(`document.querySelector('[data-view="lattice-stage"]').getAttribute('data-lyric-style')`))
  const shot3 = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/lat-style.png', Buffer.from(shot3.data, 'base64'))
  process.exit(0)
})().catch(e => { console.log('ERR', e.message); process.exit(1) })
