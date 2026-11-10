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
  const dbl = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type:'mouseMoved', x, y })
    for (let i = 1; i <= 2; i++) {
      await send('Input.dispatchMouseEvent', { type:'mousePressed', x, y, button:'left', clickCount:i, buttons:1 })
      await send('Input.dispatchMouseEvent', { type:'mouseReleased', x, y, button:'left', clickCount:i })
      await wait(60)
    }
  }
  await ev(`document.querySelector('a[aria-label="封面墙"]')?.click()`)
  await wait(2000)
  const p = JSON.parse(await ev(`(() => { const r = document.querySelectorAll('[data-view=song-wall] div[role=button]')[1].getBoundingClientRect(); return JSON.stringify({x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2)}) })()`))
  await dbl(p.x, p.y)
  await wait(2500)
  console.log('stage:', await ev(`!!document.querySelector('[data-view=lattice-stage]')`))
  if (!(await ev(`!!document.querySelector('[data-view=lattice-stage]')`))) process.exit(1)
  await ev(`window.app_event.setProgress(60); 1`)
  await wait(1500)

  // 1) 播放队列（Folia 风格）
  await ev(`(() => { const b = [...document.querySelectorAll('[data-view=lattice-stage] button')].find(x => x.getAttribute('aria-label') === '播放列表'); b?.click(); return 1 })()`)
  await wait(900)
  console.log('1 queue:', await ev(`(() => {
    const p = document.querySelector('[data-immersive-panel=open]')
    const rows = p ? [...p.querySelectorAll('button')].filter(b => b.className.split(' ').length >= 1 && b.querySelector('span')) : []
    return JSON.stringify({ text: p?.innerText.replace(/\\n/g,'|').slice(0, 90), rowCount: rows.length })
  })()`))
  const s1 = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/queue-list.png', Buffer.from(s1.data, 'base64'))

  // 2) 歌词/偏移只在音效页
  console.log('2 cover tab has offset?', await ev(`(() => {
    const p = document.querySelector('[data-immersive-panel=open]')
    return p ? p.innerText.includes('时间轴偏移') : null
  })()`))
  await ev(`(() => { const b = [...document.querySelectorAll('[data-view=lattice-stage] button')].find(x => x.getAttribute('aria-label') === '音效'); b?.click(); return 1 })()`)
  await wait(800)
  console.log('2b fx tab has offset?', await ev(`(() => { const p = document.querySelector('[data-immersive-panel=open]'); return p ? p.innerText.includes('时间轴偏移') : null })()`))

  // 3) 音效窗口
  await ev(`(() => { const b = [...document.querySelectorAll('[data-immersive-panel=open] button')].find(x => x.textContent.includes('音效设置')); b?.click(); return 1 })()`)
  await wait(1200)
  console.log('3 fx window:', await ev(`(() => {
    const m = document.querySelector('[role=dialog][aria-label="音效设置"]')
    return JSON.stringify({ open: !!m, cards: m ? [...m.querySelectorAll('h3')].map(h => h.textContent) : [] })
  })()`))
  const s2 = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/fx-window.png', Buffer.from(s2.data, 'base64'))
  await ev(`(() => { const m = document.querySelector('[role=dialog][aria-label="音效设置"]'); const b = [...m.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === '关闭'); b?.click(); return 1 })()`)
  await wait(600)

  // 4) 关闭面板 → 悬浮按钮 → 重新打开
  await ev(`(() => { const b = [...document.querySelectorAll('[data-immersive-panel=open] button')].find(x => x.textContent.trim() === '✕'); b?.click(); return 1 })()`)
  await wait(700)
  const fab = await ev(`(() => {
    const b = [...document.querySelectorAll('[data-view=lattice-stage] button')].find(x => x.getAttribute('aria-label') === '沉浸式设置面板')
    if (!b) return JSON.stringify({ fab: false })
    const r = b.getBoundingClientRect()
    return JSON.stringify({ fab: true, x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) })
  })()`)
  console.log('4 fab:', fab)
  const fb = JSON.parse(fab)
  if (fb.fab) {
    await send('Input.dispatchMouseEvent', { type:'mousePressed', x: fb.x, y: fb.y, button:'left', clickCount:1, buttons:1 })
    await send('Input.dispatchMouseEvent', { type:'mouseReleased', x: fb.x, y: fb.y, button:'left', clickCount:1 })
    await wait(800)
    console.log('4b reopened:', await ev(`!!document.querySelector('[data-immersive-panel=open]')`))
  }
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
