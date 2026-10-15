# 泛音 / Overtone —— 开发文档

本目录是「泛音」的开发与设计文档。**注意：这些是开发过程记录，不是用户文档。**

## 文档索引

| 文件 | 内容 | 什么时候看 |
|---|---|---|
| [01-缝合方案与执行路线.md](./01-缝合方案与执行路线.md) | 为什么这样做、许可证边界、架构怎么缝、分阶段计划、红线清单 | 想搞清「整体思路」和「能不能这么做」 |
| [02-执行手册-命令与代码.md](./02-执行手册-命令与代码.md) | 每一步的具体命令、加新能力的标准动作、构建排错表、推 GitHub 流程 | 要动手敲命令时 |
| [03-AI歌词功能原理拆解.md](./03-AI歌词功能原理拆解.md) | Folia 的 AI 歌词链路 7 步拆解、`realignSegmentsToText` 精解、移植适配点与代码骨架 | 做阶段 3 时 |
| [04-音源分离功能原理拆解.md](./04-音源分离功能原理拆解.md) | HTDemucs 分离链路四段拆解、内存开关为什么决定架构（必须 Python）、双桶累加的等价性、断点续传为什么必需、移植踩的坑与实测数据 | 做阶段 4 时 |
| [05-能力地图.md](./05-能力地图.md) | **哪些是继承 LX 的、哪些是泛音自己写的、还剩什么没搬**；改动量事实、入口位置、红线的真实状态、能力显性化方案 | 想知道「这软件到底改了什么」或规划下一步时 |
| [06-个性化外壳.md](./06-个性化外壳.md) | 双模式方案的拆解（三件事、成本差一个数量级）、Folia 界面层的真实体量与四种做法、**红线为什么被加重**、7.1 入场动画的实现原理与四个坑 | 做阶段 7（入场动画 / 壁纸 / 双档外观）或阶段 8（Folia 视觉切片）时 |
| [07-开放曲库-音源方案.md](./07-开放曲库-音源方案.md) | 清红线后「没歌可放」怎么补：Openverse 选型理由、API 实测契约（匿名 20 条上限 / duration 是毫秒 / filesize 常为 null）、新增一个源要动的四处接线、`assertApiSupport` 这个最容易漏的点、**「设置→网络」为什么是这个源唯一的开关**、CDP 验证的两模式与结果 | 想加音源、或要理解「为什么这个源有时候连不上」 |
| [08-自定义音源协议-搜索能力.md](./08-自定义音源协议-搜索能力.md) | 自定义源脚本协议的能力白名单（为什么上游只给 `musicUrl`、泛音为什么放开 `musicSearch`/`lyric`/`pic`）、搜索结果的规范化契约（别名、`interval` 毫秒判定、规模上限）、**「搜得到必须播得了」一致性守卫**、搜索源列表为什么必须运行期动态注册、`getPic` 两种消费形状 | 要写自定义源脚本、或自定义源「搜不到歌 / Tab 不出现」时 |

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
| `notes/preview/ai-ui/*.png` | AI 逐字歌词的界面留档（阶段 3 验收） |
| `notes/preview/stems/*.png` | 音源分离的界面留档：`01-stem-ready`（模型已装、待开始）、`02-stem-done`（两条 WAV 已导出） |
| `notes/preview/splash/*.png` | 入场动画的留档：`01-splash-dark` / `02-splash-light`（两种主题下的外观）、`03-settings-appearance`（设置页的定制入口） |
| `notes/preview/openverse/*.png` | 开放曲库的界面留档：`01-search-ov`（搜索页「开放曲库」Tab + 三行结果）、`02-search-ov-playing`（播放态） |
| `notes/preview/localmusic/*.png` | 本地音乐的留档：`10-mylist-imported`（已导入「我的列表」）、`11-mylist-playing`（播放态）、`12-apion`（自定义音源已启用） |
| `notes/preview/userapi/*.png` | 自定义音源搜索能力的留档：`01-search-userapi`（搜索页出现「酷我音乐」Tab + 测试源三行结果，`interval` 已归一为 `02:09`） |

## 许可证

本项目整体以 **AGPL-3.0** 发布。原因：Folia 的能力层是 AGPL-3.0，而 AGPL-3.0 只能与同等或更宽松的许可证合并——
Apache-2.0 可以并入 AGPL-3.0，反向不行。所以 AGPL-3.0 是唯一合法成立的统一许可证。

上游版权声明见仓库根目录 `NOTICE`，完整协议文本见 `LICENSE`。
