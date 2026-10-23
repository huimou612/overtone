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
  await ev(`(() => { const a = [...document.querySelectorAll('a,button')].find(x => (x.getAttribute('aria-label')||'') === '设置'); a?.click(); return !!a })()`)
  await wait(2000)
  // 直接在设置页里找「音乐来源」那一行的当前值
  console.log('音乐来源行:', await ev(`(() => {
    const dt = [...document.querySelectorAll('dt')].find(d => d.textContent.includes('音乐来源'))
    if (!dt) return 'no-dt'
    const dd = dt.nextElementSibling
    return dd ? dd.innerText.replace(/\\n+/g, ' | ').slice(0, 200) : 'no-dd'
  })()`))
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/builtin-setting.png', Buffer.from(shot.data, 'base64'))
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
