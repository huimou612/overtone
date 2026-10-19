'use strict'
/**
 * 沉浸式播放页 · 视觉门禁（L2）
 *
 * 目的：把「面板关闭时经典模式不回归」变成可重复执行的断言，而不是人工看截图。
 *
 * 为什么需要它：上一轮视觉对比得出「四个场景有 5 万像素色差」，事后查明是两次采集
 * 用了不同 theme.id（基线档 blue / 新档默认 overtone），歌词色块 `var(--color-primary)` 随之变色。
 * 那次结论之所以会跑偏，是因为采集脚本 **没有记录也没有锁定主题**。本门禁把这两件事补上：
 *   1. 采集前在页面里显式 `window.setTheme(blue 的色板)`，不依赖档案默认值；
 *   2. 记录 themeId / 运行时 --color-primary / dist/renderer.js 的 sha256 / 视口 / 截图哈希；
 *   3. 任一项对不上就判 INVALID，绝不把「环境不一致」混成「产品回归」。
 *
 * 断言（逐场景，共 5 个）：
 *   A. 差异像素集合 ⊆ 允许变更矩形（当前=顶栏新增的 34×34 面板按钮）
 *   B. 差异像素数 == 预期值（当前=952）
 *   C. 允许矩形之外的差异像素 == 0
 *   D. 两次独立采集（独立档案 + 独立端口 + 独立进程）的差异掩码与截图哈希一致
 *
 * ⚠️ 952 与 [1180,18]-[1213,51] 是**当前按钮设计**下的期望值，不是通用豁免。
 *    按钮位置/尺寸/图标一旦改动，必须重新审核基线并同步这里，不能放宽断言了事。
 *
 * 用法：
 *   node build-config/verify-visual-gate.cjs
 *   node build-config/verify-visual-gate.cjs --runs=2 --out=.git/l2/gate
 *
 * 基线位置：优先 `test/visual-baseline/immersive/`（随代码入库）；该目录缺失时才回落到
 * `.git/l1/base3`（早期本地证据）。两者都缺、或任一基线文件与清单 sha256 不符 → INVALID（exit 2），
 * 不会静默跳过断言。清单格式见基线目录下的 `hashes.txt`。
 *
 * 退出码：0 全部 PASS / 1 有 FAIL / 2 有 INVALID（环境或基线不可信）
 */
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')
const crypto = require('node:crypto')
const http = require('node:http')
const { spawn, spawnSync } = require('node:child_process')
const WebSocket = require('ws')

const ROOT = path.resolve(__dirname, '..')

// ── 期望值（与环境无关的契约）────────────────────────────────────────
const SCENES = ['01-line', '02-word', '03-empty', '04-reduced', '05-nocover']
const ALLOWED_RECT = [1180, 18, 1213, 51]   // 面板按钮（含 1px 圆角抗锯齿）
const EXPECTED_DIFF = 0                      // 2026-10-19 基线更新：阶段 C 重设计后，面板按钮已进入新基线，候选应零漂移（按钮存在性由 interact.cjs 断言）
const EXPECTED_PRIMARY = 'rgb(52, 152, 219)' // blue 主题的 --color-primary
const THEME_ID = 'blue'
const VIEWPORT = [1280, 800]

// ── 参数 ────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const arg = (name, def) => {
  const hit = argv.find(a => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : def
}
const RUNS = Number(arg('runs', '2'))
const OUT_ROOT = path.resolve(ROOT, arg('out', '.git/l2/gate'))
const STAMP = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-')
const OUT = path.join(OUT_ROOT, STAMP)
const DIST = path.join(ROOT, 'dist/renderer.js')

// ── 基线位置 ────────────────────────────────────────────────────────
// 优先读仓库内的基线（可随代码一起评审、换机可用）；仅当该目录整体不存在时才回退到 `.git/l1/base3`
// （早期调查期留下的本地证据，不入版本库）。仓库目录一旦存在则锁定仓库、不完整即 INVALID，绝不静默混用两套基线。
const REPO_BASE_DIR = path.join(ROOT, 'test/visual-baseline/immersive')
const LEGACY_BASE_DIR = path.join(ROOT, '.git/l1/base3')
const REPO_MANIFEST = path.join(REPO_BASE_DIR, 'hashes.txt')
const LEGACY_MANIFEST = path.join(ROOT, '.git/l2/an/hashes.txt')
const rel = p => path.relative(ROOT, p).replace(/\\/g, '/')

// 运行时由 resolveBaseline() 赋值（不要在这里写死）
let BASE_DIR = null
let HASHES_TXT = null

