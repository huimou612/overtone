/*
 * 摸清「渲染层能不能被驱动」——为无音源环境下的端到端验收铺路。
 *
 * 背景：本机这个实例没导入任何音源（user_api.json 是空的），在线歌曲一律「换源失败」，
 * 所以分离链路的真实验收只能喂本地文件。而本地音乐的 URL 走 pathToFileURL，
 * 不需要音源 —— 但需要一个「让这首歌成为当前播放歌曲」的手段。
 *
 * 这个脚本只读取与试探，不做任何破坏性操作：
 *   1. window.lxData 上挂了哪些东西（playMusicInfo 就在上面，这是关键）
 *   2. createLocalMusicInfos 能不能直接调（绕过原生文件对话框）
 *   3. 设置 playMusicInfo 之后，播放器的歌词状态跟不跟得上
 *   4. 播放栏的按钮长什么样（后面要「点一下播放」才可能加载歌词）
 *
 * 用法：node build-config/probe-lx-runtime.js <音频文件路径>
 */

const fs = require('fs')
const path = require('path')
const http = require('http')
const WebSocket = require('ws')

const PORT = 9222
const audio = process.argv[2]

const sleep = ms => new Promise(r => setTimeout(r, ms))

function listTargets() {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/json', timeout: 3000 }, res => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', c => { body += c })
      res.on('end', () => { try { resolve(JSON.parse(body)) } catch (e) { reject(e) } })
    })
    req.on('timeout', () => { req.destroy(new Error('timeout')) })
    req.on('error', reject)
  })
}

async function waitForTarget(timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs
  let last = ''
  while (Date.now() < deadline) {
    try {
      const pages = (await listTargets()).filter(t => t.type === 'page' && /^https?:\/\//.test(t.url))
      if (pages.length) return pages.find(t => !/lyric/i.test(t.url)) || pages[0]
      last = '还没有应用窗口'
    } catch (e) { last = e.message }
    await sleep(1500)
  }
  throw new Error('等待调试目标超时：' + last)
}

function cdp(wsUrl, fn) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 })
    let id = 0
    const pending = new Map()
    const consoleErrors = []
    const send = (method, params = {}) => new Promise((res, rej) => {
      const myId = ++id
      pending.set(myId, { res, rej, method })
      ws.send(JSON.stringify({ id: myId, method, params }))
    })
    ws.on('message', raw => {
      let msg
      try { msg = JSON.parse(raw) } catch { return }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        consoleErrors.push((msg.params.args || []).map(a => a.value ?? a.description ?? '').join(' '))
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        consoleErrors.push('EXCEPTION: ' + (msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || ''))
      }
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id)
        pending.delete(msg.id)
        msg.error ? p.rej(new Error(p.method + ': ' + JSON.stringify(msg.error))) : p.res(msg.result)
      }
    })
    ws.on('open', async () => {
      try {
        const result = await fn(send)
        try { ws.close() } catch {}
        resolve({ result, consoleErrors })
      } catch (e) {
        try { ws.close() } catch {}
        reject(e)
      }
    })
    ws.on('error', reject)
  })
}

;(async () => {
  if (!audio || !fs.existsSync(audio)) {
    console.error('用法：node build-config/probe-lx-runtime.js <音频文件路径>')
    process.exit(1)
  }
  const target = await waitForTarget()
  console.log('调试目标：', target.title || '(无标题)')

  const { consoleErrors } = await cdp(target.webSocketDebuggerUrl, async (send) => {
    await send('Page.enable')
    await send('Runtime.enable')

    const ev = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
      return r.result?.value
    }

    console.log('\n[1] window.lxData 上挂了什么')
    console.log(JSON.stringify(await ev(`(() => {
      const d = window.lxData
      if (!d) return '(没有 window.lxData)'
      return Object.keys(d).map(k => k + ':' + (Array.isArray(d[k]) ? 'array[' + d[k].length + ']' : typeof d[k]))
    })()`), null, 0))

    console.log('\n[2] worker.main 有没有 createLocalMusicInfos')
    console.log(JSON.stringify(await ev(`(() => {
      const m = window.lx && window.lx.worker && window.lx.worker.main
      if (!m) return '(没有 window.lx.worker.main)'
      const keys = Object.keys(m)
      return {
        hasCreate: typeof m.createLocalMusicInfos === 'function',
        total: keys.length,
        sample: keys.filter(k => /local|create|music|list/i.test(k)).slice(0, 20),
      }
    })()`), null, 0))

    console.log('\n[3] 造一个本地歌曲信息并设为当前播放歌曲')
    const set = await ev(`(async () => {
      const FILE = ${JSON.stringify(audio)}
      try {
        const infos = await window.lx.worker.main.createLocalMusicInfos([FILE])
        if (!infos || !infos.length) return { ok: false, reason: 'createLocalMusicInfos 返回空' }
        const info = infos[0]
        window.lxData.tempPlayList.length = 0
        window.lxData.tempPlayList.push(info)
        window.lxData.playMusicInfo.musicInfo = info
        window.lxData.playMusicInfo.listId = null
        window.lxData.playMusicInfo.isTempPlay = true
        return {
          ok: true,
          name: info.name, singer: info.singer, source: info.source, interval: info.interval,
          filePath: info.meta && info.meta.filePath, ext: info.meta && info.meta.ext,
        }
      } catch (e) { return { ok: false, reason: String(e && e.message || e) } }
    })()`)
    console.log(JSON.stringify(set, null, 0))

    await sleep(2000)

    console.log('\n[4] 播放器状态（歌词加载了没）')
    console.log(JSON.stringify(await ev(`(() => {
      const m = window.lxData.musicInfo || {}
      return {
        id: m.id, name: m.name, singer: m.singer,
        hasLrc: !!m.lrc, lrcLen: (m.lrc || '').length,
        hasLxlrc: !!m.lxlrc, hasRaw: !!m.rawlrc,
        isPlay: window.lxData.isPlay && window.lxData.isPlay.value,
        playIndex: window.lxData.playInfo && window.lxData.playInfo.playIndex,
        playerListId: window.lxData.playInfo && window.lxData.playInfo.playerListId,
        status: window.lxData.status && window.lxData.status.value,
      }
    })()`), null, 0))

    console.log('\n[5] 播放栏按钮（class / title），后面要靠它点播放')
    console.log(JSON.stringify(await ev(`(() => {
      const out = []
      const nodes = Array.from(document.querySelectorAll('button, [class*=btn], [title]'))
      for (const n of nodes) {
        if (!n.offsetParent) continue
        const r = n.getBoundingClientRect()
        if (r.top < window.innerHeight - 130) continue   // 只看底部那条播放栏
        out.push({
          tag: n.tagName.toLowerCase(),
          cls: String(n.className).slice(0, 90),
          title: n.getAttribute('title') || '',
          text: (n.textContent || '').trim().slice(0, 20),
          x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2),
        })
      }
      return out.slice(0, 40)
    })()`), null, 0))
  })

  console.log('\n渲染进程日志（error/异常）：', consoleErrors.length ? '' : '无')
  consoleErrors.slice(0, 15).forEach(l => console.log('  !', l))
})().catch(err => {
  console.error('失败：', err.message)
  process.exit(1)
})
