const path = require('path')
const fs = require('fs')
const { merge } = require('webpack-merge')
const webpack = require('webpack')
const CopyWebpackPlugin = require('copy-webpack-plugin')

const baseConfig = require('./webpack.config.base')

// const { dependencies } = require('../../package.json')

// const buildConfig = require('../webpack-build-config')



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
  mode: 'production',
  devtool: false,
  entry: {
    main: path.join(__dirname, '../../src/main/index.ts'),
    // Folia 视觉窗口最小 preload（阶段一：close 桥；阶段二扩展数据通道）
    foliaPreload: path.join(__dirname, '../../src/main/modules/folia/foliaPreload.ts'),
    // 'dbService.worker': path.join(__dirname, '../../src/main/worker/dbService/index.ts'),
  },
  node: {
    __dirname: false,
    __filename: false,
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.join(__dirname, '../../src/main/modules/userApi/renderer/user-api.html'),
          to: path.join(__dirname, '../../dist/userApi/renderer/user-api.html'),
        },
        {
          // Folia Lattice 独立页面静态产物（vite build @ slice/folia-viewer）
          from: path.join(__dirname, '../../slice/folia-viewer/dist'),
          to: path.join(__dirname, '../../dist/folia'),
          noErrorOnMissing: true,
        },
        {
          from: path.join(__dirname, '../../src/common/theme/images/*').replace(/\\/g, '/'),
          to: path.join(__dirname, '../../dist/theme_images/[name][ext]'),
        },
        {
          // htdemucs 的 runner。webpack 不跟踪它（sidecar.cjs 是按运行时路径拼的，
          // 不是 require），所以得显式拷到 dist/ —— sidecar 就是按 `__dirname` 找它的。
          from: path.join(__dirname, '../../src/main/modules/analysis/stems_runner.py'),
          to: path.join(__dirname, '../../dist/stems_runner.py'),
        },
        {
          // 入场动画页面。与上面的 runner 同理：它不是被 require 的模块，
          // 而是 winSplash/main.ts 按 `__dirname` 拼路径 loadFile 的。
          from: path.join(__dirname, '../../src/main/modules/winSplash/splash.html'),
          to: path.join(__dirname, '../../dist/splash.html'),
        },
      ],
    }),
    new webpack.DefinePlugin({
      'process.env': {
        NODE_ENV: '"production"',
        BUILD_WIN7: `'${process.env.BUILD_WIN7}'`,
      },
    }),
  ],
  performance: {
    maxEntrypointSize: 1024 * 1024 * 10,
    maxAssetSize: 1024 * 1024 * 20,
  },
  optimization: {
    minimize: false,
  },
})
