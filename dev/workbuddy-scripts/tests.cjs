#!/usr/bin/env node
// 阶段二安装版受控验收：真实运行测试驱动。
// 用法：node .git/acc/tests.cjs <cmd> [args]
'use strict'
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const PORT = 9224
const SHOT_DIR = path.join(__dirname, '..', '..', 'notes', 'preview', 'folia-acceptance')
const wait = ms => new Promise(r => setTimeout(r, ms))

const getTargets = () => new Promise((resolve, reject) => {
  http.get(`http://127.0.0.1:${PORT}/json`, res => {
    let b = ''; res.on('data', c => b += c)
    res.on('end', () => { try { resolve(JSON.parse(b)) } catch (e) { reject(e) } })
  }).on('error', reject)
})

let msgId = 0
const pending = new Map()
const consoleLogs = []

async function connect(filter) {
  const targets = await getTargets()
  const page = targets.find(filter)
  if (!page) throw new Error('target not found: ' + targets.map(t => `${t.type}|${String(t.url).slice(0, 50)}`).join(' /// '))
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })
  ws.addEventListener('message', raw => {
    let msg; try { msg = JSON.parse(String(raw.data)) } catch { return }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id)
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
    } else if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
      const text = (msg.params.args || []).map(a => a.value ?? a.description ?? '').join(' ')
      consoleLogs.push(`[${msg.params.type}] ${text.slice(0, 200)}`)
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails
      consoleLogs.push(`[EXCEPTION] ${(d.exception?.description || d.text || '').slice(0, 200)}`)
    }
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++msgId
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
  await send('Runtime.enable')
  return { ws, send, page }
}

async function evaluate(send, expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
  return r.result.value
}

const MAIN = t => t.type === 'page' && String(t.url).includes('index.html') && !String(t.url).includes('/folia/')
const FOLIA = t => t.type === 'page' && String(t.url).includes('/folia/')

const logResult = (label, val) => console.log(label, JSON.stringify(val))
const flushConsole = () => {
  if (consoleLogs.length) { console.log('console:', JSON.stringify(consoleLogs.slice(-12), null, 0)); consoleLogs.length = 0 }
}

