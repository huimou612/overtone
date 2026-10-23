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

  console.log('当前歌曲:', await ev(`window.lxData.musicInfo.name + ' - ' + window.lxData.musicInfo.singer`))
  // 点播放
  const clicked = await ev(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => ['播放','暂停'].includes(x.getAttribute('aria-label')))
    if (!b) return 'no-btn'
    b.click(); return b.getAttribute('aria-label')
  })()`)
  console.log('点击按钮:', clicked)
  for (const s of [3, 6, 9]) {
    await wait(3000)
    const st = await ev(`(() => {
      const a = document.querySelector('audio')
      return JSON.stringify({
        isPlay: window.lxData.status.isPlay,
        cur: a ? Math.round(a.currentTime * 10) / 10 : null,
        dur: a ? Math.round(a.duration) : null,
        src: a && a.src ? a.src.slice(0, 60) : null,
        err: a && a.error ? a.error.code : null,
      })
    })()`)
    console.log(`t+${s}s:`, st)
  }
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('notes/preview/folia-acceptance/builtin-play.png', Buffer.from(shot.data, 'base64'))
  process.exit(0)
})().catch(e => { console.log('ERR:', e.message); process.exit(1) })
