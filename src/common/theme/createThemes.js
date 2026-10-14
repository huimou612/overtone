//! 更新默认主题配置后，需要执行 npm run build:theme 重新构建 index.json
//! 同时会把 defaultThemes[0]（默认主题）的颜色同步回
//! src/renderer/assets/styles/index.less 的 :root 兜底色块（主题 JSON 加载前的首屏底色）

const fs = require('fs')
const path = require('path')
const { createThemeColors } = require('./utils')

const defaultThemes = [
  {
    // 泛音的品牌默认主题：取应用图标主色（靛紫 #4F46E5），与图标渐变保持一致
    id: 'overtone',
    name: '余音绕梁',
    isDark: false,
    isDarkFont: false,
    config: {
      primary: 'rgb(79, 70, 229)',
      font: 'rgb(33, 33, 33)',
      '--color-app-background': 'var(--color-primary-light-600-alpha-700)',
      '--color-main-background': 'rgba(255, 255, 255, 1)',
      '--color-nav-font': 'var(--color-primary)',
      '--background-image': 'none',
      '--background-video': '',
      '--background-blur': '0',
      '--background-mask': '0',
      '--background-image-position': 'center',
      '--background-image-size': 'cover',

      '--color-btn-hide': '#3bc2b2',
      '--color-btn-min': '#85c43b',
      '--color-btn-close': '#fab4a0',

      '--color-badge-primary': 'var(--color-primary)',
      '--color-badge-secondary': '#9333ea',
      '--color-badge-tertiary': '#a78bfa',
    },
  },
  {
    id: 'overtone_dark',
    name: '夜色泛音',
    isDark: true,
    isDarkFont: false,
    config: {
      // 深色下用更亮的靛蓝（#818CF8），保证在深底上有足够对比度
      primary: 'rgb(129, 140, 248)',
      font: 'rgb(229, 229, 229)',
      '--color-app-background': 'rgba(0, 0, 0, 0)',
      '--color-main-background': 'rgba(19, 19, 19, 0.9)',
      '--color-nav-font': 'var(--color-primary)',
      '--background-image': 'none',
      '--background-video': '',
      '--background-blur': '0',
      '--background-mask': '0',
      '--background-image-position': 'center',
      '--background-image-size': 'cover',

      '--color-btn-hide': '#3bc2b2',
      '--color-btn-min': '#85c43b',
      '--color-btn-close': '#fab4a0',

      '--color-badge-primary': 'var(--color-primary-dark-200)',
      '--color-badge-secondary': 'var(--color-primary)',
      '--color-badge-tertiary': 'var(--color-primary-dark-300)',
    },
  },
  {
    /*
      通透主题：与「余音绕梁」同色系，唯一区别是内容层带 alpha。
      做它的原因是「壁纸与封面取色默认看不见」—— 那两者都在背景层，
      而默认主题的内容背景（--color-main-background）是不透明白，
      播放详情页的 .bg::after 又正好拿它当遮罩，于是壁纸被整个盖住。
      上游的解法是「主题自己决定透不透」，所以这里补一套开箱即用的。
      两个背景刻意用中性黑白而不是主色派生（默认主题用的就是
      --color-primary-light-600-alpha-* 这种）：
      主色会稀释封面取色的色相，而通透主题的意义正是让歌的颜色当主角。
    */
    id: 'overtone_glass',
    name: '澄澈泛音',
    isDark: false,
    isDarkFont: false,
    config: {
      primary: 'rgb(79, 70, 229)',
      font: 'rgb(33, 33, 33)',
      '--color-app-background': 'rgba(255, 255, 255, 0.35)',
      '--color-main-background': 'rgba(255, 255, 255, 0.62)',
      '--color-nav-font': 'var(--color-primary)',
      '--background-image': 'none',
      '--background-video': '',
      // 半透明的内容层上要压一点模糊，文字才不会跟壁纸的细节打架
      '--background-blur': '14',
      '--background-mask': '16',
      '--background-image-position': 'center',
      '--background-image-size': 'cover',

      '--color-btn-hide': '#3bc2b2',
      '--color-btn-min': '#85c43b',
      '--color-btn-close': '#fab4a0',

      '--color-badge-primary': 'var(--color-primary)',
      '--color-badge-secondary': '#9333ea',
      '--color-badge-tertiary': '#a78bfa',
    },
  },
  {
    id: 'overtone_glass_dark',
    name: '澄澈夜色',
    isDark: true,
    isDarkFont: false,
    config: {
      primary: 'rgb(129, 140, 248)',
      font: 'rgb(229, 229, 229)',
      '--color-app-background': 'rgba(0, 0, 0, 0.25)',
      '--color-main-background': 'rgba(19, 19, 19, 0.72)',
      '--color-nav-font': 'var(--color-primary)',
      '--background-image': 'none',
      '--background-video': '',
      '--background-blur': '14',
      '--background-mask': '16',
      '--background-image-position': 'center',
      '--background-image-size': 'cover',

      '--color-btn-hide': '#3bc2b2',
      '--color-btn-min': '#85c43b',
      '--color-btn-close': '#fab4a0',

      '--color-badge-primary': 'var(--color-primary-dark-200)',
      '--color-badge-secondary': 'var(--color-primary)',
      '--color-badge-tertiary': 'var(--color-primary-dark-300)',
    },
  },
  {
    id: 'green',
    name: '绿意盎然',
    isDark: false,
    isDarkFont: false,
    config: {
      primary: 'rgb(77, 175, 124)',
      font: 'rgb(33, 33, 33)',
      '--color-app-background': 'var(--color-primary-light-600-alpha-700)',
      '--color-main-background': 'rgba(255, 255, 255, 1)',
      '--color-nav-font': 'var(--color-primary)',
      '--background-image': 'none',
      '--background-video': '',
      '--background-blur': '0',
      '--background-mask': '0',
      '--background-image-position': 'center',
      '--background-image-size': 'cover',

      '--color-btn-hide': '#3bc2b2',
      '--color-btn-min': '#85c43b',
      '--color-btn-close': '#fab4a0',

      '--color-badge-primary': 'var(--color-primary)',
      '--color-badge-secondary': '#4baed5',
      '--color-badge-tertiary': '#e7aa36',
    },
  },
  {
    id: 'blue',
    name: '蓝田生玉',
    isDark: false,
    isDarkFont: false,
    config: {
      primary: 'rgb(52, 152, 219)',
      font: 'rgb(33, 33, 33)',
      '--color-app-background': 'var(--color-primary-light-600-alpha-700)',
      '--color-main-background': 'rgba(255, 255, 255, 1)',
      '--color-nav-font': 'var(--color-primary)',
      '--background-image': 'none',
      '--background-video': '',
      '--background-blur': '0',
      '--background-mask': '0',
      '--background-image-position': 'center',
      '--background-image-size': 'cover',

      '--color-btn-hide': '#3bc2b2',
      '--color-btn-min': '#85c43b',
      '--color-btn-close': '#fab4a0',

      '--color-badge-primary': 'var(--color-primary)',
      '--color-badge-secondary': '#5cbf9b',
      '--color-badge-tertiary': '#5cbf9b',
    },
  },
  {
    id: 'blue_plus',
    name: '蛋雅深蓝',
    isDark: false,
    isDarkFont: false,
    config: {
      primary: 'rgb(77, 131, 175)',
      font: 'rgb(33, 33, 33)',
      '--color-app-background': 'var(--color-primary-light-600-alpha-600)',
      '--color-main-background': 'rgba(255, 255, 255, 1)',
      '--color-nav-font': 'var(--color-primary)',
      '--background-image': 'none',
      '--background-video': '',
      '--background-blur': '0',
      '--background-mask': '0',
      '--background-image-position': 'center',
      '--background-image-size': 'cover',

      '--color-btn-hide': '#3bc2b2',
      '--color-btn-min': '#85c43b',
      '--color-btn-close': '#fab4a0',

      '--color-badge-primary': 'var(--color-primary)',
      '--color-badge-secondary': 'rgba(66.6, 150.7, 171, 1)',
      '--color-badge-tertiary': 'rgba(54, 196, 231, 1)',
    },
  },
  {
    id: 'orange',
    name: '橙黄橘绿',
    isDark: false,
    isDarkFont: false,
    config: {
      primary: 'rgb(245, 171, 53)',
      font: 'rgb(33, 33, 33)',
      '--color-app-background': 'var(--color-primary-light-600-alpha-700)',
      '--color-main-background': 'rgba(255, 255, 255, 1)',
      '--color-nav-font': 'var(--color-primary)',
      '--background-image': 'none',
      '--background-video': '',
      '--background-blur': '0',
      '--background-mask': '0',
      '--background-image-position': 'center',
      '--background-image-size': 'cover',

      '--color-btn-hide': '#3bc2b2',
      '--color-btn-min': '#85c43b',
      '--color-btn-close': '#fab4a0',

      '--color-badge-primary': 'var(--color-primary)',
      '--color-badge-secondary': '#9ed458',
      '--color-badge-tertiary': '#9ed458',
    },
  },
  {
    id: 'red',
    name: '热情似火',
    isDark: false,
    isDarkFont: false,
    config: {
      primary: 'rgb(214, 69, 65)',
      font: 'rgb(33, 33, 33)',
      '--color-app-background': 'var(--color-primary-light-600-alpha-700)',
      '--color-main-background': 'rgba(255, 255, 255, 1)',
      '--color-nav-font': 'var(--color-primary)',
      '--background-image': 'none',
      '--background-video': '',
      '--background-blur': '0',
      '--background-mask': '0',
      '--background-image-position': 'center',
      '--background-image-size': 'cover',

      '--color-btn-hide': '#3bc2b2',
      '--color-btn-min': '#85c43b',
      '--color-btn-close': '#fab4a0',

      '--color-badge-primary': 'var(--color-primary)',
      '--color-badge-secondary': '#dfbb6b',
      '--color-badge-tertiary': '#dfbb6b',
    },
  },
  {
    id: 'pink',
    name: '粉装玉琢',
    isDark: false,
    isDarkFont: false,
    config: {
      primary: 'rgb(241, 130, 141)',
      font: 'rgb(33, 33, 33)',
      '--color-app-background': 'var(--color-primary-light-600-alpha-700)',
      '--color-main-background': 'rgba(255, 255, 255, 1)',
      '--color-nav-font': 'var(--color-primary)',
      '--background-image': 'none',
      '--background-video': '',
      '--background-blur': '0',
      '--background-mask': '0',
      '--background-image-position': 'center',
      '--background-image-size': 'cover',

      '--color-btn-hide': '#3bc2b2',
      '--color-btn-min': '#85c43b',
      '--color-btn-close': '#fab4a0',

      '--color-badge-primary': 'var(--color-primary)',
      '--color-badge-secondary': '#f5b684',
      '--color-badge-tertiary': '#f5b684',
    },
  },
  {
    id: 'purple',
    name: '重斤球紫',
    isDark: false,
    isDarkFont: false,
    config: {
      primary: 'rgb(155, 89, 182)',
      font: 'rgb(33, 33, 33)',
      '--color-app-background': 'var(--color-primary-light-600-alpha-700)',
      '--color-main-background': 'rgba(255, 255, 255, 1)',
      '--color-nav-font': 'var(--color-primary)',
      '--background-image': 'none',
      '--background-video': '',
      '--background-blur': '0',
      '--background-mask': '0',
      '--background-image-position': 'center',
      '--background-image-size': 'cover',

      '--color-btn-hide': '#3bc2b2',
      '--color-btn-min': '#85c43b',
      '--color-btn-close': '#fab4a0',

      '--color-badge-primary': 'var(--color-primary)',
      '--color-badge-secondary': '#e5a39f',
      '--color-badge-tertiary': '#e5a39f',
    },
  },
  {
    id: 'grey',
    name: '灰常美丽',
    isDark: false,
    isDarkFont: false,
    config: {
      primary: 'rgb(108, 122, 137)',
      font: 'rgb(33, 33, 33)',
      '--color-app-background': 'var(--color-primary-light-600-alpha-700)',
      '--color-main-background': 'rgba(255, 255, 255, 1)',
      '--color-nav-font': 'var(--color-primary)',
      '--background-image': 'none',
      '--background-video': '',
      '--background-blur': '0',
      '--background-mask': '0',
      '--background-image-position': 'center',
      '--background-image-size': 'cover',

      '--color-btn-hide': '#3bc2b2',
      '--color-btn-min': '#85c43b',
      '--color-btn-close': '#fab4a0',

      '--color-badge-primary': 'var(--color-primary)',
      '--color-badge-secondary': '#b19b9f',
      '--color-badge-tertiary': '#b19b9f',
    },
  },
  {
    id: 'ming',
    name: '青出于黑',
    isDark: false,
    isDarkFont: false,
    config: {
      primary: 'rgb(51, 110, 123)',
      font: 'rgb(33, 33, 33)',
      '--color-app-background': 'var(--color-primary-light-600-alpha-700)',
      '--color-main-background': 'rgba(255, 255, 255, 1)',
      '--color-nav-font': 'var(--color-primary)',
      '--background-image': 'none',
      '--background-video': '',
      '--background-blur': '0',
      '--background-mask': '0',
      '--background-image-position': 'center',
      '--background-image-size': 'cover',

      '--color-btn-hide': '#3bc2b2',
      '--color-btn-min': '#85c43b',
      '--color-btn-close': '#fab4a0',

      '--color-badge-primary': 'var(--color-primary)',
      '--color-badge-secondary': '#6376a2',
      '--color-badge-tertiary': '#6376a2',
    },
  },
  {
    id: 'blue2',
    name: '清热板蓝',
    isDark: false,
    isDarkFont: false,
    config: {
      primary: 'rgb(79, 98, 208)',
      font: 'rgb(33, 33, 33)',
      '--color-app-background': 'var(--color-primary-light-600-alpha-700)',
      '--color-main-background': 'rgba(255, 255, 255, 1)',
      '--color-nav-font': 'var(--color-primary)',
      '--background-image': 'none',
      '--background-video': '',
      '--background-blur': '0',
      '--background-mask': '0',
      '--background-image-position': 'center',
      '--background-image-size': 'cover',

      '--color-btn-hide': '#3bc2b2',
      '--color-btn-min': '#85c43b',
      '--color-btn-close': '#fab4a0',

      '--color-badge-primary': 'var(--color-primary)',
      '--color-badge-secondary': '#b080db',
      '--color-badge-tertiary': '#b080db',
    },
  },
  {
    id: 'black',
    name: '黑灯瞎火',
    isDark: true,
    isDarkFont: false,
    config: {
      primary: 'rgb(150, 150, 150)',
      font: 'rgb(229, 229, 229)',
      '--color-app-background': 'rgba(0, 0, 0, 0)',
      '--color-main-background': 'rgba(19, 19, 19, 0.9)',
      '--color-nav-font': 'var(--color-primary)',
      '--background-image': 'url(./theme_images/landingMoon.png)',
      '--background-video': '',
      '--background-blur': '0',
      '--background-mask': '0',
      '--background-image-position': 'center',
      '--background-image-size': 'cover',

      '--color-btn-hide': '#3bc2b2',
      '--color-btn-min': '#85c43b',
      '--color-btn-close': '#fab4a0',

      '--color-badge-primary': 'var(--color-primary-dark-200)',
      '--color-badge-secondary': 'var(--color-primary)',
      '--color-badge-tertiary': 'var(--color-primary-dark-300)',
    },
  },
  {
    id: 'mid_autumn',
    name: '月里嫦娥',
    isDark: false,
    isDarkFont: false,
    config: {
      primary: 'rgb(74, 55, 82)',
      font: 'rgb(33, 33, 33)',
      '--color-app-background': 'rgba(255, 255, 255, 0)',
      '--color-main-background': 'rgba(255, 255, 255, 0.9)',
      '--color-nav-font': 'var(--color-primary-light-600)',
      '--background-image': 'url(./theme_images/jqbg.jpg)',
      '--background-video': '',
      '--background-blur': '0',
      '--background-mask': '0',
      '--background-image-position': 'center',
      '--background-image-size': 'cover',


      '--color-btn-hide': '#3bc2b2',
      '--color-btn-min': '#85c43b',
      '--color-btn-close': '#fab4a0',

      '--color-badge-primary': 'var(--color-primary)',
      '--color-badge-secondary': '#af9479',
      '--color-badge-tertiary': '#af9479',
    },
  },
  {
    id: 'naruto',
    name: '木叶之村',
    isDark: false,
    isDarkFont: false,
    config: {
      primary: 'rgb(87, 144, 167)',
      font: 'rgb(33, 33, 33)',
      '--color-app-background': 'rgba(255, 255, 255, 0.15)',
      '--color-main-background': 'rgba(255, 255, 255, 0.8)',
      '--color-nav-font': 'var(--color-primary)',
      '--background-image': 'url(./theme_images/myzcbg.jpg)',
      '--background-video': '',
      '--background-blur': '0',
      '--background-mask': '0',
      '--background-image-position': 'center',
      '--background-image-size': 'cover',

      '--color-btn-hide': '#3bc2b2',
      '--color-btn-min': '#85c43b',
      '--color-btn-close': '#fab4a0',

      '--color-badge-primary': 'var(--color-primary)',
      '--color-badge-secondary': 'var(--color-primary-light-100)',
      '--color-badge-tertiary': 'var(--color-primary-light-100)',
    },
  },
  {
    id: 'china_ink',
    name: '近墨者黑',
    isDark: false,
    isDarkFont: false,
    config: {
      primary: 'rgba(47, 47, 47, 1)',
      font: 'rgb(33, 33, 33)',
      '--color-app-background': 'rgba(255, 255, 255, 0)',
      '--color-main-background': 'rgba(255, 255, 255, 0.8)',
      '--color-nav-font': 'var(--color-primary)',
      '--background-image': 'url(./theme_images/china_ink.jpg)',
      '--background-video': '',
      '--background-blur': '0',
      '--background-mask': '0',
      '--background-image-position': 'center',
      '--background-image-size': 'cover',


      '--color-btn-hide': 'rgba(183, 212, 208, 1)',
      '--color-btn-min': 'rgba(200, 214, 183, 1)',
      '--color-btn-close': 'rgba(218, 195, 188, 1)',

      '--color-badge-primary': 'rgba(137, 70, 70, 1)',
      '--color-badge-secondary': 'rgba(67, 139, 65, 1)',
      '--color-badge-tertiary': 'rgba(132, 135, 65, 1)',
    },
  },
  {
    id: 'happy_new_year',
    name: '新年快乐',
    isDark: false,
    isDarkFont: false,
    config: {
      primary: 'rgb(192, 57, 43)',
      font: 'rgb(33, 33, 33)',
      '--color-app-background': 'rgba(255, 255, 255, 0.15)',
      '--color-main-background': 'rgba(255, 255, 255, 0.8)',
      '--color-nav-font': 'var(--color-primary)',
      '--background-image': 'url(./theme_images/xnkl.png)',
      '--background-video': '',
      '--background-blur': '0',
      '--background-mask': '0',
      '--background-image-position': 'center',
      '--background-image-size': 'cover',

      '--color-btn-hide': '#3bc2b2',
      '--color-btn-min': '#85c43b',
      '--color-btn-close': '#fab4a0',

      '--color-badge-primary': '#7fb575',
      '--color-badge-secondary': '#dfbb6b',
      '--color-badge-tertiary': 'var(--color-primary-light-100)',
    },
  },
]

