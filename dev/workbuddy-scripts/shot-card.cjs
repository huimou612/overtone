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
  await wait(1800)
  // 滚到自定义源
  await ev(`(() => { const el = document.querySelector('#basic_source'); if (el) el.scrollIntoView({ block: 'center' }); return !!el })()`)
  await wait(700)
  const card = await ev(`(() => { const c = [...document.querySelectorAll('aside')].find(x => x.innerText.includes('内置')); return c ? c.innerText.replace(/\\n+/g,' | ') : 'no-card' })()`)
  console.log('右侧卡片:', card)
  const shot1 = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/source-card.png', Buffer.from(shot1.data, 'base64'))

  // 打开自定义源管理弹窗
  await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '自定义源管理'); b?.click(); return !!b })()`)
  await wait(1500)
  const safety = await ev(`(() => { const s = [...document.querySelectorAll('div')].find(x => x.innerText && x.innerText.includes('网络公开来源') && x.innerText.includes('第三方接口')); return s ? s.innerText.replace(/\\n+/g,' | ').slice(0, 260) : 'no-safety' })()`)
  console.log('安全说明:', safety)
  const shot2 = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/source-safety.png', Buffer.from(shot2.data, 'base64'))
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
