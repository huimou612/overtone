# 09 · Folia 视觉切片 —— 依赖闭包与裁剪

> 状态：第 1 步已完成（源码已提取、已裁剪、已自洽）· 2026-10-15
> 产物：`slice/lattice-lyrics/`（37 文件 / 218 KB，其中约 9 个纯类型文件）
> 还没做：打包配置、webview 接线、在泛音里真跑起来。

## 1. 为什么第一步是「算闭包」而不是「抄文件」

阶段 8 的方案是**切片复用**（`06-个性化外壳.md` 第 3 节）：不做第二套界面，
只把 Folia 最值钱的歌词视觉搬过来，用 webview 嵌进 Vue 的个性模式。

原方案里写的是「先做 lattice 歌词的依赖闭包提取与裁剪」。这一节解释为什么
**这一步不能跳**：Folia 的目录看起来边界很干净（`components/app/lattice/lyrics/`，
十几个文件），但它的 import 图**不干净** —— 实测拖进来的东西是本体体积的 **32 倍**，
其中还包含项目红线明确禁止的四家平台音源实现。

盲抄的后果不是「多带几个没用的文件」，而是**把网易云 / QQ / 酷狗的接口实现搬进泛音**。
这不是优化问题，是红线问题。

## 2. 入口

```
src/components/app/lattice/lyrics/LatticeLyrics.tsx        （1,826 B）
```

选它的理由：整个 lattice 目录有 29 个 ts/tsx，但其中 20 多个是**海报墙**（`PosterWall`、
`LatticePoster`、`useWallCameraPan`…）—— 那部分要连接播放队列、相机、指针手势，
是「宿主耦合」的重灾区；而歌词本体是**自包含**的：给它「当前歌 + 时间轴 + 歌词」，
它吐 canvas。

入口本身的契约比预想的干净：

```tsx
export default function LatticeLyrics({ tile, reducedMotion }: {
    tile: LatticeTile; reducedMotion: boolean;
})
```

**已经是 props 驱动**。真正的问题在下一层：歌词数据（逐字时间轴）不从 props 来，
是从 `useLatticeLyrics()` 这个 Provider context 拿的（见第 8 节）。

## 3. 朴素闭包：97 文件 / 1.66 MB

从入口沿 import 图递归（`.git/slice-closure.js`）：

| 分组 | 文件数 | 体积 |
|---|---|---|
| `components/app/lattice/lyrics/`（**切片本体**） | 13 | 52,805 B |
| `components/visualizer/`（含 `monet/`、`backgrounds/`） | 12 | 70,879 B |
| `utils/` + `utils/lyrics/` + `utils/lyrics/providers/` | 31 | 174,512 B |
| `services/` + `services/onlineMusic/` + `services/repositories/` | 26 | 292,779 B |
| `i18n/` + `i18n/locales/` | 5 | **1,041,007 B** |
| `types/` | 4 | 29,501 B |
| `src/types.ts` | 1 | 43,057 B |
| `hooks/` + `stores/` + `shared/` + `components/app/lattice/` | 5 | 9,863 B |
| **合计** | **97** | **1,714,403 B** |

两个数字立刻刺眼：

- `i18n/locales/` 三份语言包 **1,035,890 B**，占整张图的 **60%**；
- `services/onlineMusic/` 里躺着 `kugouProvider.ts`（74,538 B）、`qqProvider.ts`（40,126 B）、
  `neteaseProvider.ts`（31,556 B），外加 `services/netease.ts`（31,161 B）——
  **这就是红线里那四家平台**。

也就是说：**随行依赖是本体的 32 倍**（1,661,598 / 52,805）。

## 4. 反向追溯：污染只有两个咽喉点

`.git/slice-trace.js` 从「必须砍」的节点做反向 BFS，求到入口的**最短路径**。结果非常收敛：

```
LatticeLyrics.tsx
 └ latticeModel.ts
    └ services/onlineMusic/songMetadata.ts
       └ providerRegistry.ts
          ├ neteaseProvider.ts → services/netease.ts
          │                     → loginSelfCheck.ts
          │                     → loginBackendDiagnostics.ts
          │                     → utils/qrLoginDiagnosticReport.ts
          │                     → providerStorage.ts → services/db.ts → appDatabase.ts
          ├ qqProvider.ts
          └ kugouProvider.ts
```

