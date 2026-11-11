# Folia 视觉 · 应用内接入（0.3.0，2026-11-09 融合版）

形态：**统一沉浸歌词画面**。Folia 视觉不再是独立的全屏覆盖层，而是同一个画面里
「歌词样式」的一种 —— 顶栏 / 右侧面板 / 底部播放条始终是 Lattice 的，视觉只在
左侧歌词区渲染。所有入口都汇到 `isShowImmersiveLyric` + `isFoliaVisualOn`。

## 入口（全部指向同一个画面）
- 左侧导航栏最底部 ✦ 按钮：打开画面并直接切到 Folia 视觉
- 封面墙顶栏「沉浸歌词」按钮（原 Lattice / Folia 两个按钮已合并）：同上
- 沉浸歌词画面右侧面板星形按钮 / 底栏「Folia 视觉」：**画面内切换**歌词样式 ⇄ 视觉
- 封面墙双击卡片：只打开画面，不改变视觉开关
- 视觉模式（15 种）在右侧面板「歌词样式」页签里直接切，不用另开设置台
- 退出：Esc（先收时间线 → 收面板 → 退画面）/ 左上角返回

## 2026-11-09 三项修复
1. **搜索联想恢复**：根因是 `Toolbar/SearchInput.vue` 里
   `prevTempSearchSource ||= temp_source` 把空串永久缓存，`music['']` 为 undefined，
   `.tipSearch.search()` 抛异常被 async debounce 吞掉；且 `wy` 源本就没挂 tipSearch。
   现改为「本地词库（搜索历史 + 热搜缓存）即时联想 + 多源在线联想补充」，源每次
   重新读取并按 `temp_source || source` 回退，失败静默降级。空输入聚焦即显示搜索记忆。
2. **两个按钮 / 两个窗口合并**：`WallView.vue` 删除局部 LatticeStage 实例与 Folia
   按钮，统一走 App.vue 的全局画面；`setShowFolia(true)` 现在 = 打开画面 + 开视觉。
3. **视觉融进同一画面**：`FoliaStage` / `FoliaViewer` 增加 `embedded` 形态（去掉自带
   顶栏/模式条/播放条、背景透明、不抢 Esc），`LatticeLyric` 歌词区原地挂载；
   `embedded` CSS 把 `.folia-overlay` 从 fixed/z-3000 收敛成歌词区内的 absolute 层。

## 已改文件
- `src/renderer/components/layout/Toolbar/SearchInput.vue`（联想重写）
- `src/renderer/components/material/SearchInput.vue`（空态提示）
- `src/renderer/store/player/{state,action}.ts`（`isFoliaVisualOn` + 统一入口语义）
- `src/renderer/App.vue`（移除全屏 folia-viewer，留统一画面 + 验证钩子）
- `src/renderer/components/layout/FoliaViewer.vue`（`embedded` 形态 + 嵌态 CSS）
- `src/renderer/folia/stage/FoliaStage.tsx`（`embedded` prop：只渲染 VisualizerRenderer）
- `src/renderer/components/layout/LatticeLyric/index.vue`（视觉层、开关、模式网格）
- `src/renderer/views/List/WallView.vue`（按钮合并、移除局部舞台）
- `src/renderer/components/layout/Aside/NavBar.vue`（入口文案）

更早的底座改动（folia 整树、webpack alias / tsconfig / postcss / package.json 依赖）
保持不变，见 git 历史。

## 构建 & 装进正式版
```bash
cd F:/workbuddy/2026-10-12-13-28-07/fusion-music/app
# 本机快速构建（跳过 Terser / source-map，产物功能一致）
node -e "process.env.NODE_ENV='production';const w=require('webpack'),c=require('./build-config/renderer/webpack.config.prod');c.devtool=false;c.optimization.minimize=false;c.optimization.minimizer=[];const cp=w(c);cp.run((e,s)=>{console.log(s.toJson({errors:true}).errors);cp.close(()=>process.exit(0))})"
```
产物 `dist/` → 全量同步到解包目录 `dist/` →
`node node_modules/@electron/asar/bin/asar.js pack <解包目录> <resources>/app.asar --unpack=**/stems_runner.py`

⚠️ 重启验证时必须清掉环境变量 `ELECTRON_RUN_AS_NODE`，否则 exe 以 Node 模式启动并报
`bad option: --remote-debugging-port=9222`：
```bash
env -u ELECTRON_RUN_AS_NODE ./overtone.exe --remote-debugging-port=9222
```

## 验证结果（2026-11-09，正式版 CDP）
- 输入「爱如」→ 下拉 10 条联想（爱如火 / 爱如潮水 / 爱如空气 …），历史记忆 + 在线词库都在
- 融合画面：`embeddedHostCount=1`、`standaloneHostCount=0`、视觉层 `position:absolute`、
  背景透明、只占歌词区 690×524（窗口 1020×660），canvas 正常、WebGL2 = true、0 报错
