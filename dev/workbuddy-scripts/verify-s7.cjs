const http = require('node:http')
const get = () => new Promise(r => http.get('http://127.0.0.1:9224/json', res => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>r(JSON.parse(b))) }))
const wait = ms => new Promise(r => setTimeout(r, ms))
const MAIN = t => t.type==='page' && String(t.url).includes('index.html') && !String(t.url).includes('/folia/')
async function conn(filter) {
  const t = (await get()).find(filter)
  if (!t) throw new Error('no target')
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  await new Promise(r => ws.addEventListener('open', r, {once:true}))
  let mid = 0
  const send = (method, params={}) => new Promise(resolve => {
    const id = ++mid
    const h = raw => { let m; try { m = JSON.parse(raw.data) } catch { return }
      if (m.id === id) { ws.removeEventListener('message', h); resolve(m.result) } }
    ws.addEventListener('message', h)
    ws.send(JSON.stringify({id, method, params}))
  })
  const ev = expr => send('Runtime.evaluate', {expression:expr, returnByValue:true}).then(r => r.result?.value)
  return { send, ev }
}
;(async () => {
  const m = await conn(MAIN)
  // 进我的列表
  await m.ev(`location.hash = '#/list'; 1`)
  await wait(2500)
  const probe = await m.ev(`JSON.stringify({
    listWallBtn: [...document.querySelectorAll('button')].filter(b => b.getAttribute('aria-label') === '封面墙' && b.closest('#my-list')).length,
    sidebarWall: !!document.querySelector('a[aria-label="封面墙"]'),
  })`)
  console.log('1 list button removed:', probe)
  // 侧栏入口仍能开墙
  await m.ev(`document.querySelector('a[aria-label="封面墙"]')?.click()`)
  await wait(2500)
  console.log('2 sidebar opens wall:', await m.ev(`!!document.querySelector('[data-view=song-wall]')`))
})().catch(e => console.log('ERR:', e.message))
