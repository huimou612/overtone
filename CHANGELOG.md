# overtone change log

All notable changes to this project will be documented in this file.

Project versioning adheres to [Semantic Versioning](http://semver.org/).
Commit convention is based on [Conventional Commits](http://conventionalcommits.org).
Change log format is based on [Keep a Changelog](http://keepachangelog.com/).

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