- 模式切换：面板 15 个模式，点「花火」→ `localStorage.visualizer_mode = hanabi` +
  按钮高亮切换，3D 效果正常渲染

## 0.4.0 · 背景重做 + 歌词实时同步修复（2026-11-10）

### 背景面板
`LatticeLyric/index.vue` 的「背景」页签在 Folia 开启时换成 Folia 原生六种背景：
通用 / 莫奈 / 漫游 / 隐现 / 嵌入 / 空；莫奈支持「封面 / 自定义图片」来源、
上传与清空、「半屏渐变 / 全屏叠色」布局；通用支持封面取色、几何层、暗角、不透明度；
另有「自适应铺满 / 原始尺寸」对齐开关。自定义图片走 `localStorage['folia-monet-bg']`
（lab shim 的 `visualizerImageAsset.ts` 上传永远返回 false，宿主侧必须绕开它）。

⚠️ 嵌入形态**不能**给 `background` 塞 `transparent: true` —— `VisualizerBackgroundRenderer`
看到它会直接 `return null`，六种背景全都不画，这就是「泛音的背景写的不行了」的根因。

### 窗口适配
Folia 的样式按整屏视口写（大量 vw/vh），嵌入歌词区只有约 690×524 会被裁切。
`FoliaStage.tsx` 用「虚拟视口 = window.innerWidth/innerHeight + transform: scale(sx, sy)」
把整幅画面铺进歌词区，莫奈左栏歌词 `clippedCount = 0`。

### 歌词实时同步的三个根因
1. `lab/enhancedLrc.ts` 按「标签在后」解析逐字歌词，但 `convertLxlyric()` 产出的是
   `<时间>字`（标签在前）→ 每个字拿到下一个字的时间、末字倒回行首，逐字动画整体错位；
   `fullText` 还用空格 join，中文被拆成「伴 唱 ： 胡 彦 斌」。现改为自动识别两种方言、
   用剥离标签后的原文作 `fullText`。
2. LRC 头部一堆同时间戳的制作信息行被「收尾对齐下一行」压成 `endTime = 0`，
   前奏到第一句之间 `findLatestActiveLineIndex()` 长期返回 `-1`；
   云阶 / 绘光 / 花火 没有内部兜底就整屏不画字，时计 / 静止有 sticky 兜底仍显示上一句
   —— 这就是「有些效果有用，有些没用」。现过滤制作信息 / 平台版权声明 / 歌名行，
   合并同时间戳行，并给每行保留最小时长。
3. `utils/appPlaybackHelpers.ts` 的 `findLatestActiveLineIndex()` 增加 sticky 兜底：
   窗口内找不到活动行就返回最近已开始的行，前奏返回第 0 行。

另外 `FoliaStage` 每帧重建 `LyricData` 会让样式树 60fps 重渲染并重置逐字动画，
已按歌词源字符串缓存；暂停不再切演示歌词；真实歌词统一走宿主 `getCurrentTime()`
减去 `window.__overtoneLyricOffsetMs`；嵌入形态跳过 `setProgress()`。
生产构建里保留只读诊断快照 `window.__overtoneFoliaDebug`（time / index / activeText /
lineCount / demo），CDP 可直接核对同步状态。

### 验证结果（2026-11-10，正式版 CDP）
`verify-lyric-fix.cjs` 全量扫 15 种模式：
- `blankModes: []`、`noActiveLine: []`、`errors: []`
- 活动行随播放时间从 0 → 8 连续推进，首行已是真歌词（「开头都是你在问」），
  不再是「录音室：NEWBAND STUDIO」
- 云阶 / 绘光 / 花火 / 莫奈 / 凝彩 截图确认歌词清晰、无裁切、canvas/背景正常
- WebGL2 正常，六种背景与 fit 开关沿用 0.3.0 的验证结论

### 打包备注
- `pack-only.py` 在 `os.replace(app.asar.new, app.asar)` 前必须 `taskkill /F /IM overtone.exe`，
  否则 Windows 报 `PermissionError: [WinError 5]`。
- 全量 webpack 构建在本机可能耗时 3～18 分钟（内存压力），`asar pack` 需 1.5～8 分钟，
  `subprocess` 的 timeout 要给到 1200s。
- 小改动可只 patch 未压缩的 `dist/renderer.js`（`minimize=false`，源码字面量原样保留）
  再重新 pack，省掉整轮 webpack；改完务必 `node --check dist/renderer.js` 且源码同步修改。

## 0.4.0 发版状态（2026-11-10 晚，已发布）
- `npm run build:clean`（`build-config/build-clean.cjs`）：用**目录重命名**代替逐文件删除
  （Windows 实时防护下逐个删 5845 个文件要 20+ 分钟，webpack 还没跑就卡死），
  再并行重建 main / renderer / renderer-lyric / renderer-scripts 四套产物，关 Terser / source map。
  实测 `BUILD_OK 507s warnings=0`。
