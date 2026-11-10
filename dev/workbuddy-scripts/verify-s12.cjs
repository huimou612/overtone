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
  const ev = expr => send('Runtime.evaluate', {expression:expr, returnByValue:true, awaitPromise:true}).then(r => r.result?.value)
  const click = async (x, y, count=1) => {
    await send('Input.dispatchMouseEvent', { type:'mouseMoved', x, y })
    for (let i = 1; i <= count; i++) {
      await send('Input.dispatchMouseEvent', { type:'mousePressed', x, y, button:'left', clickCount:i, buttons:1 })
      await send('Input.dispatchMouseEvent', { type:'mouseReleased', x, y, button:'left', clickCount:i })
      if (count > 1) await wait(60)
    }
  }

  // 1) 启动弹窗是否消失
  console.log('1 modal on startup:', await ev(`JSON.stringify({ modal: !!document.querySelector('.show-modal'), hasAudioTip: document.body.innerText.includes('音频输出设备为空') })`))

  // 开墙
  await ev(`document.querySelector('a[aria-label="封面墙"]')?.click()`)
  await wait(2000)

  // 2) 悬停：只有悬停那张放大，其余 opacity 保持 1
  const TILES = `[...document.querySelectorAll('[data-view=song-wall] div[role=button]')]`
  const tile0 = JSON.parse(await ev(`(() => { const r = ${TILES}[0].getBoundingClientRect(); return JSON.stringify({x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2)}) })()`))
  await send('Input.dispatchMouseEvent', { type:'mouseMoved', x: tile0.x, y: tile0.y })
  await wait(500)
  console.log('2 hover:', await ev(`(() => { const t = ${TILES}; return JSON.stringify({ hovered: getComputedStyle(t[0]).transform, others: t.slice(1,4).map(e => getComputedStyle(e).opacity) }) })()`))

  // 3) 单击 = 播放（读当前歌名变化）
  const before = await ev(`document.querySelector('[data-view=song-wall] header')?.innerText?.replace(/\\n/g,' ').slice(0, 40)`)
  const tile3 = JSON.parse(await ev(`(() => { const r = ${TILES}[3].getBoundingClientRect(); return JSON.stringify({x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2), name: ${TILES}[3].getAttribute('aria-label')}) })()`))
  await click(tile3.x, tile3.y, 1)
  await wait(1800)
  const afterSingle = await ev(`JSON.stringify({ stage: !!document.querySelector('[data-view=lattice-stage]'), playing: document.querySelector('[data-view=song-wall] header')?.innerText?.replace(/\\n/g,' ').slice(0, 40) })`)
  console.log('3 single click →', JSON.stringify({ target: tile3.name, before, afterSingle }))

  // 4) 双击 = 播放 + 进 Lattice
  const tile5 = JSON.parse(await ev(`(() => { const r = ${TILES}[5].getBoundingClientRect(); return JSON.stringify({x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2), name: ${TILES}[5].getAttribute('aria-label')}) })()`))
  await click(tile5.x, tile5.y, 2)
  await wait(2000)
  console.log('4 double click →', JSON.stringify({ target: tile5.name, stage: await ev(`!!document.querySelector('[data-view=lattice-stage]')`), title: await ev(`document.querySelector('[data-view=lattice-stage] header strong')?.textContent`) }))
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
