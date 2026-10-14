<p align="center"><a href="https://github.com/huimou612/overtone"><img width="200" src="./doc/images/icon.png" alt="Overtone logo"></a></p>

<h1 align="center">泛音 · Overtone</h1>

<p align="center">
  <a href="https://github.com/huimou612/overtone/releases"><img src="https://img.shields.io/github/release/huimou612/overtone" alt="Release version"></a>
  <a href="https://github.com/huimou612/overtone/blob/master/LICENSE"><img src="https://img.shields.io/github/license/huimou612/overtone" alt="License"></a>
  <a href="https://electronjs.org/releases/stable"><img src="https://img.shields.io/github/package-json/dependency-version/huimou612/overtone/dev/electron/master" alt="Electron version"></a>
</p>

<p align="center">一个以 <b>LX Music</b> 为外壳、以 <b>Folia</b> 的 AI 能力为内核的本地音乐播放器</p>

<p align="center"><a href="./README.en.md">English</a> | 简体中文</p>

---

## 这是什么

泛音（Overtone）是一个**二次开发作品**。它把两个项目的长处缝在一起：

| 来源 | 贡献的部分 |
| --- | --- |
| [LX Music](https://github.com/lyswhut/lx-music-desktop)（Apache-2.0） | 桌面端外壳：Electron + Vue 3 框架、播放器内核、播放列表、音源（自定义源）加载、桌面歌词窗口、数据同步、开放 API、主题系统 |
| [Folia](https://github.com/chthollyphile/folia-major)（AGPL-3.0） | AI 能力：AI 歌词分词（逐词边界）、AI 凭据安全存储、音源分离（HTDemucs） |

也就是说：**操作习惯与 LX Music 一致，但多了「听懂歌词」和「拆开音轨」这两件事。**

> 为什么是这两个许可证能合到一起？因为 Apache-2.0 允许并入 AGPL-3.0（反向不行）。
> 详细说明见 [NOTICE](./NOTICE)。

---

## 功能

### 继承自 LX Music（已完成）

- 播放器与列表体系：播放列表、收藏、临时列表、列表同步
- 桌面歌词窗口（横/竖排、逐字歌词）
- 数据同步服务客户端
- 开放 API（本地 HTTP 服务，供第三方调用）
- 主题系统、托盘、全局快捷键
- Windows / macOS / Linux 三平台打包

> ⚠️ **在线播放只走「自定义源」机制**：本仓库不含任何音乐平台的接口实现
> （连搜索接口也没有，见下方「在线播放怎么用」）。想听在线歌曲，请自行导入源。

### 泛音自研（已完成）

- **AI 歌词分词** —— 用大模型把整行歌词切成词，为逐字高亮提供边界。结果写回本地库，重装不丢
- **AI 凭据管理** —— 用 Electron `safeStorage`（Windows DPAPI / macOS Keychain / Linux libsecret）加密存储 API Key，界面只拿得到「配没配」
- **音源分离** —— HTDemucs，跑本地 Python sidecar，把一首歌拆成人声与伴奏并各导出一个文件
- **个性化外壳** —— 可定制的入场动画、视频壁纸（模糊 / 遮罩）、经典 / 个性双档外观、跟随封面取色

前两项与第三项的入口都在侧栏的**工作台**（看状态、开能力）；播放详情页底部另有一行常驻
工具按钮（分词 · 分离），不必再右键歌词。分词与分离全程在本机完成，音频不上传。

---

## 在线播放怎么用

泛音**不内置任何音乐平台的接口**（这是本项目的红线，不是配置问题）。一个刚装好的泛音：

- ✅ **能播本地音乐** —— 把文件夹拖进列表即可，由本机解码器直接播放
- ✅ **能播你已导入的歌单 / 分享链接** —— 前提是 `source` 指向你已导入的源
- ❌ **搜索框搜不出结果**，榜单与分类歌单是空的
- ⚠️ **封面可能是平台 CDN 上的图** —— 本机既有的音乐数据里若记着早先抓取时写入的封面地址，
  界面会照常加载那张图，因而可能产生对平台 CDN 的**图片**请求。这是数据里的地址，不是接口调用

要恢复在线能力，得**自己准备一个「自定义源」**：

1. 设置 → 基本设置 → **自定义源** → 导入（选一个源文件）
2. 导入后在下拉里选中它，界面会提示该源是否可用
3. 源从哪来**请自行判断** —— 本项目不提供、不托管、不推荐任何源

「自定义源」是上游 LX Music 的开放机制：一个源就是一段声明了自己能力的脚本，泛音把它
交给 `src/renderer-scripts/` 的沙箱执行，只接受它返回的**音频地址 / 歌词 / 封面**。
地址的正确性与可用性由源负责，本项目无法校验；当然，它与本机解码器之间还有一个好处：
音频始终在本机播放，不上传任何服务器。

> 这条边界是刻意的。Folia 带来的 AI 歌词分词与音源分离，技术含量远高于「再接一个平台
> 音源」；而后者会把整个项目拖进法律风险里 —— 详见下方「红线」。

---

## 开发环境与运行

### 技术栈

- Electron 42+
- Vue 3 + TypeScript
- Webpack 多入口构建（`main` / `renderer` / `renderer-lyric` / `renderer-scripts`）

### 环境要求

- Node.js 18+
- Python 3.8+（编译原生模块用）

### 安装依赖

```bash
npm install
```

> **坑：** 从国内镜像装 `electron` 时，包的 `scripts` 字段可能丢失，导致 Electron 二进制不会自动下载，
> `node_modules/electron/dist` 不存在。补一句即可：
>
> ```bash
> cd node_modules/electron
> ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" node install.js
> cd ../..
> ```

### 启动开发模式

```bash
npm run dev
```

> **坑（Windows）：** 如果所在终端环境注入了 `ELECTRON_RUN_AS_NODE=1`，
> Electron 会以纯 Node 模式启动，报
> `TypeError: Not running in an Electron environment!`。
> 启动前去掉这个变量即可：
>
> ```bash
> env -u ELECTRON_RUN_AS_NODE npm run dev
> ```

开发模式会同时编译四个入口，**四个都编译成功才会拉起 Electron 窗口**。
脚本在 `build-config/runner-dev.js`。

### 构建

```bash
# Windows 安装包
npm run pack:win:setup

# 其他目标见 package.json 的 scripts
```

---

## 数据存储目录

- Linux：`$XDG_CONFIG_HOME/overtone` 或 `~/.config/overtone`
- macOS：`~/Library/Application Support/overtone`
- Windows：`%APPDATA%/overtone`

实际的库文件与设置在 `<userData>/OvertoneData/` 下：
`overtone.data.db`（SQLite）、各 `*.json`（设置、列表、自定义源）。

> Windows 上若程序目录存在 `portable` 文件夹，则自动改用该文件夹作为数据目录。

---

## 目录结构

```
.
├── src/
│   ├── common/            # 主进程与渲染进程共享的代码（常量、IPC 契约名、工具）
│   │   ├── ipcNames.ts    # IPC 契约的唯一来源，命名规则 `${模块名}_${事件名}`
│   │   ├── mainIpc.ts     # 主进程侧 IPC 封装
│   │   └── rendererIpc.ts # 渲染进程侧 IPC 封装
│   ├── main/              # Electron 主进程
│   │   ├── modules/       # 各功能模块（winMain / winLyric / sync / userApi / tray ...）
│   │   └── worker/        # 数据库等重活
│   ├── renderer/          # 主窗口（Vue 3，906 个组件）
│   ├── renderer-lyric/    # 桌面歌词窗口
│   └── renderer-scripts/  # 自定义源的沙箱运行环境
├── build-config/          # 构建脚本（dev runner / electron-builder 配置）
├── publish/               # 发版脚本与版本信息
├── licenses/              # 安装程序与 AppImage 内嵌的许可协议
└── doc/                   # 文档与截图
```

### 加一个新能力的标准三步

这个项目的 IPC 是**契约驱动**的，加功能只需三步：

1. **声明契约** —— 在 `src/common/ipcNames.ts` 里给模块加事件名：

   ```ts
   const modules = {
     // ...
     ai: {
       segment_lyric: '',
       get_ai_config: '',
     },
   }
   ```

2. **主进程实现** —— 在 `src/main/modules/` 下新建目录并在 `index.ts` 注册：

   ```ts
   import { mainHandle } from '@common/mainIpc'
   import { WIN_MAIN_RENDERER_EVENT_NAME } from '@common/ipcNames'

   mainHandle(WIN_MAIN_RENDERER_EVENT_NAME.get_ai_config, async() => {
     return getStore(STORE_NAMES.AI).get('config')
   })
   ```

3. **渲染进程调用** —— 在页面里：

   ```ts
   import { rendererInvoke } from '@common/rendererIpc'
   const result = await rendererInvoke(WIN_MAIN_RENDERER_EVENT_NAME.segment_lyric, payload)
   ```

---

## 贡献

欢迎 PR。但请注意：**不要提交任何音乐平台的接口实现、加密算法或逆向代码**，
这类 PR 会被直接关闭（见下方「红线」）。

---

## 许可证

本项目基于 [GNU Affero General Public License v3.0](./LICENSE) 发行。

以下协议是对于 GNU AGPL v3.0 的补充，如有冲突，以以下协议为准。

*词语约定：本协议中的「本项目」指 泛音（Overtone）桌面版项目，它基于 LX Music（洛雪音乐助手）与 Folia 二次开发而成；「使用者」指签署本协议的使用者；「官方音乐平台」指使用者通过自行导入的「自定义源」所可能访问到的各个音乐平台（**本项目本身不内置、不提供任何平台源**）；「版权数据」指包括但不限于图像、音频、名字等在内的他人拥有所属版权的数据。*

### 一、数据来源

1.1 本项目的**代码不内置、也不调用任何音乐平台的接口** —— 不会向音乐平台发起搜索、取音频链接、取歌词、取榜单之类的请求。使用者自行导入的「自定义源」若访问了平台服务器，属于使用者自身的行为，因此本项目不对其数据的合法性、准确性负责。

*唯一可能的例外是**图片**：使用者本机既有的音乐数据里若记着某个平台 CDN 上的封面地址（早先版本抓取时写入的），界面会照常加载那张图，因而可能产生对平台 CDN 的图片请求。这不是接口调用，也与本项目是否内置源无关 —— 本项目无从在加载前逐一改写使用者自己的数据。*

1.2 本项目本身没有获取某个音频数据的能力，本项目使用的在线音频数据来源来自软件设置内「自定义源」设置所选择的「源」返回的在线链接。例如播放某首歌，本项目所做的只是将希望播放的歌曲名、艺术家等信息传递给「源」，若「源」返回了一个链接，则本项目将认为这就是该歌曲的音频数据而进行使用，至于这是不是正确的音频数据本项目无法校验其准确性，所以使用本项目的过程中可能会出现希望播放的音频与实际播放的音频不对应或者无法播放的问题。

1.3 本项目的非官方平台数据（例如「我的列表」内列表）来自使用者本地系统或者使用者连接的同步服务，本项目不对这些数据的合法性、准确性负责。

### 二、版权数据

2.1 使用本项目的过程中可能会产生版权数据。对于这些版权数据，本项目不拥有它们的所有权。为了避免侵权，使用者务必在 **24 小时内** 清除使用本项目的过程中所产生的版权数据。

### 三、音乐平台别名

3.1 本项目内保留的平台别名（用于显示历史数据的来源）仅为对该平台的一个称呼，不包含恶意。如果官方音乐平台觉得不妥，可联系本项目更改或移除。

### 四、资源使用

4.1 本项目内使用的部分包括但不限于字体、图片等资源来源于互联网。如果出现侵权可联系本项目移除。

### 五、免责声明

5.1 由于使用本项目产生的包括由于本协议或由于使用或无法使用本项目而引起的任何性质的任何直接、间接、特殊、偶然或结果性损害（包括但不限于因商誉损失、停工、计算机故障或故障引起的损害赔偿，或任何及所有其他商业损害或损失）由使用者负责。

### 六、使用限制

6.1 本项目完全免费，且开源发布于 GitHub 面向全世界人用作对技术的学习交流。本项目不对项目内的技术可能存在违反当地法律法规的行为作保证。

6.2 **禁止在违反当地法律法规的情况下使用本项目。** 对于使用者在明知或不知当地法律法规不允许的情况下使用本项目所造成的任何违法违规行为由使用者承担，本项目不承担由此造成的任何直接、间接、特殊、偶然或结果性责任。

### 七、版权保护

7.1 音乐平台不易，请尊重版权，支持正版。

### 八、非商业性质

8.1 本项目仅用于对技术可行性的探索及研究，不接受任何商业（包括但不限于广告等）合作及捐赠。

### 九、开源与二次开发

9.1 本项目基于 LX Music（Apache-2.0）与 Folia（AGPL-3.0）二次开发，整体以 GNU AGPL v3.0 发行。依据 AGPL v3.0 第 13 条，若你以网络服务形式提供本项目的修改版本，必须向所有通过网络与之交互的使用者提供对应完整源代码。

9.2 你必须保留本项目的版权声明与来源声明，不得移除或篡改对 LX Music、Folia 及本项目上游贡献者的署名。

### 十、接受协议

10.1 若你使用了本项目，即代表你接受本协议。

---

## 红线（写给所有参与者）

以下内容**永远不进入本仓库**：

1. 任何音乐平台（netease / qq / kugou / migu / kuwo / bodian 等）的接口逆向实现、
   加密算法、签名逻辑、私有协议代码。
2. 任何音频文件、歌词数据、专辑封面等版权素材。
3. 任何绕过平台版权保护或付费墙的技术方案。

在线播放能力只通过「自定义源」机制对外开放，源由使用者自行提供。

---

## 致谢

- [LX Music](https://github.com/lyswhut/lx-music-desktop) —— 落雪无痕 (lyswhut) 及所有贡献者
- [Folia](https://github.com/chthollyphile/folia-major) —— 冬霧 (chthollyphile) 及所有贡献者

没有这两个项目，就没有泛音。
