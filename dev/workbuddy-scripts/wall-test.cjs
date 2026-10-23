const http = require('node:http')
const get = () => new Promise(r => http.get('http://127.0.0.1:9224/json', res => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>r(JSON.parse(b))) }))
const wait = ms => new Promise(r => setTimeout(r, ms))
const MAIN = t => t.type==='page' && String(t.url).includes('index.html') && !String(t.url).includes('/folia/')
const FOLIA = t => t.type==='page' && String(t.url).includes('/folia/')
function conn(filter) {
  return get().then(ts => {
    const t = ts.find(filter)
    if (!t) throw new Error('target not found')
    const ws = new WebSocket(t.webSocketDebuggerUrl)
    let mid = 0
    const p = new Promise(r => ws.addEventListener('open', r, {once:true}))
    const send = (method, params={}) => new Promise(resolve => {
      const id = ++mid
      const h = raw => { let m; try { m = JSON.parse(raw.data) } catch { return }
        if (m.id === id) { ws.removeEventListener('message', h); resolve(m.result) } }
      ws.addEventListener('message', h)
      ws.send(JSON.stringify({id, method, params}))
    })
    const ev = expr => send('Runtime.evaluate', {expression:expr, returnByValue:true}).then(r => r.result?.value)
    return p.then(() => ({ send, ev }))
  })
}
const realClick = async (c, x, y) => {
  await c.send('Input.dispatchMouseEvent', { type:'mouseMoved', x, y })
  await c.send('Input.dispatchMouseEvent', { type:'mousePressed', x, y, button:'left', clickCount:1, buttons:1 })
  await c.send('Input.dispatchMouseEvent', { type:'mouseReleased', x, y, button:'left', clickCount:1 })
}
;(async () => {
  const m = await conn(MAIN)
  await m.ev(`document.querySelector('[aria-label="封面墙"]')?.click()`)
  await wait(1200)
  await m.ev(`[...document.querySelectorAll('button')].find(x => x.textContent.includes('Lattice'))?.click()`)
  await wait(3500)
  let f = (await get()).find(FOLIA)
  if (f) {
    const fc = await conn(FOLIA)
    const p = JSON.parse(await fc.ev(`(() => { const b = document.querySelector('button[aria-label=close]'); const r = b.getBoundingClientRect(); return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2}) })()`))
    await realClick(fc, p.x, p.y)
    await wait(2000)
  }
  console.log('step1 folia closed:', !(await get()).find(FOLIA))
  const m2 = await conn(MAIN)
  const pos = JSON.parse(await m2.ev(`(() => { const wall = document.querySelector('[data-view=song-wall]'); if (!wall) return '{"wall":false}'; const b = wall.querySelector('header button'); const r = b.getBoundingClientRect(); return JSON.stringify({wall:true,x:r.x+r.width/2,y:r.y+r.height/2}) })()`))
  console.log('step2 back btn:', JSON.stringify(pos))
  if (pos.wall) {
    await realClick(m2, pos.x, pos.y)
    await wait(1500)
    console.log('step3 wall gone:', await m2.ev(`!document.querySelector('[data-view=song-wall]')`))
  }
})().catch(e => console.log('ERR:', e.message))
