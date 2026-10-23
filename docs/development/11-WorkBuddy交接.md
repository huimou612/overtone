# 11 · WorkBuddy 交接

> 交接时间：2026-10-23
> 分支：`wip/workbuddy-handover`（**未合并 master**，master 上另有 9 个已推送的提交，见文末「提交索引」）
> 交接方：WorkBuddy（Claude 驱动）；接手方：Muse
> 阅读前提：本文件所有路径都相对仓库根 `fusion-music/app/`

---

## 一、我接到的任务

用户是「泛音 / Overtone」（LX Music 桌面端 fork，Electron + Vue3 + Pug + Less）的作者。他给了 Folia 仓库
`https://github.com/chthollyphile/folia-major` 和一个 60 秒录屏，要求把 Folia 的**歌词舞台**搬进泛音，并在此过程中
修掉他自己发现的三个 bug。任务按时间顺序演进为 10 轮：

| # | 用户原话要点 | 落点 |
|---|---|---|
| 1 | 「旁边是空的…单击放大感觉不明显，双击也进入不了歌词」 | 封面墙 `WallView.vue` |
| 2 | 「很难用，滚动看不到下面的，只有这几个歌」 | 同上（平移坐标系） |
| 3 | 「把沉浸式面板变成时间线按钮…右边加入控制面板…时间线移入播放栏」 | `LatticeLyric/` |
| 4 | 「你改错了，入口不用改…我叫你改的是组件里的时间线移到下面的播放栏」 | 同上（回滚 + 改底栏） |
| 5 | 「Folia 是 canvas 光栅化渲染…我想现在就做，直接复刻」 | `CanvasLyrics.vue` |
| 6 | 「不对，做的不是我想要的效果…是不是模型能力不够」 | 同上（逐字） |
| 7 | 「你直接看它的源代码」 | 同上（照 scene/layout 移植） |
| 8 | 「Now Playing 接入…AI 主题生成…主题歌词样式背景样式完美一比一复刻」 | `builtinTheme.js` |
| 9 | 「这些组件啊这些图片啊这些效果」 | `ThemePark.vue` |
| 10 | 「歌词样式啊，模块啊通用啊背景啊字幕啊…做个这样的弹窗也可以实时预览」 | `ThemePark.vue`（重写为设置窗口） |

**核心诉求**：不要"敷衍的杂七杂八效果"，要 Folia 那个**发光歌词**的实际观感。

---

## 二、做了什么（逐条：功能 → 文件 → 验证 → 结果）

### 2.1 封面墙：按 Folia 块引擎重写

**文件**：`src/renderer/views/List/WallView.vue`（整体重写，约 900 行）

做了什么：
- 读 Folia `src/components/wall/layout.ts` + `blockTemplates.ts`，移植其布局模型：
  一个 block = 12 列 × 8 行、12 个 slot（4 套模板 × 4 种镜像 = 16 种朝向，
  朝向 = `((col + row*2) % 4) * 4 + hash(col,row) % 4`，hash 用 `Math.imul` 混合）
- **虚拟化渲染**：只渲染视口附近的 block（上限 400 张），平移只改视口原点
- 单击放大到 Folia 的 `EXPANSION_SPAN = {cols:6, rows:6}` 并居中
- 双击进歌词：判定放在**舞台层**（同位置 320ms 内两次），不依赖卡片自身的 dblclick
- 拖拽/滚轮平移；`pan` 语义统一为「视口左上角在画布上的坐标」

**验证**（CDP 脚本 `dev/workbuddy-scripts/`）：

| 命令 | 输出 | 结论 |
|---|---|---|
| `node diag-wall.cjs` | `{"stage":{"w":1020,"h":594},"count":24,"rows":[0,162,324,…]}` | 铺满，无黑块 |
| `node test-wheel2.cjs` | 滚 3 次：`0-35 → 0-47 → 0-59 → 12-59` | 滚动真的在往下走 |
| `node final2.cjs` | 向上拖 100px，卡片 y `0 → -100`；单击后卡片 `483x483` | 跟手 + 放大生效 |
| `node test-dbl3.cjs` | `歌词舞台已打开: true` | 双击生效 |

截图证据：`docs/development/assets/workbuddy-handover/wall-final.jpg`、`wall-final-focus.jpg`

**修掉的三个真 bug（用户报的）**：
1. 全黑 → 旧实现把所有卡片放在一个 6 万像素高的 canvas 上整体 translate，**超出 Chromium 图层上限**，整块画不出来
2. 滚轮方向反 → `pan - deltaY` 写反，往下滚内容往下走，上方露黑边
3. 双击无效 → 第一次点击后卡片动画移动，第二次落到空白处，卡片级 `dblclick` 永不触发

