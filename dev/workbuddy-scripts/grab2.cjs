const http = require('node:http')
const fs = require('node:fs')
const wait = ms => new Promise(r => setTimeout(r, ms))
const json = path => new Promise(r => http.get('http://127.0.0.1:9224' + path, res => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>{ try { r(JSON.parse(b)) } catch { r(null) } }) }))

const VIDEO = 'file:///C:/Users/HP/AppData/Local/Packages/Microsoft.ScreenSketch_8wekyb3d8bbwe/TempState/Recordings/20261023-0132-01.6079705.mp4'
;(async () => {
  const ver = await json('/json/version')
  const ws = new WebSocket(ver.webSocketDebuggerUrl)
  await new Promise(r => ws.addEventListener('open', r, {once:true}))
  let mid = 0
  const pending = new Map()
  ws.addEventListener('message', e => {
    let m; try { m = JSON.parse(e.data) } catch { return }
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id) }
  })
  const send = (method, params = {}, sessionId) => new Promise(res => {
    const id = ++mid
    pending.set(id, res)
    ws.send(JSON.stringify({ id, method, params, sessionId }))
  })

  const t = await send('Target.createTarget', { url: VIDEO })
  console.log('target:', t && t.targetId ? 'ok' : JSON.stringify(t))
  await wait(2500)
  const a = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true })
  const sid = a.sessionId
  await send('Runtime.enable', {}, sid)
  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sid)
    return r && r.result ? r.result.value : r
  }
  console.log('video?', await ev(`!!document.querySelector('video')`))
  const dur = await ev(`(() => { const v = document.querySelector('video'); return v ? v.duration : -1 })()`)
  console.log('duration:', dur)
  if (!dur || dur <= 0) { process.exit(1) }
  const step = Math.max(1.2, dur / 20)
  for (let time = 0.3; time < dur; time += step) {
    await ev(`new Promise(r => { const v = document.querySelector('video'); v.pause(); v.onseeked = () => setTimeout(r, 200); v.currentTime = ${time.toFixed(1)} })`)
    const shot = await send('Page.captureScreenshot', { format: 'png' }, sid)
    if (shot && shot.data) fs.writeFileSync(`.git/acc/frames/t-${time.toFixed(1).replace('.', '_')}.png`, Buffer.from(shot.data, 'base64'))
  }
  console.log('done')
  await send('Target.closeTarget', { targetId: t.targetId })
  process.exit(0)
})().catch(e => { console.log('ERR', e.message); process.exit(1) })