const wait = ms => new Promise(r => setTimeout(r, ms))
const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex')
const log = (...a) => console.log(...a)

// ── 基线解析 ────────────────────────────────────────────────────────
// 回退规则（严格，2026-10-18 修订）：
//   1) 仅当仓库基线目录「整体不存在」时，才允许整体回退到 `.git/l1/base3`。
//   2) 仓库基线目录一旦存在，无论文件缺失 / 类型异常 / 权限异常 / 校验失败，
//      都不得回退到 legacy，必须由下方完整性校验判定 INVALID（绝不静默混用两套基线）。
//   3) legacy 回退基线同样要经过下方完整性校验，哈希不符即 INVALID。
const missingScenes = dir => SCENES.filter(n => !fs.existsSync(path.join(dir, `${n}.png`)))
const dirExists = dir => {
  try {
    if (!fs.existsSync(dir)) return false
    try { return fs.statSync(dir).isDirectory() } catch { return true } // 存在但无法 stat（权限异常）→ 视为存在，交给完整性校验判 INVALID
  } catch { return false }
  return false
}

const resolveBaseline = () => {
  // 仓库基线目录整体不存在 → 才考虑回退
  if (!dirExists(REPO_BASE_DIR)) {
    const legacyMissing = missingScenes(LEGACY_BASE_DIR)
    if (legacyMissing.length === 0) {
      return { dir: LEGACY_BASE_DIR, manifest: LEGACY_MANIFEST, source: 'legacy', repoMissing: SCENES.slice(), legacyMissing: [] }
    }
    return { dir: null, manifest: null, source: 'missing', repoMissing: SCENES.slice(), legacyMissing }
  }
  // 仓库基线目录存在 → 锁定仓库，完整性由后续校验负责（缺失/异常一律 INVALID，不再动用 legacy）
  return { dir: REPO_BASE_DIR, manifest: REPO_MANIFEST, source: 'repo', repoMissing: missingScenes(REPO_BASE_DIR), legacyMissing: [] }
}

// 清单解析，兼容两种行格式：
//   repo   : `01-line.png,115781,<sha256>`
//   legacy : `01-line,base3(L1),<sha256>,115781,1280x800`（只认 base3(L1) 那几行）
const readManifest = file => {
  const out = {}
  if (!file || !fs.existsSync(file)) return out
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const cols = line.split(',')
    const hash = cols.find(c => /^[0-9a-f]{64}$/.test(c))
    if (!hash) continue
    const head = cols[0]
    if (/\.(png|json)$/.test(head)) out[head] = hash
    else if (cols[1] === 'base3(L1)') out[`${head}.png`] = hash
  }
  return out
}

// ── PNG 解码（只支持本门禁会遇到的格式：8bit、非交错、RGB/RGBA）──────
const decodePng = buf => {
  if (buf.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('not png')
  let pos = 8
  let w = 0, h = 0, depth = 0, ctype = 0, interlace = 0
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.slice(pos + 4, pos + 8).toString('ascii')
    const body = buf.slice(pos + 8, pos + 8 + len)
    pos += 12 + len
    if (type === 'IHDR') {
      w = body.readUInt32BE(0)
      h = body.readUInt32BE(4)
      depth = body[8]
      ctype = body[9]
      interlace = body[12]
    } else if (type === 'IDAT') {
      idat.push(body)
    } else if (type === 'IEND') break
  }
  if (depth !== 8 || interlace !== 0) throw new Error(`unsupported png depth=${depth} interlace=${interlace}`)
  const ch = { 2: 3, 6: 4 }[ctype]
  if (!ch) throw new Error(`unsupported colorType=${ctype}`)
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = w * ch
  const out = Buffer.alloc(w * h * ch)
  let p = 0
  for (let y = 0; y < h; y++) {
    const ft = raw[p++]
    const line = raw.slice(p, p + stride)
    p += stride
    const cur = out.slice(y * stride, (y + 1) * stride)
    const prev = y ? out.slice((y - 1) * stride, y * stride) : Buffer.alloc(stride)
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0
      const b = prev[i]
      const c = i >= ch ? prev[i - ch] : 0
      let v = line[i]
      switch (ft) {
        case 0: break
        case 1: v = (v + a) & 0xff; break
        case 2: v = (v + b) & 0xff; break
        case 3: v = (v + ((a + b) >> 1)) & 0xff; break
        case 4: {
          const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c)
          const pr = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c)
          v = (v + pr) & 0xff
          break
        }
        default: throw new Error('bad filter ' + ft)
      }
      cur[i] = v
    }
  }
  return { w, h, ch, data: out }
}