const cmds = {
  // 主窗口状态总览
  async status() {
    const { send } = await connect(MAIN)
    const out = await evaluate(send, `(() => {
      const mi = window.lxData?.musicInfo || {}
      const st = window.lxData?.status || {}
      return {
        song: mi.name ? (mi.name + ' / ' + mi.singer) : null,
        status: st.status, progress: st.progress, duration: st.maxPlayTime,
        lists: (window.lxData?.userLists || []).map(l => l.name + ':' + (l.sourceListId ?? l.id)),
        playBtns: document.querySelectorAll('button[aria-label="播放"]').length,
        pauseBtns: document.querySelectorAll('button[aria-label="暂停"]').length,
        latticeBtn: !!document.querySelector('[title*="Folia"]'),
        playerBtns: [...document.querySelectorAll('[aria-label]')].map(e => e.getAttribute('aria-label')).filter(l => /播放|暂停/.test(l)),
      }
    })()`)
    logResult('status:', out); flushConsole()
  },

  // 打开封面墙视图（找 latticeBtn 所需的入口）
  async gotoWall() {
    const { send } = await connect(MAIN)
    const out = await evaluate(send, `(() => {
      // 找封面墙/网格切换按钮：列表视图工具栏里通常有显示模式切换
      const cands = [...document.querySelectorAll('button[title], button[aria-label]')]
        .map(b => ({ t: b.title || b.getAttribute('aria-label'), cls: b.className }))
        .filter(x => /墙|wall|封面|网格|grid|块/i.test(x.t))
      return cands.slice(0, 10)
    })()`)
    logResult('wall-toggle-candidates:', out)
  },

  // 直接点 latticeBtn（若当前视图可见）
  async foliaOpen() {
    const { send } = await connect(MAIN)
    const clicked = await evaluate(send, `(() => {
      const b = document.querySelector('[title*="Folia"]') || document.querySelector('[aria-label*="Folia"]')
      if (!b) return { ok: false, hint: 'latticeBtn not in DOM' }
      b.click()
      return { ok: true }
    })()`)
    logResult('click:', clicked)
    await wait(2500)
    const targets = await getTargets()
    console.log('folia target:', JSON.stringify(targets.filter(FOLIA).map(t => t.url.slice(0, 80))))
    flushConsole()
  },

  // 读取 Folia 窗口状态
  async foliaState() {
    const { send } = await connect(FOLIA)
    const out = await evaluate(send, `(() => {
      const close = document.querySelector('button[aria-label="close"]')
      const sr = document.querySelector('.sr-only')
      const canvas = document.querySelector('.lattice-lyrics-canvas')
      const meta = document.querySelector('.lattice-poster-copy')
      const empty = [...document.querySelectorAll('div')].map(d => d.textContent).find(t => /暂无歌词|歌词解析失败|已暂停|播放中|已停止/.test(t || ''))
      return {
        url: location.href.slice(0, 60),
        closeBtn: !!close,
        title: meta?.querySelector('strong')?.textContent || null,
        artist: meta?.querySelector('small')?.textContent || null,
        canvasReady: canvas ? canvas.className.includes('is-ready') : null,
        srLine: sr?.textContent || null,
        emptyText: empty ? empty.slice(0, 60) : null,
        rootChildren: document.getElementById('root')?.children.length ?? 0,
      }
    })()`)
    logResult('foliaState:', out); flushConsole()
  },

  // 关闭 Folia 窗口（页面内按钮）
  async foliaClose() {
    const { send } = await connect(FOLIA)
    await evaluate(send, `document.querySelector('button[aria-label="close"]')?.click(); 'clicked'`)
    await wait(1500)
    const targets = await getTargets()
    console.log('folia targets after close:', JSON.stringify(targets.filter(FOLIA).length))
  },

  // 播放第 N 首（0 起）
  async play(n = 0) {
    const { send } = await connect(MAIN)
    const out = await evaluate(send, `(() => {
      const btns = [...document.querySelectorAll('.list-item button[aria-label="播放"]')]
      const b = btns[${Number(n)}]
      if (!b) return { ok: false, count: btns.length }
      b.click()
      return { ok: true, count: btns.length }
    })()`)
    logResult('play:', out); flushConsole()
  },

  // 播放栏专用暂停/恢复（排除列表行内按钮）
  async toggle() {
    const { send } = await connect(MAIN)
    const out = await evaluate(send, `(() => {
      const bar = b => !b.closest('.list-item')
      const pause = [...document.querySelectorAll('[aria-label="暂停"]')].filter(bar)
      if (pause.length) { pause[0].click(); return { action: 'paused', barBtns: pause.length } }
      const play = [...document.querySelectorAll('[aria-label="播放"]')].filter(bar)
      if (play.length) { play[0].click(); return { action: 'resumed', barBtns: play.length } }
      return { action: 'none' }
    })()`)
    logResult('toggle:', out); flushConsole()
  },

  // 播放状态（解包 Vue ref）
  async state() {
    const { send } = await connect(MAIN)
    const out = await evaluate(send, `(() => {
      const un = v => (v && v.__v_isRef) ? v.value : v
      const st = un(window.lxData?.status) || {}
      const mi = un(window.lxData?.musicInfo) || {}
      const pp = un(window.lxData?.playProgress) || {}
      return { song: mi.name || null, singer: mi.singer || null, status: st.status ?? null,
        progress: st.progress ?? pp.nowPlayTime ?? null, duration: st.duration ?? pp.maxPlayTime ?? null }
    })()`)
    logResult('state:', out); flushConsole()
  },

  // 跳转进度
  async seek(sec) {
    const { send } = await connect(MAIN)
    const out = await evaluate(send, `(() => {
      const ae = window.app_event
      if (ae && typeof ae.setProgress === 'function') { ae.setProgress(${Number(sec)}); return { ok: true } }
      return { ok: false, keys: ae ? Object.getOwnPropertyNames(ae) : null }
    })()`)
    logResult('seek:', out); flushConsole()
  },

  // 歌词内容（当前歌曲的 lrc/lxlrc 是否有逐字）
  async lyricInfo() {
    const { send } = await connect(MAIN)
    const out = await evaluate(send, `(() => {
      const mi = window.lxData?.musicInfo || {}
      return {
        name: mi.name, singer: mi.singer,
        hasLrc: !!mi.lrc, hasLxlrc: !!mi.lxlrc, hasTlrc: !!mi.tlrc,
        lxlrcHead: (mi.lxlrc || '').slice(0, 60),
      }
    })()`)
    logResult('lyricInfo:', out); flushConsole()
  },

  // 进入封面墙视图
  async openWall() {
    const { send } = await connect(MAIN)
    const out = await evaluate(send, `(() => {
      const b = document.querySelector('button[aria-label="封面墙"]') || document.querySelector('button[title="封面墙"]')
      if (!b) return { ok: false }
      b.click()
      return { ok: true, latticeBtnNow: !!document.querySelector('[title*="Folia"]') }
    })()`)
    logResult('openWall:', out); flushConsole()
  },

  // 采样 Folia 歌词推进：n 次、每 interval ms
  async sample(n = 6, interval = 1500) {
    const { send } = await connect(MAIN)
    for (let i = 0; i < Number(n); i++) {
      const s = await evaluate(send, `(() => {
        const st = window.lxData?.status || {}
        const mi = window.lxData?.musicInfo || {}
        return { t: Date.now() % 100000, progress: st.progress, status: st.status, song: mi.name }
      })()`)
      process.stdout.write(`  sample#${i} ${JSON.stringify(s)}\n`)
      if (i < Number(n) - 1) await wait(Number(interval))
    }
  },

  // Folia 窗口歌词采样：sr-only 行文本 + 就绪态
  async foliaSample(n = 6, interval = 1500) {
    const { send } = await connect(FOLIA)
    const seq = []
    for (let i = 0; i < Number(n); i++) {
      const s = await evaluate(send, `(() => {
        const sr = document.querySelector('.sr-only')
        const wrap = document.querySelector('.lattice-lyrics')
        return { t: Date.now() % 100000, sr: sr?.textContent?.slice(0, 40) ?? null, ready: wrap?.className.includes('is-ready') ?? null }
      })()`)
      seq.push(s); process.stdout.write(`  folia#${i} ${JSON.stringify(s)}\n`)
      if (i < Number(n) - 1) await wait(Number(interval))
    }
    const changed = seq.length > 1 && seq[seq.length - 1].sr !== seq[0].sr
    console.log('  sr-line changed over window:', changed)
  },

  // 截图（main|folia）
  async shot(which) {
    const { send, page } = await connect(which === 'folia' ? FOLIA : MAIN)
    await send('Page.enable')
    await send('Page.bringToFront')
    await wait(400)
    const r = await send('Page.captureScreenshot', { format: 'png' })
    fs.mkdirSync(SHOT_DIR, { recursive: true })
    const f = path.join(SHOT_DIR, `${which}-${Date.now()}.png`)
    fs.writeFileSync(f, Buffer.from(r.data, 'base64'))
    console.log('shot:', f)
  },
}

const cmd = process.argv[2]
if (!cmds[cmd]) { console.log('cmds:', Object.keys(cmds).join(', ')); process.exit(1) }
cmds[cmd](...process.argv.slice(3)).then(() => process.exit(0)).catch(e => { console.error('ERROR:', e.message); flushConsole(); process.exit(1) })
