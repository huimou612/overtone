#!/usr/bin/env node
/**
 * 阶段 6「能力显性化」的驱动验证。
 *
 * 六步：
 *   1. 侧栏有「工作台」一级入口，接的是新图标
 *   2. 工作台页面要素齐全（标题 / 副标题 / 分组 / 两张能力卡）
 *   3. 从工作台的能力卡打开 AI 逐字歌词对话框
 *   4. 从工作台的能力卡打开音源分离对话框
 *   5. 播放详情页的常驻工具行（分词 / 分离 / 工作台）
 *   6. 工具行里的「分词」打开的是同一个对话框
 *
 * 前提：`env -u ELECTRON_RUN_AS_NODE npm run dev -- --remote-debugging-port=9222`
 *
 * 四条通用规矩（见 MEMORY.md「驱动验证脚本」一节）：
 *   - 起点整页重载：dev 是 HMR，可能停在一个半热替换的状态，界面渲染不出来
 *   - 每次截图前 Page.bringToFront：Windows 上被盖住的窗口会暂停合成，截到的是陈旧画面
 *   - 不猜 CSS module 哈希：工作台用刚加的 data-view="workbench"，
 *     播放详情页用它本来就有的 data-view="play-detail"
 *   - 对话框一律用 <header> 里的 button 关闭（见 material/Modal.vue），
 *     点的是最后一个 —— 多个对话框同屏时最后 teleport 进来的才是当前那个
 *
 * 这台机器上没有导入音源，也没装分离模型，所以这里只验「入口能不能到」，
 * 不验「跑不跑得动」—— 那两件事各自的驱动脚本已经覆盖过。
 */

const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const WebSocket = require('ws')

const PORT = 9222
const OUT_DIR = path.join(__dirname, '..', 'notes', 'preview', 'splash')

let failed = 0
const check = (ok, label, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${!ok && detail ? ' —— ' + detail : ''}`)
  if (!ok) failed += 1
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

const getTargets = () => new Promise((resolve, reject) => {
  http.get(`http://127.0.0.1:${PORT}/json`, response => {
    let body = ''
    response.on('data', chunk => { body += chunk })
    response.on('end', () => {
      try { resolve(JSON.parse(body)) } catch (error) { reject(error) }
    })
  }).on('error', reject)
})

async function connect() {
  const targets = await getTargets()
  // 必须滤掉 devtools:// —— 否则调试器自己的页面会被当成主窗口
  const page = targets.find(target => target.type === 'page' && String(target.url).startsWith('http'))
  if (!page) throw new Error('没有找到主窗口页面（dev 起来了吗？）')

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise(resolve => ws.once('open', resolve))

  let seq = 0
  const send = (method, params) => new Promise((resolve, reject) => {
    const id = ++seq
    const onMessage = data => {
      const message = JSON.parse(data)
      if (message.id !== id) return
      ws.off('message', onMessage)
      if (message.error) reject(new Error(JSON.stringify(message.error)))
      else resolve(message.result)
    }
    ws.on('message', onMessage)
    ws.send(JSON.stringify({ id, method, params: params ?? {} }))
  })

  const evalJs = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) {
      throw new Error(String(result.exceptionDetails.text) + ' ' + String(result.exceptionDetails.exception?.description ?? ''))
    }
    return result.result.value
  }

  const shot = async name => {
    await send('Page.bringToFront')
    await wait(320)
    const data = await send('Page.captureScreenshot', { format: 'png' })
    const target = path.join(OUT_DIR, name)
    fs.writeFileSync(target, Buffer.from(data.data, 'base64'))
    console.log('  →', name, fs.statSync(target).size, 'B')
  }

  return { ws, send, evalJs, shot }
}

const closeModal = async cdp => {
  const result = await cdp.evalJs(`(() => {
    const buttons = [...document.querySelectorAll('header button')]
    if (!buttons.length) return 'none'
    buttons[buttons.length - 1].click()
    return 'clicked:' + buttons.length
  })()`)
  if (String(result).startsWith('clicked')) await wait(1300)
  return result
}

const closeDetail = async cdp => {
  const result = await cdp.evalJs(`(() => {
    const detail = document.querySelector('[data-view="play-detail"]')
    if (!detail) return 'none'
    const button = detail.querySelector('button[title]')
    if (!button) return 'no-button'
    button.click()
    return 'clicked'
  })()`)
  if (result === 'clicked') await wait(900)
  return result
}

const modalTitles = cdp => cdp.evalJs(`JSON.stringify([...document.querySelectorAll('h2')].map(h => h.textContent.trim()))`)

