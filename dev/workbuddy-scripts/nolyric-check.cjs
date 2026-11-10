#!/usr/bin/env node
// 阶段四任务 2：遍历默认列表探测无歌词歌曲（真实播放驱动歌词加载，只读观察）。
'use strict'
const http = require('node:http')
const wait = ms => new Promise(r => setTimeout(r, ms))

const get = () => new Promise(r => http.get('http://127.0.0.1:9224/json', res => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>r(JSON.parse(b))) }))
let mid = 0
async function connect(filter) {
  const t = (await get()).find(filter)
  if (!t) throw new Error('target not found')
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  await new Promise(r => ws.addEventListener('open', r, { once: true }))
  return { ws, ev: expr => new Promise(resolve => {
    const id = ++mid
    const h = raw => { let m; try { m = JSON.parse(raw.data) } catch { return }
      if (m.id === id) { ws.removeEventListener('message', h); resolve(m.result?.result?.value) } }
    ws.addEventListener('message', h)
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, userGesture: true } }))
  }) }
}
const MAIN = t => t.type === 'page' && String(t.url).includes('index.html') && !String(t.url).includes('/folia/')

;(async () => {
  await wait(14000)
  const c = await connect(MAIN)
  const count = await c.ev(`document.querySelectorAll('.list-item button[aria-label="播放"]').length`)
  console.log('songs:', count)
  for (let i = 0; i < count; i++) {
    await c.ev(`document.querySelectorAll('.list-item button[aria-label="播放"]')[${i}].click()`)
    await wait(6500)
    const info = await c.ev(`(() => {
      const un = v => (v && v.__v_isRef) ? v.value : v
      const mi = un(window.lxData?.musicInfo) || {}
      return { i: ${i}, name: mi.name || '(空)', singer: mi.singer || '(空)', hasLrc: !!mi.lrc, hasLxlrc: !!mi.lxlrc, hasTlrc: !!mi.tlrc }
    })()`)
    console.log(JSON.stringify(info))
  }
})()