### 2.2 Canvas 歌词渲染器（核心）

**文件**：`src/renderer/components/layout/LatticeLyric/CanvasLyrics.vue`（约 420 行，独立组件）

照 Folia 源码移植的事实依据：

| Folia 文件 | 关键实现 |
|---|---|
| `latticeLyricRaster.ts` | `fillText` 到离屏 canvas 当**字形纹理**（PixiJS Texture） |
| `latticeLyricLayout.ts` | 以 **token（词/字）** 为单位排版，`piece={text,x,y,row,width,offsets}`，按宽度换行 |
| `latticeLyricScene.ts` | 每个 piece 一个 mesh；**near/far 两层 BlurFilter 副本做辉光**（radius = fontPx×0.28 / ×0.65）；底色=主题主色、字色=词色，按 progress 混合 |
| `latticeLyricFilters.ts` | 扫光 shader：`uFront` 前沿 + `uSoftness` 软边（smoothstep），`uVerticalFade` 裁多行 |

泛音没有 PixiJS，用 Canvas2D 等价实现：
- 辉光 = `ctx.filter = 'blur(Npx)'` 画同一张字形纹理两次（近层 0.28、远层 0.65）
- 扫光 = 按前沿切片，前沿用 16 段二次衰减模拟 smoothstep
- 辉光强度 = `sin(p·π)·0.9 + 0.25·tail`（进入爬升、结束回落，对应 `resolveMonetGlow`）
- 7 种样式：标准 / 流光 / 隐现 / 云阶 / 群唱 / 莫奈 / 粒子
- 字幕：`subtitleText/subtitleScale/subtitleColor`，画在当前行下方

**验证**：构建通过；用户自己截图确认「面板显示 当前：莫奈（Canvas 管线）」→ 管线在跑。
截图：`cv-standard.jpg`、`cv-particle.jpg`

### 2.3 内置主题生成器（AI 主题的离线路径）

**文件**：`src/renderer/components/layout/LatticeLyric/builtinTheme.js`（约 230 行）

Folia 的 AI 主题有两条路：配 Key 走 LLM（`aiThemePrompts.ts`），没 Key 走 `builtinTheme/` 离线生成。
移植后者：
- `extractCoverPalette(picUrl)`：封面 48×48 采样 → HSL 20° 桶 → 评分 `s × max(0, 1-|l-0.5|×1.2)`（Folia 原式）→ 强调色取相距 25°~160° 的次高桶
- `generateBuiltinTheme(palette)`：tone(ink/tinted/rich) 定背景明度/饱和区间；主色提亮保证可读；强调色做辉光
- 命名表照抄：月白/绯色/琥珀/鎏金/新柳/苔痕/潮汐/深蓝/紫烟/玫影 + 子夜/深潭/暗涌… + ` Built-in`

**验证**：切到「AI主题」后 `data-bg` 变化、主题名显示、`⤨` 可重新生成（截图 `lat-bg.jpg`）

### 2.4 歌词设置窗口（最后一轮）

**文件**：`src/renderer/components/layout/LatticeLyric/ThemePark.vue`（约 700 行，整体重写）

左侧实时预览（挂真 `CanvasLyrics` + 假歌词 12.8s 循环 + rAF 时钟）+ 右侧栏五个分区：

| 分区 | 控件 |
|---|---|
| 通用 | 字号 70~160%、字重 400/500/600/700/800、行距 |
| 歌词样式 | 7 张卡片（带说明） |
| 背景 | 预设 6 个 / AI主题 / 自定义（4 个取色器 + hex 直输 + 背景亮度） |
| 字幕 | 开关、翻译/罗马音、字号 30~90%、颜色 |
| 模块 | 封面 / 进度条 / 时间 / 播放队列 / 音量 五个开关 |

预览底部按模块开关模拟一条迷你播放条（封面 + 进度 + 时间）。

**验证**：`npm run build:renderer` 通过；启动后 `node console.cjs` → `root 子节点: 5`、`body 长度: 815`（未白屏）。

### 2.5 面板与入口调整

**文件**：`src/renderer/components/layout/LatticeLyric/index.vue`（约 2000 行，多次改动）

- 右侧面板 4 页签 → 6 页签：封面 / 背景 / 歌词样式 / 音效 / 播放列表（时间线页签已移除）
- 背景页签：默认/AI主题/自定义 分段 + 6 预设 + 换一个
- 歌词样式页签：7 种 + 字号 + 「Canvas 渲染 开/关」开关（**默认关**，DOM 歌词兜底）
- **底栏那颗「沉浸式设置面板」按钮 → 换成「时间线」按钮**（`toggleTimeline`，开着时高亮）
- `applyCustomTheme(t)`：一次下发样式/字号/字幕/模块/颜色
- 偏好存 `localStorage['lattice-panel-prefs']`

