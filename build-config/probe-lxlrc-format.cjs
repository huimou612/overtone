// 探索 LX 的逐字歌词解析器的真实行为。
// font-player.js 用的是：
//   const fontSplitRxp = /(?=<\d+,\d+>).*?/g
//   const timeRxpAll = /<(\d+),(\d+)>/g
//   const timeRxp = /<(\d+),(\d+)>/
// 这里把 _parseLyric 的核心逻辑抽出来单独跑，确认「什么样的一行字符串
// 才能被正确解析成逐字模式」，而不是靠猜。
const fontSplitRxp = /(?=<\d+,\d+>).*?/g
const timeRxpAll = /<(\d+),(\d+)>/g
const timeRxp = /<(\d+),(\d+)>/

const fontTimeExp = /<(\d+),(\d+)>/g

function trace(label, lyric) {
  const fonts = lyric.split(fontSplitRxp)
  console.log(`\n${'='.repeat(66)}`)
  console.log(`[${label}]`)
  console.log(`  lyric = ${JSON.stringify(lyric)}`)
  console.log(`  split -> ${JSON.stringify(fonts)}`)

  // 复刻 _parseLyric 的判定
  const segs = []
  let mode = 'font'
  for (const font of fonts) {
    if (!timeRxp.test(font)) {
      mode = 'LINE  <-- 整行退化为普通模式，_handleLineParse() 会把原始字符串当正文显示'
      break
    }
    const t = font.replace(timeRxp, '')
    segs.push({ text: t, startTime: parseInt(RegExp.$1), time: parseInt(RegExp.$2) })
  }
  console.log(`  mode = ${mode}`)
  if (mode === 'font') {
    for (const s of segs) {
      console.log(`     text=${JSON.stringify(s.text).padEnd(16)} startTime=${String(s.startTime).padStart(5)}  time=${s.time}`)
    }
    const joined = segs.map(s => s.text).join('')
    const stripped = lyric.replace(fontTimeExp, '')
    console.log(`  拼接文本 = ${JSON.stringify(joined)}`)
    console.log(`  去时间后 = ${JSON.stringify(stripped)}   ${joined === stripped ? '一致 OK' : '**不一致**'}`)
  } else {
    console.log(`     会把 ${JSON.stringify(lyric)} 原样当正文显示（含尖括号时间标记）`)
  }
}

console.log('fontSplitRxp =', fontSplitRxp)
console.log('timeRxp      =', timeRxp)

trace('标准三词行', '<0,500>把<500,300>回忆<800,400>拼好')
trace('行首没有时间标记', '把<0,500>回忆')
trace('空行 + <0,0>', '<0,0>')
trace('空字符串', '')
trace('只有文字（普通 lrc 行）', '把回忆拼好给你')
trace('结束时间超过行内总和', '<0,500>把<500,300>回忆<800,400>拼好')

// 模拟 index.js 的整曲闸门
console.log('\n' + '='.repeat(66))
console.log('index.js:117 的全曲闸门：this.isLineMode = lyricLines.length && !/^<\\d+,\\d+>/.test(lyricLines[0].text)')
for (const first of ['<0,500>把', '把回忆', '', '<0,0>', '作词 : 某人']) {
  const isLineMode = !/^<\d+,\d+>/.test(first)
  console.log(`  首行 text=${JSON.stringify(first).padEnd(14)} -> 全曲 isLineMode=${isLineMode}`)
}