```
LatticeLyrics.tsx
 └ useLatticeLyricCanvas.ts
    └ createLatticeLyricRuntime.ts
       └ latticeLyricTimeline.ts
          └ utils/appPlaybackHelpers.ts
             └ i18n/config.ts
                └ i18n/locales/{en,in,zh-CN}.ts      ← 1 MB
```

**两条链各自只有一个咽喉点，而且都只是一行 import。** 所以「裁剪」不是 84 个文件的体力活，
是 2 处外科手术。

## 5. 两条剪枝

### 剪枝 1：`appPlaybackHelpers.ts` → 就地内联一个函数

`utils/appPlaybackHelpers.ts`（6,417 B）第一行 `import i18n from '../i18n/config'`。
但整条链上**只用到它一个函数**：

```ts
// 从后往前找当前行；10 行，纯函数，无副作用
export const findLatestActiveLineIndex = (lines: LyricData['lines'], time: number) => { ... }
```

它文件里的 i18n 只服务于另一句
`getReplayGainModeLabel = (mode) => i18n.t(\`replayGain.${mode}\`)` —— 切片用不上。

→ **整个文件不带走**，那 10 行内联进 `latticeLyricTimeline.ts` 末尾，
并补一个 `import type { Line, LyricData }`。1 MB 语言包随之消失。

### 剪枝 2：`latticeModel.ts` → 换成只有类型的本地版

见第 4 节的链条。这里的关键判断是：**入口对它的引用是 `import type`**：

```ts
import type { LatticeTile } from '../latticeModel';
```

类型引用在编译期就消失，运行期**根本不存在这条边**。而且入口只用到
`tile.id` / `tile.title` / `tile.artist` —— `buildLatticeTiles`（那个真正调用
`getSongArtistLabel` / `getSongCoverUrl` 的函数）是**海报墙**用的，不属于歌词切片。

→ 处理：切片里的 `latticeModel.ts` 是**手写的精简版**（只留 `LatticeSection` / `LatticeTile`
两个类型、零 import），文件头写明「这不是 Folia 原文的副本，以及为什么」。
四家平台实现随之消失。

### 剪完之后

| | 文件数 | 体积 |
|---|---|---|
| 朴素闭包 | 97 | 1,714,403 B |
| **剪掉 i18n 边**（`.git/slice-trim.js`，含仅类型引用） | 42 | 239,636 B |
| **二阶死代码剔除**（`.git/slice-extract.js`） | 37 | 218,057 B |
| 其中纯类型文件（编译期抹掉、零产物字节） | ~9 | ~81,000 B |

**降了 7.9 倍**，而代价是 1 处内联 + 1 个手写类型文件。

### 二阶剔除了什么

剪枝 1 之后，只有 `appPlaybackHelpers` 用到的几个文件失去全部引用者，
提取脚本反复扫描直到稳定，自动删掉：

```
src/utils/appPlaybackGuards.ts
src/utils/lyrics/formatDetection.ts
src/utils/lyrics/validity.ts
src/types/navidrome.ts
```

## 6. 体检：红线状态

对切片全目录 grep `netease` / `kugou` / `qqProvider` / `onlineMusic`，共 15 处命中，
逐条定性后**全部是类型声明**：

| 位置 | 性质 |
|---|---|
| `src/types.ts:1212` | `export type LyricProviderSource = 'netease' \| 'qq' \| 'kugou' \| 'amll'` |
| `src/types.ts:164` | `type: 'netease'`（联合类型的字面量成员） |
| `src/types/onlineMusic.ts:6` | `export type OnlineProviderId = 'netease' \| (string & {})` |
| `appPlaybackGuards.ts:58` | 唯一的运行期串 `(song as any).providerId \|\| 'netease'` —— **该文件已被二阶剔除** |

**结论：切片里零平台实现、零 API 调用。** 剩下的只是几个字符串字面量的类型联合。

## 7. 工具链

三个脚本都在 `.git/`（不进版本库），从入口一路跑到产物：

```bash
# 1) 朴素闭包：谁进来了、外部 npm 包有哪些、宿主耦合点在哪一行
node .git/slice-closure.js

# 2) 反向追溯：红线与 i18n 各自是怎么被拖进来的（最短链 + 要打的桩在哪一行）
node .git/slice-trace.js

# 3) 模拟剪枝后的闭包，产出 .git/slice-trimmed.json
node .git/slice-trim.js

# 4) 真正提取：复制 + 打桩 + 内联 + 二阶剔除 + 校验自洽，产出 slice/lattice-lyrics/
node .git/slice-extract.js
```

