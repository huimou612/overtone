// 模拟泛音/洛雪的自定义源运行时，直接跑内置源脚本
const fs = require('node:fs')
const http = require('node:http')
const https = require('node:https')
const { URL } = require('node:url')

let handler = null
let inited = null

const request = (url, options = {}, callback) => {
  if (typeof options === 'function') { callback = options; options = {} }
  const target = new URL(url)
  const mod = target.protocol === 'https:' ? https : http
  const req = mod.request(url, {
    method: options.method || 'GET',
    headers: { 'User-Agent': 'lx-music', ...(options.headers || {}) },
    timeout: options.timeout || 15000,
  }, res => {
    const chunks = []
    res.on('data', c => chunks.push(c))
    res.on('end', () => {
      const buf = Buffer.concat(chunks)
      // 泛音/洛雪给脚本的 body 是**字符串**（不是 Buffer），这里保持一致
      const body = buf.toString('utf8')
      callback(null, { statusCode: res.statusCode, headers: res.headers, body, raw: buf }, body)
    })
  })
  req.on('error', err => callback(err, null, null))
  req.on('timeout', () => { req.destroy(new Error('timeout')) })
  if (options.body) req.write(options.body)
  req.end()
  return () => req.destroy()
}

globalThis.lx = {
  EVENT_NAMES: { request: 'request', inited: 'inited', updateAlert: 'updateAlert' },
  request,
  on(name, fn) { if (name === 'request') handler = fn },
  send(name, data) { if (name === 'inited') inited = data },
  version: '2.0.0',
  env: 'desktop',
  currentScriptInfo: { name: '泛音聚合音源（内置）', version: '2.0.0' },
}

require('./_decoded_builtin.js')

setTimeout(async () => {
  console.log('== sources ==')
  console.log(JSON.stringify(inited && inited.sources ? Object.keys(inited.sources) : inited, null, 0).slice(0, 400))

  const cases = [
    { source: 'tx', id: '0039MnYb0qxYhV', name: '晴天', singer: '周杰伦', type: '320k' },
    { source: 'tx', id: '0039MnYb0qxYhV', name: '晴天', singer: '周杰伦', type: '128k' },
    { source: 'kw', id: '7253', name: '晴天', singer: '周杰伦', type: '320k' },
  ]
  for (const c of cases) {
    try {
      const url = await handler({
        source: c.source,
        action: 'musicUrl',
        info: { type: c.type, musicInfo: { songmid: c.id, hash: c.id, copyrightId: c.id, id: c.id, name: c.name, singer: c.singer, interval: '04:29' } },
      })
      console.log(`[OK] ${c.source}/${c.type} ->`, String(url).slice(0, 90))
    } catch (e) {
      console.log(`[FAIL] ${c.source}/${c.type} ->`, String(e).slice(0, 120))
    }
  }
  process.exit(0)
}, 800)
