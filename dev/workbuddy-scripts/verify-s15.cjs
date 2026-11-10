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

  // 打开统一歌词界面
  await ev(`(() => { const el = [...document.querySelectorAll('[aria-label]')].find(e => (e.getAttribute('aria-label')||'').startsWith('播放详情页')); el?.click(); return 1 })()`)
  await wait(1500)
  await ev(`(() => { const el = [...document.querySelectorAll('[aria-label="沉浸式歌词"]')].find(x => x.offsetParent); el?.click(); return 1 })()`)
  await wait(2200)

  // 1) 面板默认可见 + 结构
  const panel = await ev(`(() => {
    const p = document.querySelector('[data-immersive-panel=open]')
    if (!p) return JSON.stringify({ open: false })
    const poster = p.querySelector('img')
    const tabs = [...p.querySelectorAll('button')].map(b => b.getAttribute('aria-label') || b.textContent.trim()).slice(0, 8)
    return JSON.stringify({
      open: true,
      hasPoster: !!poster,
      posterSrc: poster?.getAttribute('src')?.slice(0, 40),
      tabs,
      sections: [...p.querySelectorAll('[data-panel-section]')].map(e => e.getAttribute('data-panel-section')),
      text: p.innerText.replace(/\\n/g, '|').slice(0, 90),
    })
  })()`)
  console.log('1 panel:', panel)

  // 2) 小卡片 vs 展开条
  const barState = () => ev(`(() => {
    const mini = document.querySelector('[data-view=lattice-stage] [class*=miniBar]')
    const full = document.querySelector('[data-view=lattice-stage] footer')
    const cs = e => e ? { op: getComputedStyle(e).opacity, pe: getComputedStyle(e).pointerEvents } : null
    return JSON.stringify({ mini: cs(mini), full: cs(full), miniText: mini?.innerText?.replace(/\\n/g,' ').slice(0, 30) || null })
  })()`)
  console.log('2 bar collapsed:', await barState())
  // 悬停小卡片 → 应展开
  const miniBox = JSON.parse(await ev(`(() => { const m = document.querySelector('[data-view=lattice-stage] [class*=miniBar]'); const r = m.getBoundingClientRect(); return JSON.stringify({x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2)}) })()`))
  await send('Input.dispatchMouseEvent', { type:'mouseMoved', x: miniBox.x, y: miniBox.y })
  await wait(700)
  console.log('2b bar hover:', await barState())
  const shot1 = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/folia-layout-hover.png', Buffer.from(shot1.data, 'base64'))
  // 移开
  await send('Input.dispatchMouseEvent', { type:'mouseMoved', x: 400, y: 200 })
  await wait(700)
  console.log('2c bar after leave:', await barState())
  const shot2 = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/folia-layout-idle.png', Buffer.from(shot2.data, 'base64'))
  console.log('screenshots saved')

  // 3) 歌词居中检查
  console.log('3 lyric align:', await ev(`(() => { const c = document.querySelector('[data-view=lattice-stage] [class*=lyricColumn]'); return c ? getComputedStyle(c).alignItems + '/' + getComputedStyle(c).textAlign : 'none' })()`))

  // 4) 时间轴偏移
  const beforeOffset = await ev(`document.querySelector('[data-view=lattice-stage] [class*=offsetValue]')?.textContent`)
  await ev(`(() => { const b = [...document.querySelectorAll('[data-view=lattice-stage] button')].filter(x => x.textContent.trim() === '▶')[0]; b?.click(); b?.click(); return 1 })()`)
  await wait(400)
  console.log('4 offset:', JSON.stringify({ before: beforeOffset, after: await ev(`document.querySelector('[data-view=lattice-stage] [class*=offsetValue]')?.textContent`) }))
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