const themes = defaultThemes.map(({ config: { primary, font, ...extInfo }, ...themeInfo }) => {
  return {
    ...themeInfo,
    isCustom: false,
    config: {
      themeColors: createThemeColors(primary, font, themeInfo.isDark),
      extInfo,
    },
  }
})

fs.writeFileSync(path.join(__dirname, 'index.json'), JSON.stringify(themes, null, 2))

// index.less 的 :root 块是主题 JSON 异步加载完成前的首屏兜底色。
// 它里面近 260 行由 --color-primary* / --color-theme / --color-000~1000 组成，
// 正好等于 createThemeColors(默认主题) 的输出；这部分以前是手工维护的，
// 换默认主题时极易漏改，导致启动瞬间闪一下旧主题的色。
// 这里按变量名逐行替换值（保持原有行序与格式），使兜底色随默认主题自动跟进。
const syncIndexLessFallback = () => {
  const { primary, font } = defaultThemes[0].config
  const { isDark, isDarkFont } = defaultThemes[0]
  const colors = createThemeColors(primary, font, isDark, isDarkFont)

  const lessPath = path.join(__dirname, '../../renderer/assets/styles/index.less')
  const lines = fs.readFileSync(lessPath, 'utf-8').split('\n')

  const start = lines.findIndex((line) => /^\s*:root\s*\{\s*$/.test(line))
  if (start === -1) throw new Error('index.less 中未找到 :root 块')
  let end = -1
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\s*\}\s*$/.test(lines[i])) {
      end = i
      break
    }
  }
  if (end === -1) throw new Error('index.less 中 :root 块缺少结束括号')

  let changed = 0
  for (let i = start + 1; i < end; i += 1) {
    // 末位捕获 \r，保证 CRLF 文件被改写后行尾不退化（否则会写出混合行尾）
    const match = /^(\s*)(--[\w-]+):[ \t]*(.+?);[ \t]*(\r?)$/.exec(lines[i])
    if (!match) continue // 跳过注释行、选择器行
    const [, indent, name, , cr] = match
    const value = colors[name]
    if (value == null) continue // 非主题派生变量（按钮色、结构变量等）保持原样
    const next = `${indent}${name}: ${value};${cr}`
    if (next !== lines[i]) {
      lines[i] = next
      changed += 1
    }
  }

  if (changed > 0) {
    fs.writeFileSync(lessPath, lines.join('\n'))
    console.log(`index.less :root 兜底色已同步为「${defaultThemes[0].name}」（${changed} 处）`)
  } else {
    console.log(`index.less :root 兜底色已是最新（${defaultThemes[0].name}）`)
  }
}

syncIndexLessFallback()

