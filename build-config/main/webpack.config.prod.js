const path = require('path')
const { merge } = require('webpack-merge')
const webpack = require('webpack')
const CopyWebpackPlugin = require('copy-webpack-plugin')

const baseConfig = require('./webpack.config.base')

// const { dependencies } = require('../../package.json')

// const buildConfig = require('../webpack-build-config')


module.exports = merge(baseConfig, {
  mode: 'production',
  devtool: false,
  entry: {
    main: path.join(__dirname, '../../src/main/index.ts'),
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
