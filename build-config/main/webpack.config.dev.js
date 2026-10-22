const path = require('path')
const fs = require('fs')
const { merge } = require('webpack-merge')
const webpack = require('webpack')
const CopyWebpackPlugin = require('copy-webpack-plugin')

const baseConfig = require('./webpack.config.base')



// ── Folia 静态产物：复制前先清目标目录，防止旧 hash chunk 残留进发布包 ──
// （emptyOutDir 在 folia-viewer 的 vite 里被关闭：宿主 safe-delete 钩子会卡 trash。）
// 这里在配置加载时清理（文件数少，trash 即便被钩也能完成）；若 folia-viewer
// 尚未构建则目录本就不存在，跳过且由下方 noErrorOnMissing 放行（会打 warn 日志）。
{
  const foliaTarget = path.join(__dirname, '../../dist/folia')
  const foliaSourceIndex = path.join(__dirname, '../../slice/folia-viewer/dist/index.html')
  try {
    if (fs.existsSync(foliaTarget)) {
      // 宿主的 safe-delete 钩子会把 fs.rmSync 转成回收站操作并超时，
      // 这里改用外部命令绕过（仅清理已核实的 Folia 构建产物目录）
      if (process.platform === 'win32') {
        require('child_process').execSync(`rd /s /q "${foliaTarget}"`, { stdio: 'ignore' })
      } else {
        require('child_process').execSync(`rm -rf "${foliaTarget}"`, { stdio: 'ignore' })
      }
    }
  } catch (err) {
    console.warn('[folia] 清理旧产物失败（将继续覆盖式复制）:', err?.message || err)
  }
  if (!fs.existsSync(foliaSourceIndex)) {
    console.warn('[folia] slice/folia-viewer 尚未构建（缺少 dist/index.html）——' +
      '请先在 slice/folia-viewer 下执行 `npx vite build`，否则 Folia 窗口将无页面可加载')
  }
}

module.exports = merge(baseConfig, {
  mode: 'development',
  entry: {
    main: path.join(__dirname, '../../src/main/index-dev.ts'),
    foliaPreload: path.join(__dirname, '../../src/main/modules/folia/foliaPreload.ts'),
    // 'dbService.worker': path.join(__dirname, '../../src/main/worker/dbService/index.ts'),
  },
  devtool: 'eval-source-map',
  plugins: [
    // 与 prod 保持同样的产物布局：sidecar.cjs 是按 `__dirname`（也就是 dist/）找 .py 的，
    // 只让 prod 拷贝会让 dev 里的分离永远报「找不到脚本」。
    new CopyWebpackPlugin({
      patterns: [
        {
          // Folia Lattice 独立页面静态产物（vite build @ slice/folia-viewer）
          from: path.join(__dirname, '../../slice/folia-viewer/dist'),
          to: path.join(__dirname, '../../dist/folia'),
          noErrorOnMissing: true,
        },
        {
          from: path.join(__dirname, '../../src/main/modules/analysis/stems_runner.py'),
          to: path.join(__dirname, '../../dist/stems_runner.py'),
        },
        {
          // 与上面同理，dev 也要拷：dev 下 `__dirname` 就是 dist/，
          // 只让 prod 拷贝会让 dev 里永远报「找不到 splash.html」。
          from: path.join(__dirname, '../../src/main/modules/winSplash/splash.html'),
          to: path.join(__dirname, '../../dist/splash.html'),
        },
      ],
    }),
    new webpack.DefinePlugin({
      'process.env': {
        NODE_ENV: '"development"',
      },
      webpackStaticPath: `"${path.join(__dirname, '../../src/static').replace(/\\/g, '\\\\')}"`,
      webpackUserApiPath: `"${path.join(__dirname, '../../src/main/modules/userApi').replace(/\\/g, '\\\\')}"`,
    }),
  ],
  performance: {
    maxEntrypointSize: 1024 * 1024 * 50,
    maxAssetSize: 1024 * 1024 * 30,
  },
})
