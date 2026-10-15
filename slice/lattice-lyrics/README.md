# lattice-lyrics —— Folia 招牌歌词视觉切片（阶段 8）

这个目录**不是**手写的，是 [`.git/slice-extract.js`](../../.git/slice-extract.js) 从 Folia 源码
（`fusion-music/reference/folia-major`，**不在本仓库内**）里**自动提取并裁剪**出来的。

## 这是什么

Folia 最值钱的视觉是它播放页那台「格子歌词」：canvas + Pixi 渲染，
逐字上色、词块按时间轴弹动。泛音要拿的就是这一块 —— 不是「第二套界面」，
而是把个性模式的播放页换成它（见 `docs/development/06-个性化外壳.md` 第 3 节）。

## 目录为什么这么深

刻意**镜像 Folia 原来的 `src/` 结构**（`src/components/...`、`src/utils/...`）。
这样原文件里那些 `../../../utils/...` 的相对 import **一行都不用改**，
提取脚本也就不需要做「重写 import 路径」这种容易出错的事。

## 依赖闭包（实测数字）

| 口径 | 文件数 | 体积 |
|---|---|---|
| **不做裁剪**的朴素闭包 | 97 | 1.66 MB |
| 剪掉 i18n 边之后 | 42 | 234 KB |
| 再加上二阶死代码剔除 | 37 | 218 KB |
| 其中纯类型文件（编译期抹掉） | ~9 | ~81 KB |

朴素闭包为什么会有 1.66 MB —— 见下面两条剪枝。

## 做了哪些裁剪

### 剪枝 1：i18n（1 MB 语言包）

Folia 的 `src/utils/appPlaybackHelpers.ts` 第一行是

```ts
import i18n from '../i18n/config';
```

而 `i18n/config.ts` 又静态引入了三份语言包（`en.ts` / `in.ts` / `zh-CN.ts`，合计 **1,035,890 B**，
占朴素闭包的 62%）。整条路径是：`LatticeLyrics.tsx` → `useLatticeLyricCanvas` →
`createLatticeLyricRuntime` → `latticeLyricTimeline` → `appPlaybackHelpers`。

**而这个链路上只用到 `appPlaybackHelpers` 里的一个纯函数** `findLatestActiveLineIndex`
（10 行，从后往前找当前行）。它整个文件里的 i18n 只服务于另一句
`getReplayGainModeLabel = (mode) => i18n.t(\`replayGain.${mode}\`)`，切片根本用不上。

→ 处理：**整个文件不带走**，把那 10 行就地内联进
`src/components/app/lattice/lyrics/latticeLyricTimeline.ts` 末尾（有注释标明来源）。

### 剪枝 2：四家平台实现（红线）

`src/components/app/lattice/latticeModel.ts` 第 2 行是

```ts
import { getSongArtistLabel, getSongCoverUrl } from '../../../services/onlineMusic/songMetadata';
```

顺着 `songMetadata` → `providerRegistry`，会一次性把
**`neteaseProvider` / `qqProvider` / `kugouProvider` / `services/netease.ts`**
（外加登录自检、扫码诊断、本地数据库）全部拖进依赖图 —— 这正是
`06-个性化外壳.md` 第 4 节警告过的「Folia 自己内置了四家平台的音源实现」。

→ 处理：切片入口对它的引用是 **`import type { LatticeTile }`**，即编译期就消失、
运行期不存在这条边。而且入口只用到 `tile.id` / `tile.title` / `tile.artist` 三个字段
（`buildLatticeTiles` 是海报墙用的，不属于歌词切片）。
所以本目录里那个 `latticeModel.ts` 是**手写的精简版**（只留类型、零 import），
不是 Folia 原文的副本 —— 文件头有说明。

### 二阶死代码剔除

剪枝 1 之后，只有 `appPlaybackHelpers` 用到的几个文件失去了全部引用者，
提取脚本会反复扫描直到稳定，自动剔除：`appPlaybackGuards.ts`、
`utils/lyrics/formatDetection.ts`、`utils/lyrics/validity.ts`、`types/navidrome.ts` 等。

### 体检结论

切片内**没有任何平台实现**。残留的 `netease` / `kugou` / `qq` 字样全部出现在
**类型声明**里（如 `type OnlineProviderId = 'netease' | (string & {})`、
`type LyricProviderSource = 'netease' | 'qq' | 'kugou' | 'amll'`），没有一行 API 调用。

唯一一处「运行期」痕迹本来是 `utils/appPlaybackGuards.ts:58` 的兜底字符串
`(song as any).providerId || 'netease'` —— 而那个文件在二阶裁剪里已经被整个剔除，
所以切片里**连这一处都没有了**。

## 外部 npm 依赖

切片自己需要这些包（**不要装进泛音主渲染进程**，它是给切片单独打包用的）：

| 包 | 引用处 |
|---|---|
| `react` | 8 |
| `pixi.js` | 6（`loadPixi.ts` 是懒加载入口） |
| `framer-motion` | 6 |
| `lucide-react` | 1 |
| `@chenglou/pretext` | 1（`monetLyricsModel.ts`，字形测量） |

## 入口与契约

```tsx
import LatticeLyrics from './src/components/app/lattice/lyrics/LatticeLyrics';

<LatticeLyrics tile={{ id, title, artist }} reducedMotion={bool} />
```

⚠️ `LatticeLyrics.tsx` 的**歌词数据不走 props** —— 它从 `useLatticeLyrics()`
这个 Provider context 拿（`LatticeLyricsProvider.tsx`）。
「改成 props 驱动」是下一步的活，契约定义在 `lyrics/types.ts` 的 `LatticeLyricInput`。

## 状态：**尚未接入**

- 这一版只有源码，**没有**打包配置、没有 webview 接线、没有在泛音里跑起来。
- 它位于 `src/` **之外**，所以 `npm run lint` / `build:main` / `build:renderer`
  都看不到它 —— 加进来不会影响现有门禁，是惰性的。
- 下一步见 `docs/development/09-Folia切片-依赖闭包与裁剪.md`。

## 许可与出处

源码来自 [folia-major](https://github.com/chthollyphile/folia-major)（**AGPL-3.0**），
与本项目整体许可一致，可合法合并。上游版权声明见仓库根目录 `NOTICE`。
**不要**把这里的文件当作手写代码改 —— 要改先改提取脚本，再重新生成。
