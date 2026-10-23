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

  // 打开设置页
  await ev(`(() => { const a = [...document.querySelectorAll('a,button')].find(x => (x.getAttribute('aria-label')||'') === '设置'); a?.click(); return !!a })()`)
  await wait(1500)
  // 点「软件更新」
  await ev(`(() => { const el = [...document.querySelectorAll('*')].find(x => x.children.length === 0 && x.textContent.trim() === '软件更新'); el?.click(); return !!el })()`)
  await wait(1200)
  // 点「重新检查更新」
  await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('重新检查更新')); b?.click(); return !!b })()`)
  await wait(3000)
  const txt = await ev(`(() => { const m = document.querySelector('.modal, [class*=modal]'); return m ? m.innerText.replace(/\\n/g,' | ').slice(0, 160) : 'no-modal' })()`)
  console.log('dialog:', txt)
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/update-0.2.0.png', Buffer.from(shot.data, 'base64'))
  console.log('saved')
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