const diffMasks = (A, B) => {
  if (A.w !== B.w || A.h !== B.h) throw new Error('size mismatch')
  const { w, h } = A
  const mask = new Uint8Array(w * h)
  let count = 0
  for (let i = 0; i < w * h; i++) {
    const i1 = i * A.ch
    const i2 = i * B.ch
    if (A.data[i1] !== B.data[i2] || A.data[i1 + 1] !== B.data[i2 + 1] || A.data[i1 + 2] !== B.data[i2 + 2]) {
      mask[i] = 1
      count++
    }
  }
  return { mask, count, w, h }
}

const maskStats = (mask, w, h) => {
  const [rx0, ry0, rx1, ry1] = ALLOWED_RECT
  let outside = 0
  let minx = w, miny = h, maxx = -1, maxy = -1
  for (let y = 0; y < h; y++) {
    const base = y * w
    for (let x = 0; x < w; x++) {
      if (!mask[base + x]) continue
      if (x < minx) minx = x
      if (x > maxx) maxx = x
      if (y < miny) miny = y
      if (y > maxy) maxy = y
      if (x < rx0 || x > rx1 || y < ry0 || y > ry1) outside++
    }
  }
  return {
    outsideAllowed: outside,
    bbox: maxx < 0 ? null : [minx, miny, maxx, maxy],
    // 零差异（maxx<0，bbox=null）视为平凡满足：候选与基线完全一致是最理想的 PASS
    insideAllowedRect: maxx < 0 ? true : (minx >= rx0 && maxx <= rx1 && miny >= ry0 && maxy <= ry1),
  }
}

// ── HTTP / CDP ──────────────────────────────────────────────────────
const getJson = (port, p, timeout = 3000) => new Promise((res, rej) => {
  const req = http.get({ host: '127.0.0.1', port, path: p, timeout }, r => {
    let b = ''
    r.on('data', c => { b += c })
    r.on('end', () => { try { res(JSON.parse(b)) } catch (e) { rej(e) } })
  })
  req.on('timeout', () => req.destroy(new Error('timeout')))
  req.on('error', rej)
})

const attach = async target => {
  const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 1 << 28 })
  await new Promise((r, j) => { ws.once('open', r); ws.once('error', j) })
  let id = 0
  const pend = new Map()
  ws.on('message', raw => {
    let m; try { m = JSON.parse(String(raw)) } catch { return }
    if (m.id && pend.has(m.id)) {
      const p = pend.get(m.id); pend.delete(m.id)
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result)
    }
  })
  const send = (method, params = {}) => new Promise((res, rej) => {
    const n = ++id
    pend.set(n, { resolve: res, reject: rej })
    ws.send(JSON.stringify({ id: n, method, params }))
  })
  const js = async(expr, timeout = 25000) => {
    const r = await Promise.race([
      send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }),
      wait(timeout).then(() => { throw new Error('evaluate timeout') }),
    ])
    if (r && r.exceptionDetails) throw new Error('JS: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text))
    return r && r.result ? r.result.value : undefined
  }
  return { ws, send, js, close: () => { try { ws.close() } catch (_) { /* ignore */ } } }
}

// ── 采集素材（与 .git/l2/shot.cjs 逐字一致，保证可比性）───────────────
const COVER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='320'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23223a55'/%3E%3Cstop offset='0.55' stop-color='%233f6a8a'/%3E%3Cstop offset='1' stop-color='%23d9a05b'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='320' height='320' fill='url(%23g)'/%3E%3C/svg%3E"

const LRC_LINE = [
  '[00:00.00]第一句 已经唱过的一句',
  '[00:05.00]第二句 前一句留作上下文',
  '[00:10.00]第三句 当前这一句正在唱',
  '[00:15.00]第四句 下一句提示',
  '[00:20.00]第五句 再下一句',
].join('\n')

const TLRC_LINE = [
  '[00:10.00]Translation of the active line',
  '[00:15.00]Translation of the next line',
].join('\n')

const LXLRC_WORD = [
  '[00:00.00]第一句 已经唱过的一句',
  '[00:05.00]第二句 前一句留作上下文',
  '[00:10.00]<0,700>逐<700,700>字<1400,700>填<2100,700>充<2800,800>测<3500,700>试',
  '[00:15.00]第四句 下一句提示',
  '[00:20.00]第五句 再下一句',
].join('\n')

