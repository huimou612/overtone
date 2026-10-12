# 泛音 / Overtone —— 开发文档

本目录是「泛音」的开发与设计文档。**注意：这些是开发过程记录，不是用户文档。**

## 文档索引

| 文件 | 内容 | 什么时候看 |
|---|---|---|
| [01-缝合方案与执行路线.md](./01-缝合方案与执行路线.md) | 为什么这样做、许可证边界、架构怎么缝、分阶段计划、红线清单 | 想搞清「整体思路」和「能不能这么做」 |
| [02-执行手册-命令与代码.md](./02-执行手册-命令与代码.md) | 每一步的具体命令、加新能力的标准动作、构建排错表、推 GitHub 流程 | 要动手敲命令时 |
| [03-AI歌词功能原理拆解.md](./03-AI歌词功能原理拆解.md) | Folia 的 AI 歌词链路 7 步拆解、`realignSegmentsToText` 精解、移植适配点与代码骨架 | 做阶段 3 时 |

## 这个项目是什么

**泛音（Overtone）** 是一个把两个开源项目「缝」在一起的桌面音乐工具：

- **外壳**来自 [lx-music-desktop](https://github.com/lyswhut/lx-music-desktop)（Apache-2.0）——音乐库管理、播放器、歌词、桌面歌词窗口这套成熟界面
- **能力**来自 [folia-major](https://github.com/chthollyphile/folia-major)（AGPL-3.0）——AI 歌词处理、音源分离等音频智能能力

由于两个项目的 UI 框架不兼容（React vs Vue），**UI 层不可搬运，只能搬语言无关的主进程逻辑**。
详见 `01-缝合方案与执行路线.md` 第 4 节。

## 路径对照（很重要）

开发时的工作区是 `F:\workbuddy\...\fusion-music\`，而 git 仓库根是其中的 `app/`：

| 本文档里提到的 | 实际位置 |
|---|---|
| 仓库根 / `.` | `fusion-music/app/` |
| `app/` | `fusion-music/app/`（就是仓库根本身） |
| `reference/folia-major` | `fusion-music/reference/folia-major`（Folia 源码，**不在本仓库内**） |
| `../docs/`、`../notes/` | 已挪进本仓库 `docs/development/` |

所以文档里出现 `cd fusion-music/app` 时，如果你已经在仓库根，直接执行后续命令即可。

## notes/ 目录

| 文件 | 用途 |
|---|---|
| `notes/folia-src/*.cjs` `*.mjs` | 从 Folia 摘出的关键源码，作为移植参考（AGPL-3.0，与本项目同协议） |
| `notes/capture-win32.py` | 首版窗口截图工具（Win32 `PrintWindow`） |
| `notes/recapture.py` | 加固版截图工具：最小化→还原强制重绘、空白检测、屏幕 BitBlt 回退 |
| `notes/probe_mirrors.py` | GitHub 镜像可达性探测 |
| `notes/validate_theme_fallback.js` | 校验主题派生变量与 `index.less` 的 `:root` 是否一致 |
| `notes/preview/overtone-clean.png` | 品牌化改造后的实机首屏截图（验收证据） |

## 许可证

本项目整体以 **AGPL-3.0** 发布。原因：Folia 的能力层是 AGPL-3.0，而 AGPL-3.0 只能与同等或更宽松的许可证合并——
Apache-2.0 可以并入 AGPL-3.0，反向不行。所以 AGPL-3.0 是唯一合法成立的统一许可证。

上游版权声明见仓库根目录 `NOTICE`，完整协议文本见 `LICENSE`。
