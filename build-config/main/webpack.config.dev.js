const path = require('path')
const { merge } = require('webpack-merge')
const webpack = require('webpack')
const CopyWebpackPlugin = require('copy-webpack-plugin')

const baseConfig = require('./webpack.config.base')


module.exports = merge(baseConfig, {
  mode: 'development',
  entry: {
    main: path.join(__dirname, '../../src/main/index-dev.ts'),
    // 'dbService.worker': path.join(__dirname, '../../src/main/worker/dbService/index.ts'),
  },
  devtool: 'eval-source-map',
  plugins: [
    // 与 prod 保持同样的产物布局：sidecar.cjs 是按 `__dirname`（也就是 dist/）找 .py 的，
    // 只让 prod 拷贝会让 dev 里的分离永远报「找不到脚本」。
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.join(__dirname, '../../src/main/modules/analysis/stems_runner.py'),
          to: path.join(__dirname, '../../dist/stems_runner.py'),
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