const LRC_WORD_FALLBACK = [
  '[00:00.00]第一句 已经唱过的一句',
  '[00:05.00]第二句 前一句留作上下文',
  '[00:10.00]逐字填充测试',
  '[00:15.00]第四句 下一句提示',
  '[00:20.00]第五句 再下一句',
].join('\n')

const APPLY = (lrc, lxlrc, tlrc, pic, seek) => `(() => {
  const lx = window.lxData
  if (!lx || !lx.musicInfo) return { ok: false, reason: 'no lxData.musicInfo' }
  lx.playMusicInfo.musicInfo = {
    id: 'l1-sample', songmid: 'l1-sample', source: 'kw', interval: '04:00',
    name: 'L1 视觉回归样本', singer: '泛音回归测试', album: 'Stage L1',
  }
  Object.assign(lx.musicInfo, {
    id: 'l1-sample',
    name: 'L1 视觉回归样本',
    singer: '泛音回归测试',
    album: 'Stage L1',
    pic: ${JSON.stringify(pic)},
    lrc: ${JSON.stringify(lrc)},
    lxlrc: ${JSON.stringify(lxlrc)},
    tlrc: ${JSON.stringify(tlrc)},
    rlrc: null,
    rawlrc: null,
  })
  window.app_event.setProgress(${seek}, 240)
  return { ok: true }
})()`

const OPEN_STAGE = `(() => {
  const byLabel = needle => [...document.querySelectorAll('[aria-label]')]
    .find(el => (el.getAttribute('aria-label') || '').includes(needle))
  if (document.querySelector('[data-view="immersive-lyric"]')) return { step: 'already' }
  if (!document.querySelector('[data-view="play-detail"]')) {
    const pic = byLabel('播放详情页')
    if (!pic) return { step: 'no-pic-btn' }
    pic.click()
    return { step: 'opened-detail' }
  }
  const open = byLabel('沉浸式歌词')
  if (!open) return { step: 'no-immersive-btn' }
  open.click()
  return { step: 'opened-stage' }
})()`

// 主题注入：显式写 blue 色板（不依赖档案默认值），并回读验证
const APPLY_THEME = colors => `(() => {
  const c = ${JSON.stringify(colors)}
  let attached = document.body.contains(window.dom_style)
  if (!attached) { document.body.appendChild(window.dom_style); attached = document.body.contains(window.dom_style) }
  window.setTheme(c)
  return {
    attached,
    primary: getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim(),
    viewport: [innerWidth, innerHeight],
  }
})()`

const READ_PRIMARY = `getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim()`

// ── 启动 / 停止实例 ─────────────────────────────────────────────────
const electronPath = () => {
  try {
    const p = require('electron')
    if (typeof p === 'string' && fs.existsSync(p)) return p
  } catch (_) { /* fall through */ }
  return path.join(ROOT, 'node_modules/electron/dist/electron.exe')
}

const killTree = pid => {
  if (!pid) return
  spawnSync('taskkill', ['/F', '/PID', String(pid), '/T'], { stdio: 'ignore' })
}

