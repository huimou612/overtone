/**
 * 驱动界面验证「外观与个性化」设置分组：导航到设置页 → 点开分组 → 读回控件文案 → 截图。
 *
 * 为什么不用肉眼看编译结果：lint 与 webpack 都过了，但 `base-selection` 的 list 形状、`base-input`
 * 的 placeholder 这类东西错了不会编译报错，只会渲染成空白。所以这里读的是真实 DOM 的文本。
 */
const WebSocket = require('ws')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const PORT = 9222
const OUT_DIR = path.join(__dirname, '..', 'notes', 'preview', 'splash')
const TAB_LABEL = '外观与个性化'

const wait = ms => new Promise(resolve => { setTimeout(resolve, ms) })

const getTargets = () => new Promise((resolve, reject) => {
  http.get(`http://127.0.0.1:${PORT}/json`, response => {
    let body = ''
    response.on('data', chunk => { body += chunk })
    response.on('end', () => {
      try { resolve(JSON.parse(body)) } catch (error) { reject(error) }
    })
  }).on('error', reject)
})

class Cdp {
  constructor(ws) {
    this.ws = ws
    this.nextId = 0
    this.pending = new Map()
  }

  static async connect(url) {
    const ws = new WebSocket(url)
    await new Promise((resolve, reject) => {
      ws.once('open', resolve)
      ws.once('error', reject)
    })
    const cdp = new Cdp(ws)
    ws.on('message', data => {
      const message = JSON.parse(data)
      const slot = cdp.pending.get(message.id)
      if (!slot) return
      cdp.pending.delete(message.id)
      if (message.error) slot.reject(new Error(JSON.stringify(message.error)))
      else slot.resolve(message.result)
    })
    return cdp
  }

  send(method, params) {
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params: params ?? {} }))
    })
  }

  async eval(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'eval failed')
    return result.result.value
  }
}

async function main() {
  const targets = await getTargets()
  const pages = targets.filter(item => item.type === 'page' && String(item.url).startsWith('http'))
  if (!pages.length) throw new Error('找不到主窗口页面，应用没起来？')
  const cdp = await Cdp.connect(pages[0].webSocketDebuggerUrl)
  console.log('调试目标：', pages[0].title)

  console.log('\n[1/4] 导航到设置页')
  await cdp.eval("location.hash = '#/setting'")
  await wait(2500)

  const tabTexts = await cdp.eval("JSON.stringify([...document.querySelectorAll('[role=\"tab\"]')].map(e => e.textContent.trim()))")
  console.log('  侧栏分组：', tabTexts)

  console.log('\n[2/4] 点开分组：', TAB_LABEL)
  const clicked = await cdp.eval(`(() => {
    const tab = [...document.querySelectorAll('[role="tab"]')].find(e => e.textContent.trim() === ${JSON.stringify(TAB_LABEL)})
    if (!tab) return false
    tab.click()
    return true
  })()`)
  if (!clicked) throw new Error(`找不到分组「${TAB_LABEL}」`)
  await wait(1500)

  console.log('\n[3/4] 读回控件')
  const dump = await cdp.eval(`(() => {
    const panel = document.querySelector('dl')
    const text = (panel ? panel.textContent : '').replace(/\\s+/g, ' ').trim()
    const inputs = [...document.querySelectorAll('input[type="text"], input:not([type])')].map(e => ({ placeholder: e.placeholder, value: e.value }))
    const buttons = [...document.querySelectorAll('button')].map(e => e.textContent.trim()).filter(Boolean)
    const selected = [...document.querySelectorAll('select, [class*="selection" i]')].length
    return JSON.stringify({ text, inputs, buttons, selected })
  })()`)
  const info = JSON.parse(dump)
  console.log('  面板正文：', info.text.slice(0, 700))
  console.log('  输入框：', JSON.stringify(info.inputs))
  console.log('  按钮：', JSON.stringify(info.buttons))

  fs.mkdirSync(OUT_DIR, { recursive: true })
  console.log('\n[4/4] 截图')
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  const target = path.join(OUT_DIR, '03-settings-appearance.png')
  fs.writeFileSync(target, Buffer.from(shot.data, 'base64'))
  console.log('  →', target, fs.statSync(target).size, 'B')

  const problems = []
  if (!info.text.includes('启动动画')) problems.push('面板里没有「启动动画」')
  if (!info.text.includes('显示启动动画')) problems.push('面板里没有开关文案')
  if (!info.text.includes('自定义图片')) problems.push('面板里没有「自定义图片」')
  if (!info.text.includes('最短显示时长')) problems.push('面板里没有「最短显示时长」')
  if (!info.inputs.some(item => String(item.placeholder).includes('应用名'))) problems.push('标题输入框的 placeholder 不对')

  cdp.ws.close()
  if (problems.length) {
    console.log('\nFAIL：')
    for (const problem of problems) console.log('  -', problem)
    process.exitCode = 1
    return
  }
  console.log('\nPASS：分组、开关、图片行、标题输入框、时长选择都在')
}

main().catch(error => {
  console.error('失败：', error.message)
  process.exitCode = 1
})
