const http = require('node:http')
const get = () => new Promise(r => http.get('http://127.0.0.1:9224/json', res => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>r(JSON.parse(b))) }))
const wait = ms => new Promise(r => setTimeout(r, ms))
const MAIN = t => t.type==='page' && String(t.url).includes('index.html') && !String(t.url).includes('/folia/')
const FOLIA = t => t.type==='page' && String(t.url).includes('/folia/')
async function conn(filter) {
  const ts = await get()
  const t = ts.find(filter)
  if (!t) throw new Error('target not found: ' + filter)
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
const realClick = async (c, x, y) => {
  await c.send('Input.dispatchMouseEvent', { type:'mouseMoved', x, y })
  await c.send('Input.dispatchMouseEvent', { type:'mousePressed', x, y, button:'left', clickCount:1, buttons:1 })
  await c.send('Input.dispatchMouseEvent', { type:'mouseReleased', x, y, button:'left', clickCount:1 })
}
;(async () => {
  const m = await conn(MAIN)
  // 1) 侧栏有封面墙入口（图标 wall、无工作台）
  const nav = await m.ev(`JSON.stringify({
    wallEntry: !!document.querySelector('a[aria-label="封面墙"], a[title="封面墙"]'),
    workbench: !!document.querySelector('a[aria-label*="工作台"], a[title*="工作台"]'),
    navTexts: [...document.querySelectorAll('[class*=link] span')].length,
  })`)
  console.log('1 sidebar:', nav)
  // 2) 点击侧栏封面墙入口 → 墙应打开
  await m.ev(`document.querySelector('a[aria-label="封面墙"], a[title="封面墙"]')?.click()`)
  await wait(2500)
  const wallOpen = await m.ev(`!!document.querySelector('[data-view=song-wall]')`)
  console.log('2 wall via sidebar:', wallOpen)
  // 3) 墙内真实点击返回按钮
  const bp = JSON.parse(await m.ev(`(() => { const wall = document.querySelector('[data-view=song-wall]'); if (!wall) return '{"wall":false}'; const b = wall.querySelector('header button'); const r = b.getBoundingClientRect(); return JSON.stringify({wall:true, x:r.x+r.width/2, y:r.y+r.height/2}) })()`))
  if (bp.wall) {
    await realClick(m, bp.x, bp.y)
    await wait(1500)
    console.log('3 wall closed by back:', await m.ev(`!document.querySelector('[data-view=song-wall]')`))
  }
  // 4) 再开墙 → Lattice → 翻转卡片可见（1.5s 内截图）
  await m.ev(`document.querySelector('a[aria-label="封面墙"], a[title="封面墙"]')?.click()`)
  await wait(1500)
  await m.ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('Lattice')); b?.click(); return 1 })()`)
  await wait(1400)
  const f = (await get()).find(FOLIA)
  if (!f) { console.log('4 folia not open'); return }
  const fc = await conn(FOLIA)
  const flip = await fc.ev(`(() => { const c = document.querySelector('.folia-flip-card'); return JSON.stringify({ flipVisible: !!c, img: !!c?.querySelector('img') }) })()`)
  console.log('4 flip card:', flip)
  // 截图翻转卡片
  const shot = await fc.send('Page.captureScreenshot', { format: 'png' })
  require('node:fs').writeFileSync('notes/preview/folia-acceptance/folia-flipcard.png', Buffer.from(shot.data, 'base64'))
  console.log('4 screenshot saved')
  // 等卡片翻出后歌词区在
  await wait(2200)
  console.log('5 lyrics after flip:', await fc.ev(`!!document.querySelector('.lattice-lyrics')`))
})().catch(e => console.log('ERR:', e.message))
