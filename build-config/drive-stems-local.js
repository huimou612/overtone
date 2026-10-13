/*
 * 无音源环境下的端到端验收：把**本地音频文件**变成「当前播放歌曲」，然后走完整条分离链路。
 *
 * 为什么需要这个脚本（而不是 drive-stems.js）：
 *   本机这个实例没有导入任何音源（`user_api.json` 是空的 `{}`），在线歌曲一律「换源失败」。
 *   而分离链路里最需要验的那一段（渲染层解码 → 写 mix.in → Python 推理 → 落盘）
 *   恰恰在「拿到音频之后」。本地音乐的 URL 走 `pathToFileURL`，不经过音源，所以只有它
 *   能在这种环境里把链路走通。
 *
 * 两件事让它不需要真的播放：
 *   1. 分离读的是 `playMusicInfo.musicInfo`（`currentSong()` 的来源），不是播放器的 musicInfo
 *   2. 本地音乐的 `getMusicUrl` 只做一次文件存在性检查就返回 `file://`，与播放无关
 *   于是「设好当前歌曲」就够，不会有声音打扰，也不占用音频设备。
 *
 * 歌词区是唯一需要「已经渲染」的东西 —— 分离的入口挂在歌词的右键菜单里。
 * 所以进对话框之前会确保播放详情展开、歌词容器在。
 *
 * 用法：node build-config/drive-stems-local.js <音频文件路径> [--run]
 */

const fs = require('fs')
const path = require('path')
const http = require('http')
const WebSocket = require('ws')

const PORT = 9222
const RUN = process.argv.includes('--run')
const args = process.argv.slice(2).filter(a => !a.startsWith('--'))
const audio = args[0]
const outDir = path.resolve(args[1] || 'notes/preview/stems')
const WIDTH = 1280
const HEIGHT = 860

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

