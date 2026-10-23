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

  // 1) 在自定义源管理里点内置源
  const switched = await ev(`(() => {
    const items = [...document.querySelectorAll('li, .sourceItem, [class*=source]')]
    const el = items.find(x => x.textContent.includes('泛音聚合音源（内置）'))
    if (!el) return 'not-found'
    el.click()
    return 'clicked'
  })()`)
  console.log('切换内置源:', switched)
  await wait(2500)
  console.log('当前 apiSource:', await ev(`window.lxData.appSetting['common.apiSource']`))

  // 2) 去搜索页搜歌
  await ev(`(() => { const a = [...document.querySelectorAll('a,button')].find(x => (x.getAttribute('aria-label')||'') === '搜索'); a?.click(); return !!a })()`)
  await wait(1500)
  const searched = await ev(`(() => {
    const input = document.querySelector('input[type=text], input:not([type])')
    if (!input) return 'no-input'
    input.focus()
    input.value = '晴天'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }))
    return 'typed'
  })()`)
  console.log('搜索输入:', searched)
  await wait(6000)
  console.log('搜索结果数:', await ev(`document.querySelectorAll('[data-id], .listItem, [class*=songItem]').length`))
  const first = await ev(`(() => {
    const items = [...document.querySelectorAll('[data-id]')].filter(x => x.getAttribute('data-id'))
    return items.length ? items[0].getAttribute('data-id') : 'none'
  })()`)
  console.log('首个结果 id:', first)
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