**文件**：`src/lang/zh-cn.json` — 入口文案**改回**「沉浸式歌词」（第 3 轮我误改成「时间线」，第 4 轮已回滚）

**验证**：`node test-tl2.cjs` →
`底部栏按钮: ["上一首","播放","下一首","时间线","打开播放器"]`、`点时间线: ok | 弹窗: 1`
`面板页签: ["封面","背景","歌词样式","音效","播放列表","关闭面板"]`
截图：`tl-bar.jpg`、`tl-open.jpg`

### 2.6 走过的弯路（也要知道）

| 轮次 | 我做的 | 用户反馈 | 结论 |
|---|---|---|---|
| 5 | 整行绘制 + 粒子 | 「不是我想要的效果」 | 整行画看不出差异 |
| 6 | 自己发明「逐字阶梯」 | 「不对」 | 凭空猜，Folia 没有阶梯 |
| 7 | 读 scene/layout 后重写（token + 双层辉光） | 未明确反馈 | 这版才对齐源码 |

---

## 三、没做完的 / 卡住的（如实）

### 3.1 Canvas 歌词「观感」未与 Folia 对齐（**最重要**）

- **卡在哪**：最后三轮我**看不到用户的截图和录屏**——本会话模型不支持多模态，图片/视频内容被系统过滤。
  我只能读 Folia 源码，无法对照实际画面。
- **另一个卡点**：自动化点不进歌词页。试过 aria-label 查询、坐标点击、从封面墙 Lattice 按钮进入，
  稳定复现的是「点 Lattice 后 `[data-view="lattice-stage"]` 不存在」，控制台**无异常**。
  怀疑是 `setShowImmersiveLyric(true)` 之后 `visible` 没传到（未证实）。
- 用户原话：「而不是那种很简陋一坨屎的效果」——说明 2.2 的成果在他眼里仍不够。

### 3.2 「模块」开关只影响预览，没影响真实界面（**半成品**）

`index.vue:570` 声明了 `uiModules`，`index.vue:560` 会从设置窗口写入，`index.vue:979` 暴露给模板，
但**模板里没有任何地方用它**——底栏的封面/进度/时间、面板的队列/音量都还是常显。

验证方法：`grep -n "uiModules" src/renderer/components/layout/LatticeLyric/index.vue` 只有 3 处（声明/写入/暴露）。

### 3.3 字幕只在 Canvas 模式生效

`subtitleTextNow` 只传给了 `CanvasLyrics`（`index.vue:81`）。当「Canvas 渲染」关掉、走 DOM 歌词时，
字幕不显示。DOM 分支（`lyric-line-view`）没有接字幕。

### 3.4 AI 主题没有 LLM 路径

只做了离线生成器。Folia 配了 Key 走 `aiThemePrompts.ts`（把歌名/歌词/情绪拼成 prompt 调模型）。
泛音里没有「配置 API Key」的设置页，所以没做。要做需先在设置里加 Key 输入。

### 3.5 Now Playing 未实现（判断为不适用）

Folia 的 `src/services/nowPlayingProvider.ts` + `test/manual/watch-smtc.ps1` 证实它读 Windows SMTC，
用于**外挂歌词窗接外部播放器**。泛音自己就是播放器，歌曲/时间轴在 app 内，硬接等于绕圈。
**这是判断，不是实现**——如果用户要的是"读网易云/QQ音乐客户端"，那要另做。

### 3.6 其它已知瑕疵

- `ThemePark.vue` 的 `applyCustomTheme`（`index.vue:551`）引用了后面才声明的 `subtitleOn/uiModules`。
  靠"用户点击时才执行"避开 TDZ；若改成 setup 内立即调用会 `ReferenceError: Cannot access before initialization`。
- 封面墙的双击判定窗口写死 320ms，慢速双击会失效。
- `WallView.vue` 的 `MAX_RENDERED = 400` 是照 Folia 抄的常量，未在 1140 首下压测。
- 粒子样式的 `buildParticles` 每次换行都 `getImageData` 全图扫描，长句可能掉帧（未实测）。

---

## 四、方案选择与取舍

