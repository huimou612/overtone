# folia-viewer —— Folia 歌词舞台宿主应用（路线 B / P1）

把 `slice/lattice-lyrics`（从 Folia 提取的真 PixiJS lattice 歌词切片）真正跑起来的
宿主应用：独立 Vite + React + TypeScript，依赖与主应用完全隔离。

## 它做什么

- **桥接入**：主进程数据桥（`src/main/modules/folia/`）经 preload 暴露
  `window.foliaBridge`（`close / ready / onMessage`）。本应用订阅快照/增量消息
  （协议形状见 `src/common/foliaProtocol.ts`），seq 单调校验。
- **时钟**（`src/playbackClock.ts`）：锚点 + 插值 —— 消息打锚点，rAF 以
  本地流逝 × 倍率推算当前时间写进 framer-motion `MotionValue`（切片正是订阅
  它唤醒帧循环的）；暂停冻结；seek/切歌（漂移 ≥ 80ms）直接跳齐，小漂移不打断；
  窗口隐藏停 rAF，恢复可见时用 `ready()` 重新请求快照对齐。
- **歌词适配**（`src/lyricAdapter.ts`，P2 最小版）：`lxlyric` 逐字优先 →
  带 `<start,duration>` 的增强 LRC → 行级 LRC 整行一词；`tlyric` 按时间戳
  就近对齐为副行翻译。输出切片的 `Line[]`（秒）。
- **Provider 供给**（`src/App.tsx`）：按切片契约组装
  `LatticeLyricsProvider` 的 source（`currentTime / currentLineIndex / lines /
  theme / subtitleTheme / showSubtitleTranslation / hideTranslationSubtitle /
  subtitleContentMode / paused / staticMode` + `songKey`），
  渲染 `<LatticeLyrics tile reducedMotion />`。切片本体零改动。
- **主题**（`src/theme.ts`）：内置深色主题；有封面时采样封面主色替换 accent。
- **Mock 模式**：桥缺席（普通浏览器打开）时自动载入内置演示歌曲循环播放，
  页面永远不是黑屏 —— 冒烟测试/无宿主联调用。

## 跑起来

```bash
cd slice/folia-viewer
npm install
npm run dev      # http://localhost:9090 —— 主进程 dev 模式直接连这个地址
npm run build    # 产物 dist/（tsc --noEmit + vite build）
```

- **应用内（dev）**：先起上面的 dev 服务，再启动泛音主应用（dev 模式），
  打开 Folia 视觉窗口即是本应用；放一首带逐字歌词的歌即可看真实歌曲的 lattice。
- **应用内（prod）**：先 `npm run build` 本应用，再构建主应用 ——
  主进程 webpack（`build-config/main/webpack.config.prod.js`）会把
  `slice/folia-viewer/dist/` 复制到 `dist/folia/`，窗口以 file:// 加载。
- **单独看**：`npm run preview` 或直接用浏览器打开 `dist/index.html`，
  自动进 mock 演示模式。

## 注意事项

- 本目录在仓库根 `.gitignore` 的 `slice/` 规则内：**新增文件提交时需要
  `git add -f`**（`lattice-lyrics` 当初也是这样入库的）。
- 依赖版本锁定在本包 `package.json`：pixi.js 8.x（切片 `loadPixi.ts` 按
  Pixi 8 API 编写）、react 19、framer-motion 12 —— 不要装进主应用。
- 窗口是无边框的：整窗可拖（`-webkit-app-region: drag`），
  右上角有悬停才显的关闭热区（桥在场时调 `foliaBridge.close()`），
  主进程另有 Esc 关窗兜底。