;(async () => {
  const cdp = await connect()
  console.log('阶段 6「能力显性化」验收\n')

  let songBackup = null

  try {
    await cdp.send('Page.reload', {})
    await wait(5000)

    // 两张能力卡都要求「有正在播放的歌」。这台机器上没有导入音源，所以不真去播放，
    // 只在状态里种一首，让卡片可点；跑完原样恢复。
    songBackup = JSON.parse(await cdp.evalJs(`JSON.stringify({
      id: window.lxData.musicInfo.id,
      name: window.lxData.musicInfo.name,
      singer: window.lxData.musicInfo.singer,
    })`))
    if (songBackup.id) {
      console.log(`  当前歌曲：${songBackup.name} - ${songBackup.singer}`)
    } else {
      await cdp.evalJs(`(() => {
        window.lxData.musicInfo.id = '__workbench_probe__'
        window.lxData.musicInfo.name = '验收探针曲目'
        window.lxData.musicInfo.singer = '泛音'
      })()`)
      await wait(700)
      console.log('  当前没有歌 —— 种了一首探针曲目（跑完恢复）')
    }

    // ==================== 1 ====================
    console.log('\n[1/6] 侧栏一级入口')
    await cdp.evalJs("location.hash = '#/'")
    await wait(1700)
    await closeDetail(cdp)
    const nav = JSON.parse(await cdp.evalJs(`(() => {
      const link = document.querySelector('a[href="#/workbench"]')
      if (!link) {
        return JSON.stringify({
          found: false,
          hrefs: [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')),
        })
      }
      const use = link.querySelector('use')
      return JSON.stringify({
        found: true,
        href: link.getAttribute('href'),
        label: link.getAttribute('aria-label'),
        role: link.getAttribute('role'),
        icon: use ? (use.getAttribute('xlink:href') || use.getAttribute('href') || '') : '',
      })
    })()`))
    check(nav.found, '侧栏里有 #/workbench 入口', JSON.stringify(nav))
    check(nav.label === '工作台', `提示文字是「工作台」`, `实际是「${nav.label}」`)
    check(nav.role === 'tab', '沿用侧栏既有的 role=tab', `role=${nav.role}`)
    check(String(nav.icon).includes('icon-workbench'), `接的是新图标 ${nav.icon}`, `接的是 ${nav.icon}`)

    // ==================== 2 ====================
    console.log('\n[2/6] 工作台页面')
    await cdp.evalJs("location.hash = '#/workbench'")
    await wait(2300)
    const page = JSON.parse(await cdp.evalJs(`(() => {
      const root = document.querySelector('[data-view="workbench"]')
      if (!root) return JSON.stringify({ hasRoot: false })
      const cards = [...root.querySelectorAll('button')].filter(b => /AI 逐字歌词|音源分离/.test(b.textContent || ''))
      const text = root.textContent || ''
      return JSON.stringify({
        hasRoot: true,
        hash: location.hash,
        title: [...root.querySelectorAll('h1')].map(h => h.textContent.trim()).join('|'),
        hasSubtitle: text.includes('泛音自研的音频能力'),
        groups: [...root.querySelectorAll('h3')].map(h => h.textContent.trim()),
        cards: cards.map(b => ({ text: (b.textContent || '').replace(/\\s+/g, ' ').trim(), disabled: b.disabled })),
        pathRows: [...root.querySelectorAll('button[title]')].length,
      })
    })()`))
    check(page.hasRoot, '页面已挂载（data-view="workbench"）', JSON.stringify(page))
    check(page.hash === '#/workbench', `路由切到工作台（${page.hash}）`, `还在 ${page.hash}`)
    check(page.title === '工作台', `标题是「工作台」`, `标题是「${page.title}」`)
    check(page.hasSubtitle, '副标题文案在')
    check((page.groups || []).length >= 2, `分组标题都在：${(page.groups || []).join(' / ')}`)
    check((page.cards || []).length === 2, `两张能力卡（${(page.cards || []).length}）`, JSON.stringify(page.cards))
    check((page.cards || []).every(c => !c.disabled), '有歌 → 两张卡都可点', JSON.stringify(page.cards))
    console.log(`  数据位置行：${page.pathRows} 个可打开目录的按钮`)
    await cdp.shot('14-workbench.png')

    // ==================== 3 ====================
    console.log('\n[3/6] 从工作台打开 AI 逐字歌词')
    const aiClicked = await cdp.evalJs(`(() => {
      const button = [...document.querySelectorAll('[data-view="workbench"] button')]
        .find(b => (b.textContent || '').includes('AI 逐字歌词'))
      if (!button) return 'no-button'
      if (button.disabled) return 'disabled'
      button.click()
      return 'clicked'
    })()`)
    await wait(2300)
    const aiTitles = JSON.parse(await modalTitles(cdp))
    check(aiClicked === 'clicked', `能力卡点了就开（${aiClicked}）`, `结果是 ${aiClicked}`)
    check(aiTitles.includes('AI 逐字歌词'), `对话框标题是「AI 逐字歌词」`, `h2 有：${aiTitles.join(' / ')}`)
    await cdp.shot('15-workbench-ai-lyric.png')
    check((await closeModal(cdp)) !== 'none', '对话框能关掉')

    // ==================== 4 ====================
    console.log('\n[4/6] 从工作台打开音源分离')
    const stemClicked = await cdp.evalJs(`(() => {
      const button = [...document.querySelectorAll('[data-view="workbench"] button')]
        .find(b => (b.textContent || '').includes('音源分离'))
      if (!button) return 'no-button'
      if (button.disabled) return 'disabled'
      button.click()
      return 'clicked'
    })()`)
    await wait(2300)
    const stemTitles = JSON.parse(await modalTitles(cdp))
    check(stemClicked === 'clicked', `能力卡点了就开（${stemClicked}）`, `结果是 ${stemClicked}`)
    check(stemTitles.includes('音源分离'), `对话框标题是「音源分离」`, `h2 有：${stemTitles.join(' / ')}`)
    await cdp.shot('16-workbench-stem.png')
    check((await closeModal(cdp)) !== 'none', '对话框能关掉')

    // ==================== 5 ====================
    console.log('\n[5/6] 播放详情页的常驻工具行')
    await cdp.evalJs("location.hash = '#/'")
    await wait(1400)
    const opened = await cdp.evalJs(`(() => {
      const trigger = document.querySelector('[class*="__picContent--"]')
      if (!trigger) return 'no-trigger'
      trigger.click()
      return 'clicked'
    })()`)
    await wait(1900)
    const tools = JSON.parse(await cdp.evalJs(`(() => {
      const view = document.querySelector('[data-view="play-detail"]')
      if (!view) return JSON.stringify({ open: false })
      const pills = [...view.querySelectorAll('button, a')]
        .filter(el => /^(分词|分离|工作台)$/.test((el.textContent || '').trim()))
      return JSON.stringify({
        open: true,
        pills: pills.map(el => ({ tag: el.tagName, text: el.textContent.trim(), href: el.getAttribute('href') || '' })),
      })
    })()`))
    check(opened === 'clicked', `打开了播放详情页（${opened}）`, `触发结果是 ${opened}`)
    check(tools.open, '播放详情页在', JSON.stringify(tools))
    check((tools.pills || []).length === 3, `工具行三个胶囊都在（${(tools.pills || []).length}）`, JSON.stringify(tools.pills))
    const jump = (tools.pills || []).find(p => p.text === '工作台')
    check(jump && jump.href === '#/workbench', '「工作台」胶囊是跳转链接（#/workbench）', JSON.stringify(jump))
    await cdp.shot('17-playdetail-tools.png')

    // ==================== 6 ====================
    console.log('\n[6/6] 工具行的「分词」打开的是同一个对话框')
    const clicked2 = await cdp.evalJs(`(() => {
      const view = document.querySelector('[data-view="play-detail"]')
      if (!view) return 'no-view'
      const button = [...view.querySelectorAll('button')].find(b => (b.textContent || '').trim() === '分词')
      if (!button) return 'no-button'
      button.click()
      return 'clicked'
    })()`)
    await wait(2300)
    const titles2 = JSON.parse(await modalTitles(cdp))
    check(clicked2 === 'clicked', `点到了「分词」（${clicked2}）`, `结果是 ${clicked2}`)
    check(titles2.includes('AI 逐字歌词'), '弹出的是同一个 AI 歌词对话框（LyricMenu 里的那两个入口也还在）', `h2 有：${titles2.join(' / ')}`)
    await cdp.shot('18-playdetail-ai-lyric.png')
    await closeModal(cdp)

    console.log('')
    if (failed === 0) console.log('PASS：侧栏入口 / 工作台页面 / 两个对话框 / 播放详情页工具行，六步全过')
    else console.log(`FAIL：${failed} 项未通过`)
  } finally {
    try {
      await closeModal(cdp)
      await closeDetail(cdp)
      await cdp.evalJs("location.hash = '#/'")
      if (songBackup) {
        await cdp.evalJs(`(() => {
          window.lxData.musicInfo.id = ${JSON.stringify(songBackup.id)}
          window.lxData.musicInfo.name = ${JSON.stringify(songBackup.name)}
          window.lxData.musicInfo.singer = ${JSON.stringify(songBackup.singer)}
        })()`)
      }
    } catch (error) {
      console.log('  收尾时出错（不影响结论）：', error.message)
    }
    cdp.ws.close()
    process.exit(failed === 0 ? 0 : 1)
  }
})().catch(error => {
  console.error('\n验收脚本失败：', error.message)
  process.exit(1)
})