async function waitForTarget(timeoutMs = 240000) {
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
    console.error('用法：node build-config/drive-stems-local.js <音频文件路径> [--run]')
    process.exit(1)
  }
  const target = await waitForTarget()
  console.log('调试目标：', target.title || '(无标题)')
  fs.mkdirSync(outDir, { recursive: true })

  const { consoleErrors } = await cdp(target.webSocketDebuggerUrl, async (send) => {
    await send('Page.enable')
    await send('Runtime.enable')
    await send('Emulation.setDeviceMetricsOverride', {
      width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: false,
    })

    const ev = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
      return r.result?.value
    }
    const shot = async (name) => {
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      const file = path.join(outDir, name)
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'))
      console.log('  →', name, fs.statSync(file).size, 'B')
    }
    const clickText = async (text, tag = 'button') => ev(`(() => {
      const TARGET = ${JSON.stringify(text)}
      const hit = Array.from(document.querySelectorAll(${JSON.stringify(tag)}))
        .find(n => n.offsetParent && n.textContent.trim() === TARGET)
      if (!hit) return 'not-found'
      const r = hit.getBoundingClientRect()
      const opts = { bubbles: true, cancelable: true, clientX: r.x + r.width/2, clientY: r.y + r.height/2, view: window }
      hit.dispatchEvent(new MouseEvent('mousedown', opts))
      hit.dispatchEvent(new MouseEvent('mouseup', opts))
      hit.dispatchEvent(new MouseEvent('click', opts))
      return 'clicked'
    })()`)

    // 对话框正文。textContent 而不是 innerText —— 后者每次读都强制重排。
    const modalBody = `(() => {
      const root = document.querySelector('#root') || document.body
      const h2 = Array.from(root.querySelectorAll('h2')).find(n => n.offsetParent && n.textContent.trim() === '音源分离')
      return h2 ? h2.parentElement.textContent.replace(/\\s{2,}/g, ' | ').trim() : ''
    })()`

    console.log('\n[1/5] 把本地音频设为当前播放歌曲')
    const set = await ev(`(async () => {
      const FILE = ${JSON.stringify(audio)}
      try {
        const infos = await window.lx.worker.main.createLocalMusicInfos([FILE])
        if (!infos || !infos.length) return { ok: false, reason: 'createLocalMusicInfos 返回空' }
        const info = infos[0]
        window.lxData.playMusicInfo.musicInfo = info
        window.lxData.playMusicInfo.listId = null
        window.lxData.playMusicInfo.isTempPlay = true
        return { ok: true, name: info.name, singer: info.singer, source: info.source,
                 interval: info.interval, filePath: info.meta && info.meta.filePath }
      } catch (e) { return { ok: false, reason: String((e && e.message) || e) } }
    })()`)
    console.log('  ', JSON.stringify(set))
    if (!set?.ok) throw new Error('设置当前歌曲失败：' + set?.reason)

    // 回列表页再进播放详情：歌词区的右键菜单是分离的唯一入口，它得先渲染出来
    console.log('\n[2/5] 展开播放详情，确保歌词容器在')
    await ev("location.hash = '#/list'")
    await sleep(2000)

    const findLyricEl = `(() => {
      const cands = Array.from(document.querySelectorAll('div')).filter(n => {
        if (!n.offsetParent) return false
        const cls = String(n.className)
        if (!/lyric/i.test(cls)) return false
        if (/menu|setting|select|btn|progress|switch|font|offset|icon|scroll/i.test(cls)) return false
        return n.getBoundingClientRect().height > 40
      })
      return cands.length ? cands[cands.length - 1] : null
    })()`

    let hasLyric = false
    for (let i = 0; i < 10; i += 1) {
      hasLyric = await ev(`(() => { const el = ${findLyricEl}; return !!el })()`)
      if (hasLyric) break
      if (i === 0) {
        await ev(`(() => {
          const pic = Array.from(document.querySelectorAll('img,[class*=cover],[class*=pic]'))
            .filter(n => n.offsetParent && n.getBoundingClientRect().width > 20)
          if (!pic.length) return 'no-cover'
          const el = pic[0]
          const r = el.getBoundingClientRect()
          const opts = { bubbles: true, cancelable: true, clientX: r.x + r.width/2, clientY: r.y + r.height/2, view: window }
          el.dispatchEvent(new MouseEvent('mousedown', opts))
          el.dispatchEvent(new MouseEvent('mouseup', opts))
          el.dispatchEvent(new MouseEvent('click', opts))
          return 'clicked-cover'
        })()`)
      }
      await sleep(1200)
    }
    console.log('  歌词容器在：', hasLyric)
    if (!hasLyric) throw new Error('找不到歌词容器，右键入口不可用')

    // 上一轮如果没关掉对话框，`modelValue` 会一直是 true：watch 不触发、reset() 不执行，
    // 于是这里读到的会是上一首的歌名与上一次的错误，看上去像「设置当前歌曲没生效」。
    // 先确保它是关着的，让这次打开是一次真正的 false → true。
    const closed = await clickText('关闭')
    if (closed === 'clicked') {
      console.log('  关闭了残留的对话框，等它收起')
      await sleep(1000)
    }

    console.log('\n[3/5] 右键歌词 → 点「音源分离…」')
    await ev(`(() => {
      const el = ${findLyricEl}
      if (!el) return
      const r = el.getBoundingClientRect()
      el.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true, cancelable: true,
        clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, view: window,
      }))
    })()`)
    await sleep(1000)

    let clicked = 'not-found'
    for (let i = 0; i < 12; i += 1) {
      clicked = await clickText('音源分离…')
      if (clicked === 'clicked') break
      await sleep(400)
    }
    console.log('  ', clicked)
    if (clicked !== 'clicked') throw new Error('点不到「音源分离…」')

    console.log('\n[4/5] 对话框状态')
    let body = ''
    for (let i = 0; i < 40; i += 1) {
      body = await ev(modalBody)
      if (body && body.includes('分离')) break
      await sleep(500)
    }
    console.log('  正文：\n    ' + String(body || '(为空)').slice(0, 700))
    await shot('11-local-modal.png')

    if (!RUN) {
      console.log('\n（未带 --run，跳过实际分离）')
      return
    }

    console.log('\n[5/5] 开始分离')
    const startedAt = Date.now()
    const click = await clickText('开始分离')
    console.log('  ', click)
    if (click !== 'clicked') throw new Error('找不到「开始分离」按钮')

    let last = ''
    let sawProgress = false
    for (let i = 0; i < 420; i += 1) {
      await sleep(2000)
      const text = await ev(modalBody)
      if (text !== last) {
        last = text
        if (/正在|加载|分离|解码/.test(text)) sawProgress = true
        console.log(`  [${((Date.now() - startedAt) / 1000).toFixed(0)}s] ` + String(text || '').slice(0, 260))
      }
      if (text.includes('已导出两个文件')) break
      if (/失败|不完整|拿不到|还没下载|解不开|错误/.test(text)) break
    }
    await shot('12-local-result.png')
    console.log('  最终正文：\n    ' + String(last || '(为空)').slice(0, 700))
    console.log('  看到过进度文案：', sawProgress)
    console.log('  总耗时：', ((Date.now() - startedAt) / 1000).toFixed(1) + 's')
  })

  console.log('\n渲染进程日志（error/异常）：', consoleErrors.length ? '' : '无')
  consoleErrors.slice(0, 20).forEach(l => console.log('  !', l))
})().catch(err => {
  console.error('失败：', err.message)
  process.exit(1)
})
