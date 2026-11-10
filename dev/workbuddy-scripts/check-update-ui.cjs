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
  // 关掉当前弹窗
  await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '关闭'); b?.click(); return !!b })()`)
  await wait(800)
  // 点重新检查更新
  const clicked = await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('重新检查更新')); b?.click(); return !!b })()`)
  console.log('clicked:', clicked)
  await wait(3500)
  const txt = await ev(`(() => {
    const nodes = [...document.querySelectorAll('div')].filter(d => d.innerText && d.innerText.includes('最新版本'))
    return nodes.length ? nodes[nodes.length - 1].innerText.replace(/\\n/g, ' | ').slice(0, 120) : 'no-dialog'
  })()`)
  console.log('check dialog:', txt)
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/update-check-0.2.0.png', Buffer.from(shot.data, 'base64'))
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
