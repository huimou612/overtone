/**
 * 泛音 0.4.0 (Folia in-app) 快速生产构建入口。
 *
 * 背景：完整 `npm run pack` 会先 del.sync(['dist/**', 'build/**'])，再并行构建
 * main / renderer / renderer-lyric / renderer-scripts 四套 webpack，并对整个
 * React + three + pixi 依赖树跑 Terser + source map。在本机该过程超过 10 分钟，
 * 且会清掉桌面正式版正在使用的 dist 与已产出的安装包。
 *
 * 本脚本只重建 renderer 一份，关闭 Terser 与 source map（桌面端不需要），
 * 输出到既有 dist，属于增量构建，不清目录、不触碰 build/。
 * 产出的 dist/renderer.js 需自行同步进 app.asar（见 FOLIA-INAPP.md）。
 *
 * 用法：npm run build:folia
 */
process.env.NODE_ENV = 'production';

const webpack = require('webpack');
const cfg = require('./renderer/webpack.config.prod');

cfg.devtool = false;
cfg.optimization = cfg.optimization || {};
cfg.optimization.minimize = false;
cfg.optimization.minimizer = [];

const started = Date.now();
console.log('[build:folia] start', new Date().toISOString());

const compiler = webpack(cfg);
compiler.run((err, stats) => {
  const finish = (code) => compiler.close(() => process.exit(code));

  if (err) {
    console.error('FATAL', err.stack || err);
    finish(1);
    return;
  }

  const info = stats.toJson({ all: false, errors: true, warnings: true });
  if (stats.hasErrors()) {
    console.error('BUILD_ERRORS count=' + info.errors.length);
    for (const e of info.errors) console.error((e.message || String(e)).slice(0, 5000));
    finish(1);
    return;
  }

  console.log('BUILD_OK', Date.now() - started, 'ms',
              'warnings=' + (info.warnings ? info.warnings.length : 0));
  finish(0);
});
