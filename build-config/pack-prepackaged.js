'use strict'

/**
 * 用已组装好的目录直接打 NSIS 安装包（prepackaged 模式）。
 *
 * 为什么单独写一个：`npm run pack:win:setup:x64` 会重新下载 Electron 运行时，
 * 网络不稳定时会一直 socket hang up。prepackaged 跳过下载与解包，
 * 直接拿 build/win-unpacked 去生成安装包，产物路径/命名与原脚本一致。
 *
 * 用法：node build-config/pack-prepackaged.js
 */
const path = require('node:path')
const builder = require('electron-builder')

const root = path.resolve(__dirname, '..')

builder.build({
  prepackaged: path.join(root, 'build', 'win-unpacked'),
  publish: 'never',
  config: {
    appId: 'asia.cunchu.overtone',
    productName: 'overtone',
    artifactName: '${productName}-v${version}-x64-Setup.${ext}',
    directories: {
      output: path.join(root, 'build'),
      buildResources: path.join(root, 'resources'),
    },
    win: {
      icon: path.join(root, 'resources', 'icons', 'icon.ico'),
      legalTrademarks: 'overtone',
    },
    nsis: {
      oneClick: false,
      language: '2052',
      allowToChangeInstallationDirectory: true,
      license: path.join(root, 'licenses', 'license.rtf'),
      shortcutName: '泛音',
    },
  },
}).then(() => {
  console.log('done')
}).catch(err => {
  console.error(err)
  process.exit(1)
})
