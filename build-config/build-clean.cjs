/**
 * 干净生产构建（0.4.0 发版用）。
 *
 * 与 `npm run build`（build-config/pack.js）的区别：
 * - pack.js 会 del.sync(['dist/**', 'build/**'])，把已有安装包和桌面正式版在用的
 *   dist 一起删掉，再对四套 webpack 跑 Terser + source map，本机耗时极长。
 * - 本脚本只清 dist 内的历次增量残留（1944 个旧 chunk / 18 个 css），不清 build/，
 *   并关闭 Terser / source map（桌面端不需要）。
 *
 * 构建完再执行 `npm run pack:win:setup:x64` 生成 0.4.0 安装包与 latest.yml。
 * 用法：npm run build:clean
 */
process.env.NODE_ENV = 'production';

const fs = require('fs');
const path = require('path');
const webpack = require('webpack');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

// 用 O(1) 的目录重命名代替逐个 fs.rmSync：Windows + 实时防护下，逐个删 5845 个
// 残留文件要 20 分钟以上（webpack 还没开始跑就先卡死在清理阶段）。
// 旧 dist 整体挪进 build/（已被 .gitignore 忽略、同盘，重命名瞬时完成），
// 既是干净构建的起点，也留作额外备份。
if (fs.existsSync(dist) && fs.readdirSync(dist).length) {
  const stale = path.join(root, 'build', `dist-stale-${Date.now()}`);
  fs.mkdirSync(path.dirname(stale), { recursive: true });
  fs.renameSync(dist, stale);
  console.log('[build:clean] retired old dist ->', stale);
}
fs.mkdirSync(dist, { recursive: true });
console.log('[build:clean] dist cleared', new Date().toISOString());

const names = ['main', 'renderer', 'renderer-lyric', 'renderer-scripts'];
const tasks = names.map(name => {
  const cfg = require(path.join(__dirname, name, 'webpack.config.prod'));
  cfg.devtool = false;
  cfg.optimization = cfg.optimization || {};
  cfg.optimization.minimize = false;
  cfg.optimization.minimizer = [];
  return { name, cfg };
});

const started = Date.now();
const run = ({ name, cfg }) => new Promise(resolve => {
  const t = Date.now();
  const compiler = webpack(cfg);
  compiler.run((err, stats) => {
    const done = (ok, msg) => compiler.close(() => {
      console.log(`[${name}] ${ok ? 'OK' : 'FAIL'} ${Date.now() - t}ms ${msg}`);
      resolve({ name, ok });
    });
    if (err) return done(false, err.stack || String(err));
    const info = stats.toJson({ all: false, errors: true, warnings: true });
    if (stats.hasErrors()) {
      for (const e of info.errors.slice(0, 5)) {
        console.error(`[${name}] ERROR`, (e.message || String(e)).slice(0, 2000));
      }
      return done(false, `${info.errors.length} errors`);
    }
    done(true, `warnings=${(info.warnings || []).length}`);
  });
});

Promise.all(tasks.map(run)).then(results => {
  const bad = results.filter(r => !r.ok);
  console.log('[build:clean]', bad.length ? 'BUILD_FAILED ' + bad.map(b => b.name).join(',') : 'BUILD_OK',
              Date.now() - started, 'ms');
  process.exit(bad.length ? 1 : 0);
});
