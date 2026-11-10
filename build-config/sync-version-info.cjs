/**
 * 发版版本源同步器
 *
 * 背景：软件内「检查更新」弹窗显示的「最新版本」读的是
 * `publish/version.json`（多 CDN 镜像，国内可达），而下载安装包走的是
 * electron-updater → GitHub Release 的 `latest.yml`。这是两套独立的版本源。
 * 0.4.0 发版时只更新了 package.json / latest.yml，漏了 version.json，
 * 结果出现「软件已是 0.4.0，检查更新却显示最新版本 0.2.0」。
 *
 * 这个脚本挂在构建入口上：只要 package.json 版本号变了，
 * 就自动把旧版本归档进 history 并写回 version.json，从根上避免再次漏同步。
 *
 * 也可以单独运行：npm run version:sync
 */
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const pkgPath = path.join(root, 'package.json')
const infoPath = path.join(root, 'publish', 'version.json')

const REPO = 'huimou612/overtone'

function sync() {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  const version = pkg.version
  let info = { version: '0.0.0', desc: '', history: [] }

  try {
    info = JSON.parse(fs.readFileSync(infoPath, 'utf8'))
  } catch (err) {
    console.warn('[version:sync] publish/version.json 读取失败，将重建：', err.message)
  }

  if (info.version === version) {
    console.log(`[version:sync] 版本源已是 ${version}，无需改动`)
    return false
  }

  const history = Array.isArray(info.history) ? info.history : []
  // 把上一个版本归档，避免历史版本丢失
  if (info.version && info.version !== '0.0.0' && !history.some(item => item.version === info.version)) {
    history.unshift({ version: info.version, desc: info.desc || '' })
  }

  const next = {
    version,
    // 旧 desc 已经随旧版本归档到 history；新版本给一条指向 Release 的说明，
    // 发版时可再手工补成完整更新日志。
    desc: `泛音 v${version} 已发布。\n\n- 完整更新说明见 GitHub Release：https://github.com/${REPO}/releases/tag/v${version}`,
    history,
  }

  fs.mkdirSync(path.dirname(infoPath), { recursive: true })
  fs.writeFileSync(infoPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  console.log(`[version:sync] ${info.version || '(空)'} → ${version}，旧版本已归档到 history`)
  return true
}

if (require.main === module) sync()

module.exports = sync