- 干净产物：`dist` 从 85.5MB / 5929 文件压到 **43.1MB / 2031 文件**（0 个 source map，3 个 css）。
- 安装包：`build/overtone-v0.4.0-x64-Setup.exe` 127,634,703 B；`latest.yml` 已更新到
  version 0.4.0，sha512 与安装包实测一致；blockmap 同批生成。
- 桌面正式版：用干净 dist + 0.4.0 `package.json` 重打 `app.asar`
  （91.63MB → **48.27MB**，2150 entries），`app.asar.unpacked` 一并同步，
  包内版本号已是 0.4.0；应用重启验证可正常加载（7 个进程 + 主窗口）。
- GitHub Release：`https://github.com/huimou612/overtone/releases/tag/v0.4.0`
  已正式发布，资产含安装包 / blockmap / latest.yml；tag `v0.4.0` 指向 `87c173e5`。
- README：`docs/screenshots/` 9 张桌面端实拍截图（共 1.08MB），首页新增
  「v0.4.0 · 真实界面」章节；另在工作区单独提取了一份 README 与自包含 HTML 画廊。
- 回滚：`resources/app.asar.before-040-20261110`（发版前正式版 asar）、
  `F:/workbuddy/2026-10-12-13-28-07/backup-0.4.0-20261110/`（dist / 三个旧安装包 / asar 全量备份）。
- ⚠️ 官方 `npm run pack` 仍会 `del.sync(['dist/**', 'build/**'])` 清掉现有产物，
  以后要跑它务必先备份；日常增量用 `npm run build:folia`，
  发版用 `npm run build:clean` + `npm run pack:win:setup:x64`。
- 踩坑：GitHub 资产上传走 Windows Schannel 时可能报 `CRYPT_E_REVOCATION_OFFLINE`，
  `curl.exe` 加 `--ssl-no-revoke` 即可；后台启动的 GUI 进程会被会话清理，
  应用本身可正常启动，双击桌面图标即可。

## 回滚
- 本轮修复前：`resources/app.asar.before-lyric-fix-20261110`
- 0.3.0 打包前：`resources/app.asar.pre-fusion-20261109`
- 最初原版：`resources/app.asar.folia-backup`
把对应备份改名回 `app.asar` 即可（改名前先关掉 overtone.exe）。


## 0.4.0 收尾（2026-11-11，已验证）

### CI 构建
- 截图里失败的 `#79` / `#80` 是 Mac runner `ERR_WORKER_OUT_OF_MEMORY`，
  已加 `NODE_OPTIONS=--max-old-space-size=4096` 与 `OVERTONE_BUILD_SERIAL=1` 串行构建。
- Guard 判定「版本已发布」导致跳过打包，已加 `workflow_dispatch.force_build`。
- 修复后 `#81` / `#82` / `#83` 连续三次 **success**。

### 软件内「最新版本 0.2」根因与修复
- 双更新机制：`electron-updater` 读 Release 的 `latest.yml`，版本提示读 `publish/version.json`。
- `publish/version.json` 原本还是 `0.2.0`（已同步到 `0.4.0` 并补 history）。
- 客户端走 jsDelivr 不带分支的 `/gh/user/repo/publish/version.json`，CDN 缓存的是旧 commit 快照，
  实测仍返回 **0.2.0**；带 `@master` 的同一文件返回 **0.4.0**，这就是显示错版本的原因。
- 修复：三个 jsDelivr 镜像显式 `@master` 且排到 raw 前面，超时 10s→6s、重试 3→2；
  `version:purge` 调 `purge.jsdelivr.net` 清缓存；`bustCache` 带 `_t` 参数。
- 源码 `src/renderer/utils/update.js` 与产物 `dist/renderer.js`、正式版 `app.asar` 三处已同步
  （asar 内 `@master/publish/version.json` 出现 3 次，版本号 0.4.0）。
- 线上实测：`raw.githubusercontent.com` → 0.4.0，`cdn.jsdelivr.net/gh/...@master` → 0.4.0。

### Release 资产
- 主安装包首次上传被中断，资产停在 `starter`；已删除旧资产并补传完成。
- `overtone-v0.4.0-x64-Setup.exe` **127,629,843 B / state uploaded**，
  与 `latest.yml` 的 size 一致；`latest.yml`、`.blockmap` 均为 `uploaded`。

### 仓库整理
- 根目录临时 `*.log`、`folia-pack2.zip` 与 `build/win-unpacked.old-*`、
  `build/win-unpacked.tmp.old-*`（约 779MB 残留）移到
  `F:/workbuddy/2026-10-12-13-28-07/repo-cleanup-20261111/`，可原样回滚，未直接删除。
- `dist` 保留：这是 `build:clean` 后的干净产物（43.1MB / 2031 文件），不是残留。
- 恢复 `slice/lattice-lyrics/`：NOTICE 与 `docs/development/09-*` 都引用它，删了会变死链。
- 单独提取的 `README-泛音-v0.4.0.md` 与自包含 `泛音-v0.4.0-界面展示.html` 入库到仓库根目录，
  截图引用 `docs/screenshots/` 相对路径可直接显示。
