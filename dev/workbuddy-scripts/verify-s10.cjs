const http = require('node:http')
const fs = require('node:fs')
const get = () => new Promise(r => http.get('http://127.0.0.1:9224/json', res => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>r(JSON.parse(b))) }))
const wait = ms => new Promise(r => setTimeout(r, ms))
const MAIN = t => t.type==='page' && String(t.url).includes('index.html') && !String(t.url).includes('/folia/')
;(async () => {
  const targets0 = (await get()).filter(t => t.type === 'page').length
  const t = (await get()).find(MAIN)
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  await new Promise(r => ws.addEventListener('open', r, {once:true}))
  const logs = []
  ws.addEventListener('message', raw => { let m; try { m = JSON.parse(raw.data) } catch { return }
    if (m.method === 'Runtime.consoleAPICalled' && ['error'].includes(m.params.type))
      logs.push((m.params.args||[]).map(a=>a.value ?? a.description ?? '').join(' ').slice(0, 140))
    if (m.method === 'Runtime.exceptionThrown')
      logs.push('EXC: ' + (m.params.exceptionDetails.exception?.description || '').slice(0, 160)) })
  let mid = 0
  const send = (method, params={}) => new Promise(res => {
    const id = ++mid
    const h = raw => { let m; try { m = JSON.parse(raw.data) } catch { return }
      if (m.id === id) { ws.removeEventListener('message', h); res(m.result) } }
    ws.addEventListener('message', h)
    ws.send(JSON.stringify({id, method, params}))
  })
  const ev = expr => send('Runtime.evaluate', {expression:expr, returnByValue:true, awaitPromise:true}).then(r => r.result?.value)

  // 1) 开墙
  await ev(`document.querySelector('a[aria-label="封面墙"]')?.click()`)
  await wait(2000)
  console.log('wall open:', await ev(`!!document.querySelector('[data-view=song-wall]')`))
  // 2) 点 Lattice
  await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('Lattice')); if (b) b.click(); return !!b })()`)
  await wait(2500)
  const state = await ev(`(() => {
    const stage = document.querySelector('[data-view=lattice-stage]')
    return JSON.stringify({
      stageOpen: !!stage,
      stageParent: stage ? (stage.parentElement === document.body ? 'BODY' : 'other') : null,
      hasBackBtn: !!stage?.querySelector('button'),
      lyricLines: stage ? stage.querySelectorAll('[data-state]').length : 0,
      hasBar: !!stage?.querySelector('footer'),
      activeText: stage?.querySelector('[data-state=active]')?.innerText?.replace(/\\n/g, ' ').slice(0, 60) || null,
      title: stage?.querySelector('header strong')?.textContent || null,
    })
  })()`)
  console.log('stage:', state)
  const targets1 = (await get()).filter(t => t.type === 'page').length
  console.log('page targets before/after (no new window expected):', targets0, '->', targets1)
  // 3) 播放推进：采样两次 active 行
  const s1 = await ev(`document.querySelector('[data-view=lattice-stage] [data-state=active]')?.innerText?.replace(/\\n/g,' ') || ''`)
  await wait(5000)
  const s2 = await ev(`document.querySelector('[data-view=lattice-stage] [data-state=active]')?.innerText?.replace(/\\n/g,' ') || ''`)
  console.log('active line t1:', JSON.stringify(s1))
  console.log('active line t2:', JSON.stringify(s2))
  // 4) 截图
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/lattice-stage.png', Buffer.from(shot.data, 'base64'))
  console.log('screenshot saved')
  // 5) ESC 关闭舞台 → 回到墙
  await send('Input.dispatchKeyEvent', { type:'keyDown', key:'Escape', code:'Escape', windowsVirtualKeyCode:27 })
  await wait(1200)
  console.log('after ESC → stage closed:', await ev(`!document.querySelector('[data-view=lattice-stage]')`), '| wall still open:', await ev(`!!document.querySelector('[data-view=song-wall]')`))
  console.log('console errors:', logs.length ? JSON.stringify(logs.slice(0, 5)) : 'NONE')
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