第 4 步结尾的自检是**判据**：切片内每一条相对 import 都必须在切片内解析得到，
输出 `解析失败: 0 处` 才算过（当前 0）。

### 加新文件时要小心

`ln -s` 或手改 `slice/lattice-lyrics/` 都**会被下次提取覆盖**。
要改行为，改 `.git/slice-extract.js` 里的 `DROP` / `REPLACE` / 内联规则，
然后重跑 —— 这也保证了「切片里每个文件为什么长这样」永远可追溯。

## 8. 还没做的

1. **打包**：切片需要独立的 React/Pixi 打包目标（`react` + `pixi.js` + `framer-motion` +
   `lucide-react` + `@chenglou/pretext` 只装给切片，不污染泛音主渲染进程的 bundle）。
   放在现有 webpack 里加一个 entry，还是单开一个 esbuild 配置，要按产物大小决定。
2. **契约**：`LatticeLyrics` 的歌词数据来自 `useLatticeLyrics()`（Provider context），
   不从 props 来。要改成 props 驱动，契约是 `lyrics/types.ts` 的 `LatticeLyricInput`。
3. **接线**：`<webview>` 嵌进 Vue 的播放详情页，数据从泛音的播放状态推过去；
   个性模式下替代默认歌词组件。
4. **验证**：切片目前**一次都没运行过** —— 现有的「依赖自洽」只证明「import 找得到」，
   不证明「能渲染出歌词」。真验证要等打包完成。

### 惰性到什么程度（已核对）

- `npm run lint` 的命令是 `eslint --ext .ts,.js,.vue src` —— 只扫 `src`，**看不到 `slice/`**；
- `build:main` / `build:renderer` 的 ts-loader 只编译从 entry 可达的模块，也不碰 `slice/`；
- `package.json` 里**没有**全仓 `tsc --noEmit` 之类的脚本。

唯一的小债：`tsconfig.json` 没有 `include`/`exclude`，所以 `slice/` 会**被算进父项目的
TS program**（类型感知 lint 会多解析这些文件，但不会被 lint，也不会报错）。
等切片有了自己的构建配置，应该给它一份自己的 `tsconfig.json`，并把 `slice` 加进父项目的
`exclude`。**现在不动父配置** —— 那属于无收益的风险改动。

## 9. 踩到的坑

### 9.1 `existsSync` 会把目录当成模块

提取脚本的二阶剔除第一版把 `src/types.ts` 当成「无人引用」删掉了。
根因：解析 `'../../../../types'` 时按 `['', '.ts', ...]` 依次试，
**空串先命中** —— 而 `src/types/` 是个**同名目录**，`existsSync` 对目录返回 true。
于是「已解析」被记成了目录路径，`src/types.ts` 这个文件自然对不上，被判死。
→ 候选必须用 `isFile()` 判定，不能只看 `existsSync`。

### 9.2 「仅类型引用」的两种口径

算闭包时，`import type {...} from 'x'` 编译期就抹掉，**算产物体积要排除**；
但**提取源码时必须带上**，否则 TS 编译不过、编辑器一片红。
一份清单服务两个目的会出事，所以 `slice-trim.js` 出**两份**：
`inside/outside`（运行期）与 `insideAll/outsideAll`（含类型）；提取用后者。

### 9.3 静态分析分不清「类型位置」

`visualizer/runtime.ts` 写的是 `import { Line } from '../../types'`（**不是** `import type`），
于是 43 KB 的 `src/types.ts` 被算进运行期闭包。但 `Line` 在 `types.ts` 里是
`export interface Line`，在 `runtime.ts` 里只出现在类型位置 —— 编译器照样会整条抹掉。
**纯正则的分析在这件事上只能给上界**，真正的运行期字节数要等打包出来才知道。

## 10. 参照

- 阶段 8 的定位与四种做法 → `06-个性化外壳.md` 第 2、3 节
- 红线为什么被加重（Folia 自己内置四家平台） → `06-个性化外壳.md` 第 4 节
- 切片产物与说明 → `slice/lattice-lyrics/README.md`
- Folia 源码 → `fusion-music/reference/folia-major`（AGPL-3.0，**不在本仓库内**）