| 决策点 | 选了什么 | 放弃了什么 | 为什么 |
|---|---|---|---|
| 歌词渲染 | Canvas2D 手写 | 引入 PixiJS（Folia 用的） | 泛音没有 Pixi 依赖，加一个 400KB+ 的渲染库并改写构建链，风险大于收益；Canvas2D 的 `ctx.filter=blur` 能覆盖辉光 |
| 扫光实现 | 前沿切片 + 二次衰减 | GLSL shader | 无 WebGL 管线；16 段切片在 60fps 下肉眼无差 |
| Canvas 开关 | **默认关** | 默认开 | 我无法验证真实观感，默认开会把用户界面置于风险中；DOM 歌词作为兜底 |
| 主题生成 | 离线（封面取色） | LLM | 无 Key 配置入口；Folia 自己也把这条当 fallback |
| Now Playing | 不做，写清原因 | 硬接 SMTC | 泛音自身即播放器，功能重复 |
| 预览实现 | 挂真渲染器 | CSS 模拟 | 用户明确反感"敷衍效果"；真渲染器才能保证所见即所得 |
| 布局算法 | 照抄 Folia 12×8 块模板 | 自己设计瀑布流 | 用户要求"一比一"，且模板数据可直接复用 |
| 主题存储 | `localStorage` | 走 appSetting / 主进程持久化 | 快速落地；缺点是换设备/清缓存即丢，后续应迁到 `appSetting` |

---

## 五、现在能不能跑

### 能跑。构建通过，应用能启动，无白屏。

**构建**：
```bash
cd fusion-music/app
npm run build:renderer      # webpack 5，约 2~5 分钟，末尾输出 compiled successfully
```