const launch = async(port, profileDir, logFile) => {
  const env = { ...process.env, NODE_ENV: 'production' }
  delete env.ELECTRON_RUN_AS_NODE
  for (const k of ['http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'all_proxy', 'ALL_PROXY']) delete env[k]
  fs.mkdirSync(profileDir, { recursive: true })
  const fd = fs.openSync(logFile, 'a')
  const child = spawn(electronPath(), ['.', `--user-data-dir=${profileDir}`, `--remote-debugging-port=${port}`], {
    cwd: ROOT, env, stdio: ['ignore', fd, fd],
  })
  const t0 = Date.now()
  let target = null
  while (Date.now() - t0 < 90000) {
    try {
      const list = await getJson(port, '/json')
      target = list.find(t => t.type === 'page' && /dist\/index\.html/.test(String(t.url)))
      if (target) break
    } catch (_) { /* not ready */ }
    await wait(800)
  }
  if (!target) throw new Error(`CDP 未就绪（port=${port}, pid=${child.pid}）`)
  return { child, target, pid: child.pid }
}

// ── 单轮采集 ────────────────────────────────────────────────────────
const captureRun = async(runIndex, themeColors) => {
  const port = 9400 + runIndex
  const runDir = path.join(OUT, `run${runIndex}`)
  fs.mkdirSync(runDir, { recursive: true })
  const profileDir = path.join(OUT, `ud-run${runIndex}`)
  const logFile = path.join(OUT, `app-run${runIndex}.log`)
  const meta = { run: runIndex, port, profile: path.relative(ROOT, profileDir).replace(/\\/g, '/'), scenes: {} }

  const app = await launch(port, profileDir, logFile)
  meta.pid = app.pid
  meta.distSha256 = sha256(fs.readFileSync(DIST))
  log(`  [run${runIndex}] electron pid=${app.pid} port=${port} target=${String(app.target.url).slice(-60)}`)

  const s = await attach(app.target)
  try {
    await s.send('Page.enable')
    await s.send('Runtime.enable')
    await s.send('Emulation.setFocusEmulationEnabled', { enabled: true })
    await s.send('Emulation.setDeviceMetricsOverride', { width: VIEWPORT[0], height: VIEWPORT[1], deviceScaleFactor: 1, mobile: false })

    const themed = await s.js(APPLY_THEME(themeColors))
    meta.theme = { id: THEME_ID, primary: themed.primary, domStyleAttached: themed.attached }
    meta.viewport = themed.viewport
    log(`  [run${runIndex}] theme=${THEME_ID} primary=${themed.primary} viewport=${JSON.stringify(themed.viewport)}`)

    // 打开沉浸视图（先注入歌曲，否则播放条不会给入口）
    // ⚠️ `lxData.musicInfo` 由渲染层初始化后才存在。早期版本只注入一次，若 CDP 连上时
    // 渲染层还没建好就会静默失败，采到「无歌词」的空白场景 → 5 个场景全部误判 FAIL。
    // 这里改为轮询等待就绪；超时仍失败则本轮不采集，交由判定逻辑记为 INVALID（不伪造数据）。
    let seeded = null
    for (let i = 0; i < 30; i++) {
      seeded = await s.js(APPLY(LRC_LINE, null, TLRC_LINE, COVER, 11))
      if (seeded && seeded.ok) break
      await wait(500)
    }
    meta.seed = seeded
    log(`  [run${runIndex}] seed: ${JSON.stringify(seeded)}${seeded && seeded.ok ? '' : ' (retry exhausted)'}`)
    if (!seeded || !seeded.ok) {
      meta.seeded = false
      log(`  [run${runIndex}] !! 测试曲目注入失败，本轮不采集场景 → 将判 INVALID`)
      return meta
    }
    meta.seeded = true
    for (let i = 0; i < 8; i++) {
      const r = await s.js(OPEN_STAGE)
      if (r && (r.step === 'already' || r.step === 'opened-stage')) break
      await wait(900)
    }
    for (let i = 0; i < 30; i++) {
      if (await s.js(`!!document.querySelector('[data-view="immersive-lyric"]')`)) break
      await wait(300)
    }

    const shoot = async(name, applyExpr, reduce) => {
      // 每次截图前复核主题：应用内任何路径重写主题都会在这里被抓到并纠正
      const now = await s.js(READ_PRIMARY)
      if (now !== themed.primary) {
        await s.js(APPLY_THEME(themeColors))
        log(`  [run${runIndex}] !! 主题在采集中被改写（${now}），已重新设置`)
      }
      await s.send('Emulation.setEmulatedMedia', {
        features: reduce ? [{ name: 'prefers-reduced-motion', value: 'reduce' }] : [],
      })
      const applied = await s.js(applyExpr)
      if (!applied || !applied.ok) throw new Error(`场景 ${name} 素材注入失败: ${JSON.stringify(applied)}`)
      await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: VIEWPORT[0] - 5, y: VIEWPORT[1] - 5, button: 'none' }).catch(() => {})
      await wait(900)
      const primary = await s.js(READ_PRIMARY)
      const viewport = await s.js('[innerWidth, innerHeight]')
      const shot = await s.send('Page.captureScreenshot', { format: 'png' })
      const buf = Buffer.from(shot.data, 'base64')
      const file = path.join(runDir, `${name}.png`)
      fs.writeFileSync(file, buf)
      meta.scenes[name] = {
        file: path.relative(ROOT, file).replace(/\\/g, '/'),
        sha256: sha256(buf),
        bytes: buf.length,
        primary,
        viewport,
        reducedMotion: !!reduce,
        capturedAt: new Date().toISOString(),
      }
      log(`  [run${runIndex}] ${name}: ${buf.length}B sha=${meta.scenes[name].sha256.slice(0, 12)} primary=${primary}`)
    }

    await shoot('01-line', APPLY(LRC_LINE, null, TLRC_LINE, COVER, 11), false)
    await shoot('02-word', APPLY(LRC_WORD_FALLBACK, LXLRC_WORD, null, COVER, 13), false)
    await shoot('03-empty', APPLY(null, null, null, COVER, 11), false)
    await shoot('04-reduced', APPLY(LRC_WORD_FALLBACK, LXLRC_WORD, null, COVER, 13), true)
    await shoot('05-nocover', APPLY(LRC_LINE, null, TLRC_LINE, null, 11), false)
    await s.send('Emulation.setEmulatedMedia', { features: [] }).catch(() => {})
  } finally {
    s.close()
    killTree(app.pid)
    await wait(1500)
  }
  return meta
}

