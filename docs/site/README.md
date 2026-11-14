# 泛音 Overtone — 产品官网

独立静态站点，不依赖框架、构建工具或第三方脚本。内容与素材基于 GitHub 仓库
[huimou612/overtone](https://github.com/huimou612/overtone) 的真实信息（v0.4.0）。

## 本地预览

在 `F:\deepseek` 下执行：

```bash
python -m http.server 4173 --directory overtone-site
```

然后访问 <http://localhost:4173/>。也可以用任意静态服务器（如 `npx serve overtone-site`），
或直接双击 `index.html`（建议用本地服务器，避免个别浏览器对 `file://` 的限制）。

## 目录结构

```
overtone-site/
├── index.html                 # 单页官网
├── assets/
│   ├── style.css              # 设计系统、布局、响应式、减少动效
│   ├── main.js                # 三幕滚动粒子、下载渠道配置、导航、画廊筛选与灯箱
│   ├── favicon.svg            # 备用矢量图标（当前页面未引用，可保留或删除）
│   └── images/
│       ├── icon.png           # 仓库真实产品图标（256×256），页面与 favicon 均使用它
│       ├── app.png            # 早期主界面截图（备用，当前页面未引用）
│       └── v040-01..09.jpeg   # v0.4.0 Windows 桌面版 9 张真实运行截图（1280×828）
└── README.md
```

## 首屏：三幕滚动粒子

参考 0xlei.tech 的「形态跟着滚动走」，首屏做成 3 个视口高的 sticky 舞台：

- 画布固定在视口，滚动进度依次切换 `泛音` → `OVERTONE` → `声波` 三个形态；**往回滚会倒放**。
- 三幕文案随之淡入淡出，右侧有 `01 / 03` 进度条；点形态按钮会平滑滚到对应幕。
- Canvas 2D 把文字绘制到离屏画布、按像素采样成约 1300–3200 个粒子（随视口调整），采样带抖动避免点阵感。
- 入场错峰汇聚；鼠标 / 触摸移动推开附近粒子，弹簧力再拉回；变形时带旋涡脉冲。
- 颜色沿青 → 蓝 → 紫渐变，另有少量缓慢上浮的环境光点。
- 性能：仅在首屏可见且页面可见时运行 rAF；缩放防抖重采样；DPR 上限 2。
- 降级：`prefers-reduced-motion: reduce` 或无 JS 时不加 `hero-multi` 类，首屏退回**单屏静态大字**，只显示第一幕。

## 下载渠道配置

所有网盘链接集中在 `assets/main.js` 顶部的 `DOWNLOAD` 对象（**只需改这一处**）：

```js
var DOWNLOAD = {
  github: 'https://github.com/huimou612/overtone/releases/tag/v0.4.0',
  primary: 'https://pan.quark.cn/s/cb4287d938ee', // 「直接下载」按钮跳转地址
  pans: [
    { name: '夸克网盘', url: 'https://pan.quark.cn/s/cb4287d938ee', code: '' },
    { name: '百度云', url: 'https://pan.baidu.com/s/1Rp4Z-ol_l6B7COjvKruAlQ?pwd=p6l0', code: 'p6l0' }
  ]
};
```

- 每个网盘可各自带 `code`（提取码），有码的渠道会在链接旁显示「提取码 xxxx」。
- 留空时显示「网盘链接待补充」占位说明，**不会生成假链接或空跳转**。
- 首屏主按钮「直接下载」直跳 `primary`（国内优先夸克）；「网盘下载」、下载页提示框、发布卡片按钮均打开同一个「获取方式」弹窗，列出夸克/百度/GitHub；支持 Esc、点遮罩关闭与焦点归还。

## 内容依据

- 产品定位：以 LX Music（Apache-2.0）为外壳、Folia（AGPL-3.0）的视觉与 AI 能力为内核的二次开发桌面音乐软件。
- 功能：15 种歌词视觉、6 种背景、AI 逐字分词、HTDemucs 音源分离、Electron safeStorage 凭据存储、搜索联想、WebGL2 降级。
- 技术栈：Electron 42+ / Vue 3 + TypeScript / Webpack 四入口 / Node 18+ / Python 3.8+。
- 版本：v0.4.0（2026-10-25）为最新版；v0.3.0 / v0.2.0 / v0.1.0 在历史版本中列出。
- 许可：GNU AGPL-3.0 + 仓库补充协议；不接受商业合作及捐赠。

## 链接说明

- 所有外部链接均为真实存在的 GitHub 地址（仓库、Releases、Issues、PR、LICENSE、CHANGELOG、FOLIA-INAPP.md、FAQ、作者主页、上游项目）。
- 「联系与反馈」提供作者邮箱 `2027463893@qq.com` 与 GitHub 入口（Issue / PR / 作者主页）。
- 在线播放只走「自定义源」机制；本站不提供、不托管、不推荐任何源。

## 说明

- 站点没有外部资源请求（图片、字体、脚本均本地），可离线打开。
- 桌面端应用与本站完全隔离，本站不修改、不依赖桌面端代码。