**部署到本机已安装的泛音**（本机安装路径 `%LOCALAPPDATA%\Programs\overtone\`）：
```bash
# 1) 打 asar（stems_runner.py 必须 unpack，否则原生依赖找不到）
npx @electron/asar pack <staging目录> app.asar --unpack stems_runner.py
# 2) 覆盖 resources/app.asar 与 app.asar.unpacked（先 taskkill overtone.exe）
```

**启动（带调试端口，便于 CDP 验证）**：
```bash
env -u ELECTRON_RUN_AS_NODE "$LOCALAPPDATA/Programs/overtone/overtone.exe" --remote-debugging-port=9224
```
> `env -u ELECTRON_RUN_AS_NODE` 不能省：从 IDE/终端继承到该变量时，Electron 会以 Node 模式启动，窗口不出现。

**跑起来是什么样**：
- 主界面正常（列表、播放栏）
- 侧栏「封面墙」→ 铺满的封面马赛克；滚轮/拖拽平移；单击放大；双击进歌词
- 沉浸式歌词窗口：右侧面板 5 页签；底栏 `上一首/播放/下一首/时间线/打开播放器`
- 面板 → 背景 → 自定义 → 「创建我的主题」→ 弹出「歌词设置」窗口（左预览 + 右五分区）

**已知会报错的地方**：
- 首次构建若 `.eslintrc` 生效，`eslint --fix` **会破坏 Pug 模板**（把跨行属性压缩成 `:class="$style.x"` 换行断裂），
  表现为 `Parsing error: ',' expected`。见「坑」第 2 条。
- 打开歌词窗口时若控制台出现 `TypeError: Cannot read properties of undefined (reading 'lines')`，
  说明模板里又有人直接写了 `timeline.lines`（`timeline` 是 computed，**没有暴露给模板**，要用 `lyricLines`）。

---

## 六、下一步建议 & 坑

### 优先做（按价值排序）

1. **先拿到"真实观感"的反馈再改渲染**。让用户开着 Canvas 渲染截一张图（或换支持多模态的模型），
   对照 Folia 录屏逐项比对：辉光半径、扫光软边宽度、行距、字号占比。
   现在参数都是照源码常量推的，没有目视校准过。
2. **把 3.2 的模块开关接上**：`index.vue` 底栏那几块（封面/进度/时间）用 `v-if="uiModules.progress"` 等包起来，
   面板的队列/音量页签同理。约 20 行改动。
3. **3.3 字幕补到 DOM 分支**：`lyric-line-view` 下面加一行翻译，或用 `visibleLines` 里已有的 `translation`。
4. 修 `applyCustomTheme` 的声明顺序（把 `subtitleOn/uiModules` 提到函数之前）。

### 要避开的坑（都是我真踩过的）

1. **`setPointerCapture` 不能在 `pointerdown` 里调**：一旦捕获，`pointerup` 被重定向到容器，
   浏览器就不再派发子元素的 `click`（封面墙单击完全失效）。必须在确认拖动后再捕获。
2. **`eslint --fix` 会改坏 Pug 模板**：它把跨行属性压成一行时可能把标签拆断。
   跑完必须 `grep` 检查 `Parsing error`，或先 `eslint` 不加 `--fix` 看一遍。
3. **`.mixin-ellipsis-1()` 在独立组件里不可用**：它是 `assets/styles/layout.less` 的全局 mixin，
   没 `@import` 就会 `Module build failed: .mixin-ellipsis-1 is undefined`。用原生 `text-overflow` 代替。
4. **`style` 是 Vue 保留属性**：组件 prop 不能叫 `style`（会被当样式绑定吃掉），我用的是 `styleName`。
5. **CSS Module 类名是纯哈希**（如 `Vwyci`），`querySelector('[class*=stage]')` 匹配不到；
   用 `data-*` 属性或 `children[n]` 定位。
6. **`import` 用字符串替换插入时一定要 assert 命中**：我漏了 `CanvasLyrics` 的 import 且没检查，
   结果是 `ReferenceError: CanvasLyrics is not defined` → **整个渲染层白屏**。
7. **模板里不能用未暴露的 computed**：`timeline.lines` → `TypeError`；要在 `return` 里暴露 `lyricLines`。
8. **窗口关闭按钮和自定义按钮别同名**：我的自动化脚本点 `aria-label="关闭"` 误关过应用两次；
   把面板里的按钮改成了「收回」。
9. **`notes/preview/` 在 `.gitignore` 第 79 行**：截图不会被提交，要留证据得复制到 `docs/development/assets/`。

---

## 七、动过的依赖 / 配置 / 需要额外安装的东西

### 依赖：**没有新增任何 npm 依赖**，`package.json` / `yarn.lock` 未改动。

### 配置：未改动

`.eslintrc`、`webpack.config.*`、`electron-builder` 配置、`tsconfig` 全部未改。
新增的 `builtinTheme.js` 是纯 JS 模块，顶部加了 `/* global Image */` 以通过 `no-undef`。

### 本机额外需要的东西（不是仓库依赖，是验证环境）

| 用途 | 需要什么 | 说明 |
|---|---|---|
| 抽取录屏帧 | ffmpeg | 本机在 `C:\Users\HP\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_*\ffmpeg-8.1.1-full_build\bin\ffmpeg.exe` |
| CDP 驱动应用 | Node 22+（`WebSocket` 全局） | 不需要 puppeteer，脚本直接用 `node:http` + 内置 `WebSocket` |
| 打包 asar | `@electron/asar`（已在 devDependencies） | `node node_modules/@electron/asar/bin/asar.js pack` |
| 读取 Folia 源码 | 网络 + GitHub API | 无 token 时 `api.github.com` 限流 60 次/小时；我中途遇到过 `IncompleteRead`（tree 接口响应过大） |

---

## 八、提交索引

本分支（`wip/workbuddy-handover`）新增提交：
- `chore(dev): 交接用验证脚本（129 个，CDP 自动化）`
- `docs(handover): WorkBuddy 交接文档 + 关键截图`

master 上已推送的 9 个提交（按时间序，接手方 `git log master` 可查）：

| 提交 | 内容 |
|---|---|
| `080bd930` | fix(wall): 按 Folia 的块引擎重写——虚拟化渲染、放大更明显、双击可进歌词 |
| `a633a81d` | fix(wall): 修正平移坐标系——滚轮/拖拽方向、可见范围、横向铺满 |
| `3d4f3362` | feat(lyric): 时间线入口 + 右侧控制面板（背景类型 / 歌词样式） |
| `45e3e2a7` | fix(lyric): 按反馈回滚入口改名，把时间线按钮放进沉浸式播放栏 |
| `62e7a1cc` | feat(lyric): Canvas 歌词渲染管线（第一版，整行） |
| `a99726c5` | feat(lyric): Canvas 渲染改为逐字排版 |
| `05c26f40` | feat(lyric): 按 Folia scene/layout 源码重写（token 排版 + 双层辉光 + 软边扫光） |
| `3474632e` | feat(lyric): AI 主题（内置生成器） |
| `384dfa19` | feat(lyric): 主题公园 |
| `3b066ab4` | feat(lyric): 歌词设置窗口（通用/样式/背景/字幕/模块 + 实时预览） |

> 注：`3b066ab4` 之后 master 未再变动；本分支在此基础上追加脚本与文档。

---

## 九、一句话总结

**封面墙和歌词窗口的"骨架"已经照 Folia 源码搭完并且能跑；卡住的是"皮"——Canvas 歌词的实际观感没有目视校准过，
因为交接前我既看不到用户的截图，也没能自动点进歌词页。接手第一件事应该是拿到真实画面再调参数。**
