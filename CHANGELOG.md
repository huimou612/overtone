# overtone change log

All notable changes to this project will be documented in this file.

Project versioning adheres to [Semantic Versioning](http://semver.org/).
Commit convention is based on [Conventional Commits](http://conventionalcommits.org).
Change log format is based on [Keep a Changelog](http://keepachangelog.com/).

## [0.2.0](https://github.com/huimou612/overtone/compare/v0.1.0...v0.2.0) - 2026-10-22

「看封面听歌」的一版。把 [Folia](https://github.com/chthollyphile/folia-major) 的海报墙与全屏歌词
接进 [LX Music](https://github.com/lyswhut/lx-music-desktop) 的外壳，操作习惯不变，听歌界面重做。

### 新增

- **封面墙**：当前列表铺成海报墙；悬停放大 + 描边 + 封面视差；单击播放、双击进入歌词界面
- **Lattice 歌词界面**（沉浸式歌词与封面墙歌词合并为同一界面）：
  - 居中大字歌词、逐字填充、上下文行
  - 背景：封面模糊铺底 + 会变色的色调层（hue 缓慢漂移）+ canvas 2D 飘浮粒子
  - 右侧常驻面板四页签：封面（歌名/歌手/专辑）、音效、播放列表、时间线
  - 底部控制条：默认小胶囊，悬停展开为完整控制条（可拖动进度）
  - 时间轴偏移：±100ms 微调，点数值归零
  - 时间线弹窗：中间竖线 + 左右交错卡片，当前句高亮、自动跟随、点卡片跳转
- **音效设置窗口**：环境混响 / 均衡器 / 音调升降 / 3D 环绕，两栏卡片布局
- **播放队列**：标题 + 歌名/歌手两行列表，当前曲高亮，点击即播（支持上千首）
- **隐藏式窗口控制**：封面墙与歌词界面右上角，鼠标靠近才浮出 最小化 / 最大化 / 关闭
- 新增文案键 `timeline.title`、`maximize`（简中/繁中/英）

### 变更

- 「沉浸式歌词」入口（播放详情页按钮）现在打开的就是 Lattice 界面，不再有第二套歌词页面
- 面板 ✕ 改为「只收起面板」，不再退出歌词界面；面板关闭后右下角常驻圆形按钮可重新打开
- 歌词类型与时间轴偏移只在「音效」页签内显示
- 封面墙顶栏收窄拖动区，保证右上角窗口按钮可交互

### 修复

- 修复歌词界面/封面墙中真实鼠标无法触发右上角窗口按钮的问题（拖动区覆盖导致系统吞事件）
- 修复「音频输出设备为空」弹窗每次启动都打扰的问题（改为仅控制台日志）
- 修复 ESC 一次同时关闭歌词界面与封面墙的问题（改为逐级退出）
- 修复面板内图标因 sprite 坐标系不一致而显示异常的问题

## [0.1.0](https://github.com/huimou612/overtone/compare/v0.0.0...v0.1.0) - 2026-10-12

泛音（Overtone）首个开发版本。基于 [LX Music](https://github.com/lyswhut/lx-music-desktop)（Apache-2.0）
的桌面端外壳与 [Folia](https://github.com/chthollyphile/folia-major)（AGPL-3.0）的 AI 能力二次开发。

### 新增

- 以 LX Music v2.12.6 为基线建立项目仓库（Electron 42 + Vue 3 + Webpack 多入口构建）
- 补齐开发环境：依赖安装、Electron 二进制、原生模块编译、四入口构建与 dev 启动打通

### 变更

- 品牌化改造：应用名、窗口标题、托盘名、安装包与桌面快捷方式统一为「泛音 / Overtone」
- URL Scheme 由 `lxmusic://` 改为 `overtone://`
- 用户数据目录由 `LxDatas` 改为 `OvertoneData`，数据库文件由 `lx.data.db` 改为 `overtone.data.db`
- 数据同步时的临时目录由 `lxmusic_temp` 改为 `overtone_temp`
- 许可证由 Apache-2.0 调整为 GNU AGPL v3.0（唯一能与 Folia 的 AGPL-3.0 合法组合的方式）
- 移除全部上游版本检查源（npm `lx-music-desktop-version-info`、gitee 镜像、cdn.stsky.cn），
  避免把上游新版本误报为本软件的新版本
- 移除指向上游文档站的全部用户可见链接，改指向本项目仓库
- 重置版本号与更新日志，与上游版本线解耦

### 修复

- 无（本版本为品牌化改造，未改动功能逻辑）

### 已知问题

- 首次启动可能出现 `SqliteError: unable to open database file`，为数据库初始化竞态，
  紧接其后即输出 `db inited`，不影响使用
- 开发模式下 `electron-devtools-installer` 安装 Vue DevTools 失败并报
  `Invalid header: Does not start with Cr24`，仅影响调试插件，不影响应用运行
