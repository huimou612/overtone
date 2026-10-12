// 校验 createThemes.js 里 syncIndexLessFallback 的变量映射是否与 index.less 实际内容一致。
//
// 思路：index.less 当前的 :root 兜底色是按「绿意盎然」(rgb(77,175,124)) 生成的。
// 用同一套 createThemeColors 重算一遍，逐变量比对——
//   · 全部一致  -> 映射正确，把默认主题换成靛紫是安全的
//   · 有差异    -> 打印差异，说明映射或算法理解有误，不能贸然替换
//
// 用法：node notes/validate_theme_fallback.js

const fs = require('fs')
const path = require('path')

const APP = path.join(__dirname, '../app')
const { createThemeColors } = require(path.join(APP, 'src/common/theme/utils'))

const GREEN = 'rgb(77, 175, 124)'
const FONT = 'rgb(33, 33, 33)'

const lessPath = path.join(APP, 'src/renderer/assets/styles/index.less')
const lines = fs.readFileSync(lessPath, 'utf-8').split('\n')

const start = lines.findIndex((l) => /^\s*:root\s*\{\s*$/.test(l))
let end = -1
for (let i = start + 1; i < lines.length; i += 1) {
  if (/^\s*\}\s*$/.test(lines[i])) { end = i; break }
}
console.log(`:root 块位于 index.less 第 ${start + 1} ~ ${end + 1} 行，共 ${end - start - 1} 行`)

const colors = createThemeColors(GREEN, FONT, false, false)

const inBlock = new Map()      // var -> 文件里的值
const outOfMap = []            // 块内、但不在生成结果里的变量（应保持原样）
for (let i = start + 1; i < end; i += 1) {
  const m = /^(\s*)(--[\w-]+):\s*(.+?);\s*$/.exec(lines[i])
  if (!m) continue
  const name = m[2]
  inBlock.set(name, m[3])
  if (colors[name] == null) outOfMap.push(`${name}: ${m[3]}`)
}

const same = []
const diff = []
const missing = []
for (const [name, current] of inBlock) {
  if (colors[name] == null) continue
  if (colors[name] === current) same.push(name)
  else diff.push({ name, current, generated: colors[name] })
}

for (const name of Object.keys(colors)) {
  if (!inBlock.has(name)) missing.push(name)
}

console.log(`\n生成器产出变量 ${Object.keys(colors).length} 个`)
console.log(`块内命中生成器的变量 ${same.length + diff.length} 个`)
console.log(`  值一致 : ${same.length}`)
console.log(`  值不同 : ${diff.length}`)
console.log(`生成器有、但块内没有: ${missing.length}`)
console.log(`块内有、但生成器不管(原样保留): ${outOfMap.length}`)

if (diff.length) {
  console.log('\n--- 值不同的变量 ---')
  for (const d of diff.slice(0, 40)) {
    console.log(`  ${d.name}\n     文件: ${d.current}\n     生成: ${d.generated}`)
  }
}
if (missing.length) {
  console.log('\n--- 生成器有但块内缺失 ---')
  for (const m of missing.slice(0, 20)) console.log(`  ${m} = ${colors[m]}`)
}
if (outOfMap.length) {
  console.log('\n--- 块内保留原样的变量 ---')
  for (const o of outOfMap) console.log(`  ${o}`)
}

console.log(
  diff.length === 0 && missing.length === 0
    ? '\n结论：映射正确 ✅ 可以把默认主题换成靛紫，index.less 会由脚本精确重算'
    : '\n结论：存在差异 ⚠️ 先修映射再替换默认主题',
)