// ── 主流程 ──────────────────────────────────────────────────────────
const main = async() => {
  fs.mkdirSync(OUT, { recursive: true })
  const result = {
    startedAt: new Date().toISOString(),
    out: path.relative(ROOT, OUT).replace(/\\/g, '/'),
    contract: { scenes: SCENES, allowedRect: ALLOWED_RECT, expectedDiff: EXPECTED_DIFF, themeId: THEME_ID, expectedPrimary: EXPECTED_PRIMARY, viewport: VIEWPORT },
    preflight: {},
    runs: [],
    scenes: {},
    summary: { pass: 0, fail: 0, invalid: 0 },
    exitCode: 0,
  }

  // ── 预检 ──
  const distBuf = fs.readFileSync(DIST)
  result.preflight.distSha256 = sha256(distBuf)
  result.preflight.distMtime = fs.statSync(DIST).mtime.toISOString()
  log(`dist/renderer.js sha256=${result.preflight.distSha256}`)

  const themeInfo = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/common/theme/index.json'), 'utf8'))
  const theme = themeInfo.find(t => t.id === THEME_ID)
  if (!theme) throw new Error(`找不到主题 ${THEME_ID}`)
  const themeColors = { ...theme.config.themeColors, ...(theme.config.extInfo || {}) }
  result.preflight.themeSource = `src/common/theme/index.json#${THEME_ID}`
  result.preflight.themePrimaryInJson = theme.config.themeColors['--color-primary']
  log(`theme(${THEME_ID}) primary=${result.preflight.themePrimaryInJson} keys=${Object.keys(themeColors).length}`)

  // ── 基线解析：仓库内优先 → 回落 .git/ → 都缺则 INVALID ──
  const base = resolveBaseline()
  BASE_DIR = base.dir
  HASHES_TXT = base.manifest
  result.preflight.baselineSource = base.source
  result.preflight.baselineDir = base.dir ? rel(base.dir) : '(缺失)'
  log(`基线来源=${base.source} → ${result.preflight.baselineDir}`)

  if (!base.dir) {
    const msg = `基线缺失：${rel(REPO_BASE_DIR)} 缺 [${base.repoMissing.join(', ')}]；`
      + `回落 ${rel(LEGACY_BASE_DIR)} 缺 [${base.legacyMissing.join(', ')}]`
    result.preflight.baselineProblems = [msg]
    result.summary.invalid = SCENES.length
    result.finishedAt = new Date().toISOString()
    result.exitCode = 2
    fs.writeFileSync(path.join(OUT, 'gate.json'), JSON.stringify(result, null, 1))
    console.error('!! ' + msg)
    process.exit(2)
  }

  // 基线完整性：PNG 与 JSON 全部与清单对账，任一缺失/无记录/不一致 → INVALID
  // 注：回落用的旧清单只登记 PNG（它没有 JSON 哈希），此时 JSON 仅校验「文件存在」；
  //     PNG 的哈希校验在两种清单下都是强制的，不存在静默跳过。
  // 异常处理：缺失 / 类型异常（目录等非常规文件）/ 读取权限异常 / 哈希不匹配
  //     一律记入 baseProblems → envValid=false → 各场景判 INVALID（exit 2），绝不抛未处理异常、绝不回退。
  const baseProblems = []
  let manifest = {}
  try {
    manifest = readManifest(HASHES_TXT)
  } catch (e) {
    baseProblems.push(`清单不可读(${rel(HASHES_TXT)}): ${e && e.code || e.message || e}`)
  }
  const manifestHasJson = Object.keys(manifest).some(k => k.endsWith('.json'))
  result.preflight.baseline = {}
  for (const name of SCENES) {
    for (const ext of ['png', 'json']) {
      const file = `${name}.${ext}`
      const f = path.join(BASE_DIR, file)
      let stat = null
      try {
        if (!fs.existsSync(f)) { baseProblems.push(`${file}: 缺失`); continue }
        stat = fs.statSync(f)
      } catch (e) {
        baseProblems.push(`${file}: 无法访问(${e && e.code || e.message || e})`); continue
      }
      if (!stat.isFile()) { baseProblems.push(`${file}: 类型异常（非常规文件）`); continue }
      let h = null
      try {
        h = sha256(fs.readFileSync(f))
      } catch (e) {
        baseProblems.push(`${file}: 读取失败(${e && e.code || e.message || e})`); continue
      }
      const expected = manifest[file] || null
      const hashChecked = expected !== null
      if (hashChecked && expected !== h) baseProblems.push(`${file}: 与清单不一致`)
      if (!hashChecked && !(ext === 'json' && !manifestHasJson)) baseProblems.push(`${file}: 清单无记录`)
      if (ext === 'png') {
        result.preflight.baseline[name] = { sha256: h, fromManifest: expected || '(无记录)', match: hashChecked && expected === h }
      }
    }
  }
  result.preflight.manifestHasJson = manifestHasJson
  result.preflight.baselineProblems = baseProblems
  if (baseProblems.length) log(`!! 基线完整性异常: ${baseProblems.join('; ')}`)

  // ── 采集 ──
  log(`\n开始采集 ${RUNS} 轮（独立档案 + 独立端口 + 独立进程）→ ${result.out}`)
  for (let i = 1; i <= RUNS; i++) result.runs.push(await captureRun(i, themeColors))
  log('采集完成\n')

  // ── 判定 ──
  const runs = result.runs
  const metaConsistent = {
    dist: runs.every(r => r.distSha256 === runs[0].distSha256),
    theme: runs.every(r => r.theme.primary === runs[0].theme.primary),
    viewport: runs.every(r => JSON.stringify(r.viewport) === JSON.stringify(runs[0].viewport)),
    primaryExpected: runs.every(r => r.theme.primary === EXPECTED_PRIMARY),
    viewportExpected: runs.every(r => JSON.stringify(r.viewport) === JSON.stringify(VIEWPORT)),
    distinctPids: new Set(runs.map(r => r.pid)).size === runs.length,
    distinctProfiles: new Set(runs.map(r => r.profile)).size === runs.length,
  }
  const envValid = metaConsistent.dist && metaConsistent.primaryExpected && metaConsistent.viewportExpected &&
    metaConsistent.theme && metaConsistent.distinctPids && metaConsistent.distinctProfiles &&
    baseProblems.length === 0   // 基线不完整时不允许判 PASS/FAIL，只能 INVALID
  result.preflight.metaConsistent = metaConsistent

  for (const name of SCENES) {
    const rec = { checks: {} }
    const baseFile = path.join(BASE_DIR, `${name}.png`)
    const hashes = runs.map(r => r.scenes[name] && r.scenes[name].sha256)
    const missing = runs.map((r, i) => (r.scenes[name] ? null : `run${i + 1} 未产出`)).filter(Boolean)

    if (missing.length || !fs.existsSync(baseFile)) {
      rec.verdict = 'INVALID'
      rec.reason = missing.join('; ') || '基线缺失'
      result.scenes[name] = rec
      result.summary.invalid++
      continue
    }

    let base = null
    try {
      base = decodePng(fs.readFileSync(baseFile))
    } catch (e) {
      // 基线 PNG 类型异常 / 读取权限异常 / 格式损坏 → 判 INVALID，不抛未处理异常
      rec.verdict = 'INVALID'
      rec.reason = `基线 PNG 读取/解码失败: ${e && e.message || e}`
      result.scenes[name] = rec
      result.summary.invalid++
      continue
    }
    const perRun = []
    for (let i = 0; i < runs.length; i++) {
      const cand = decodePng(fs.readFileSync(path.join(ROOT, runs[i].scenes[name].file)))
      const d = diffMasks(base, cand)
      const st = maskStats(d.mask, d.w, d.h)
      perRun.push({ mask: d.mask, count: d.count, ...st, sha256: hashes[i], size: [d.w, d.h] })
    }

    rec.sha256 = hashes
    rec.perRun = perRun.map(p => ({ sha256: p.sha256, diff: p.count, bbox: p.bbox, outsideAllowed: p.outsideAllowed, size: p.size }))

    // D. 两次采集一致性（掩码逐像素 + 哈希）
    let maskEqual = true
    for (let i = 1; i < perRun.length; i++) {
      if (perRun[i].count !== perRun[0].count) { maskEqual = false; break }
      for (let k = 0; k < perRun[0].mask.length; k++) {
        if (perRun[0].mask[k] !== perRun[i].mask[k]) { maskEqual = false; break }
      }
      if (!maskEqual) break
    }

    // A/B/C：逐轮都要满足
    const allInside = perRun.every(p => p.insideAllowedRect)
    const allCount = perRun.every(p => p.count === EXPECTED_DIFF)
    const allOutsideZero = perRun.every(p => p.outsideAllowed === 0)
    const allSameSize = perRun.every(p => p.size[0] === VIEWPORT[0] && p.size[1] === VIEWPORT[1])

    rec.checks = {
      insideAllowedRect: allInside,
      diffEqualsExpected: allCount,
      outsideAllowedZero: allOutsideZero,
      runsIdenticalMask: maskEqual,
      runsIdenticalHash: new Set(hashes).size === 1,
      sizeIsViewport: allSameSize,
    }

    if (!envValid) {
      rec.verdict = 'INVALID'
      rec.reason = '采集条件不一致（主题/构建/视口/实例独立性）'
      result.summary.invalid++
    } else if (Object.values(rec.checks).every(Boolean)) {
      rec.verdict = 'PASS'
      result.summary.pass++
    } else {
      rec.verdict = 'FAIL'
      rec.reason = Object.entries(rec.checks).filter(([, v]) => !v).map(([k]) => k).join(',')
      result.summary.fail++
    }
    result.scenes[name] = rec
    log(`${name.padEnd(11)} ${rec.verdict}  diff=${perRun.map(p => p.count).join('/')}  bbox=${JSON.stringify(perRun[0].bbox)}  outside=${perRun.map(p => p.outsideAllowed).join('/')}`)
  }

  result.finishedAt = new Date().toISOString()
  result.exitCode = result.summary.invalid ? 2 : (result.summary.fail ? 1 : 0)

  fs.writeFileSync(path.join(OUT, 'gate.json'), JSON.stringify(result, null, 1))
  fs.writeFileSync(path.join(OUT, 'gate.md'), renderMarkdown(result))
  log(`\n结果：PASS=${result.summary.pass} FAIL=${result.summary.fail} INVALID=${result.summary.invalid}`)
  log(`证据：${result.out}/gate.json、gate.md`)
  process.exit(result.exitCode)
}

