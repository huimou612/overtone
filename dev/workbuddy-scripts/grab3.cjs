const http = require('node:http')
const fs = require('node:fs')
const wait = ms => new Promise(r => setTimeout(r, ms))
const get = () => new Promise(r => http.get('http://127.0.0.1:9224/json', res => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>r(JSON.parse(b))) }))
const MAIN = t => t.type==='page' && String(t.url).includes('index.html') && !String(t.url).includes('/folia/')
;(async () => {
  const t = (await get()).find(MAIN)
  console.log('page url:', String(t.url).slice(0, 80))
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

  // 在页面里建隐藏 video + canvas，按时间抽帧
  const res = await ev(`(async () => {
    const src = 'file:///C:/Users/HP/AppData/Local/Packages/Microsoft.ScreenSketch_8wekyb3d8bbwe/TempState/Recordings/20261023-0132-01.6079705.mp4'
    const v = document.createElement('video')
    v.src = src; v.muted = true; v.style.cssText = 'position:fixed;left:-9999px;top:0;width:1280px'
    document.body.appendChild(v)
    await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('video error')) })
    const dur = v.duration
    const c = document.createElement('canvas')
    c.width = v.videoWidth; c.height = v.videoHeight
    const ctx = c.getContext('2d')
    const out = []
    const step = Math.max(1.2, dur / 18)
    for (let t = 0.3; t < dur; t += step) {
      await new Promise(r => { v.onseeked = () => setTimeout(r, 120); v.currentTime = t })
      ctx.drawImage(v, 0, 0, c.width, c.height)
      out.push({ t: Math.round(t * 10) / 10, data: c.toDataURL('image/jpeg', 0.72) })
    }
    v.remove()
    return JSON.stringify({ dur, w: c.width, h: c.height, frames: out })
  })()`)
  if (!res) { console.log('no result'); process.exit(1) }
  const data = JSON.parse(res)
  console.log('duration:', data.dur, '| size:', data.w + 'x' + data.h, '| frames:', data.frames.length)
  for (const f of data.frames) {
    const b64 = f.data.split(',')[1]
    fs.writeFileSync(`.git/acc/frames/v-${String(f.t).replace('.', '_')}.jpg`, Buffer.from(b64, 'base64'))
  }
  process.exit(0)
})().catch(e => { console.log('ERR', e.message); process.exit(1) })
