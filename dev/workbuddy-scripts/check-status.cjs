const http = require('node:http')
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
  // 监听控制台
  await send('Runtime.enable')
  await ev(`window.__logs = []; window.__origErr = console.error; console.error = (...a) => { window.__logs.push('ERR ' + a.join(' ').slice(0,200)); window.__origErr(...a) }; 1`)

  await ev(`(() => { const a = [...document.querySelectorAll('a,button')].find(x => (x.getAttribute('aria-label')||'') === '设置'); a?.click(); return !!a })()`)
  await wait(1500)
  await ev(`(() => { const el = [...document.querySelectorAll('*')].find(x => x.children.length === 0 && x.textContent.trim() === '自定义源管理'); el?.click(); return !!el })()`)
  await wait(1500)
  console.log('源列表状态:', await ev(`(() => {
    const dd = [...document.querySelectorAll('dd')].find(d => d.innerText && d.innerText.includes('泛音聚合音源'))
    return dd ? dd.innerText.replace(/\\n+/g, ' | ').slice(0, 400) : 'not-found'
  })()`))
  console.log('console errors:', await ev(`JSON.stringify((window.__logs || []).slice(-5))`))
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