const renderMarkdown = r => {
  const lines = []
  lines.push(`# 视觉门禁运行结果（${r.startedAt}）`, '')
  lines.push(`- 构建：\`dist/renderer.js\` sha256 \`${r.preflight.distSha256}\`（mtime ${r.preflight.distMtime}）`)
  lines.push(`- 基线来源：\`${r.preflight.baselineSource}\` → \`${r.preflight.baselineDir}\``)
  lines.push(`- 主题契约：\`theme.id=${r.contract.themeId}\` / \`--color-primary=${EXPECTED_PRIMARY}\``)
  lines.push(`- 允许变更矩形：\`[${ALLOWED_RECT.join(',')}]\`，预期差异像素：${EXPECTED_DIFF}`)
  lines.push(`- 采集轮数：${r.runs.length}（pid ${r.runs.map(x => x.pid).join(' / ')}；profile ${r.runs.map(x => x.profile).join(' / ')}）`)
  lines.push('')
  lines.push('| 场景 | 判定 | 差异像素(各轮) | 包围盒 | 矩形外差异 | 两次掩码一致 |', '|---|---|---|---|---|---|')
  for (const name of SCENES) {
    const s = r.scenes[name]
    const counts = (s.perRun || []).map(p => p.diff).join(' / ')
    const bbox = s.perRun && s.perRun[0].bbox ? JSON.stringify(s.perRun[0].bbox) : '—'
    const outside = (s.perRun || []).map(p => p.outsideAllowed).join(' / ')
    lines.push(`| ${name} | ${s.verdict} | ${counts || '—'} | ${bbox} | ${outside || '—'} | ${s.checks && s.checks.runsIdenticalMask ? '是' : '否'} |`)
  }
  lines.push('')
  lines.push(`**汇总**：PASS ${r.summary.pass} · FAIL ${r.summary.fail} · INVALID ${r.summary.invalid}（exit ${r.exitCode}）`)
  if (r.preflight.baselineProblems && r.preflight.baselineProblems.length) {
    lines.push('', '基线完整性问题（已强制判 INVALID）：' + r.preflight.baselineProblems.join('；'))
  }
  return lines.join('\n') + '\n'
}

if (require.main === module) {
  main().catch(e => {
    console.error('FATAL', e && e.stack || e)
    process.exit(3)
  })
}

// 供负向对照脚本复用（不做重复实现）：被 require 时不执行采集
module.exports = { decodePng, diffMasks, maskStats, ALLOWED_RECT, EXPECTED_DIFF, VIEWPORT, SCENES, sha256 }
