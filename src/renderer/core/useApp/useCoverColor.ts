import { watch } from '@common/utils/vueTools'
import { appSetting } from '@renderer/store/setting'
import { musicInfo } from '@renderer/store/player/state'
import { getCoverImage } from '@renderer/utils/ipc'

/**
 * 跟随封面取色（阶段 7.4）
 *
 * 把当前播放歌曲的封面主色提出来，写成全局 CSS 变量 `--cover-color`，供背景层
 * （AppBackground 的染色层与遮罩）消费。一句话：**界面氛围跟着这首歌走**。
 *
 * 分工：主进程只负责「把封面读成一张 36×36 的 PNG」（见 src/main/modules/coverColor），
 * 颜色量化在这里做 —— 因为 <canvas> 的 getImageData 保证是 RGBA，能绕开
 * nativeImage.toBitmap() 通道顺序（BGRA/RGBA）的歧义。
 *
 * 变量写在 documentElement 的 inline style 上，而不是 setTheme 用的那个 <style>：
 *   - setTheme 的做法是把 `:root {…}` 整段重写，写在同一个元素里会被主题切换冲掉；
 *   - inline style 的优先级天然高于任何选择器规则，主题怎么切都不会盖掉它。
 * 开关关闭或没有封面时用 removeProperty 撤掉，而不是写一个兜底色 ——
 * 消费端全都写成 `var(--cover-color, 原有的颜色)`，变量不存在即等于「没这个功能」。
 */

// 采样画布边长，与主进程 SAMPLE_SIZE 对齐
const SAMPLE = 36

const COLOR_RE = /^#[0-9a-f]{6}$/i

/** 色相桶数量：每 30° 一桶。12 桶足以分开「红橙 / 黄 / 黄绿 / 绿 …」，再细就容易被噪声切碎。 */
const HUE_BUCKETS = 12

const rgbToHsv = (r: number, g: number, b: number) => {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min

  let hue = 0
  if (delta > 0) {
    if (max === rn) hue = ((gn - bn) / delta) % 6
    else if (max === gn) hue = (bn - rn) / delta + 2
    else hue = (rn - gn) / delta + 4
    hue *= 60
    if (hue < 0) hue += 360
  }

  return { h: hue, s: max === 0 ? 0 : delta / max, v: max }
}

const hsvToRgb = (h: number, s: number, v: number) => {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  const sector = Math.floor(h / 60) % 6
  const table = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ]
  const [r, g, b] = table[sector]
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  }
}

const toHex = (r: number, g: number, b: number) => (
  '#' + [r, g, b].map(value => Math.min(255, Math.max(0, Math.round(value))).toString(16).padStart(2, '0')).join('')
)

/**
 * 把「封面上真实存在的颜色」调成一个**适合当氛围色**的颜色。
 *
 * 只动两个维度，色相原封不动 —— 色相才是「这首歌的味道」，动了就不是跟随了。
 *   - 饱和度托底：封面常有大片灰调，不提上来染色层会毫无存在感；
 *   - 明度夹在中间段：太暗（近黑）在深色主题里等于没染，太亮（近白）又会把壁纸洗白。
 */
const tone = (r: number, g: number, b: number) => {
  const { h, s, v } = rgbToHsv(r, g, b)
  const { r: tr, g: tg, b: tb } = hsvToRgb(h, Math.min(1, Math.max(s, 0.35)), Math.min(0.8, Math.max(v, 0.32)))
  return toHex(tr, tg, tb)
}

/**
 * 从画布里挑出主色。
 *
 * 不是「求平均色」——平均色会被背景、留白、文字糊成一片灰，那是封面「最没信息量」的颜色。
 * 这里按色相分桶、用 s²·v 做权重累加：又鲜艳又明亮的像素说话最大声，
 * 最后取分量最重的那个桶的加权平均。这正是「一眼看过去这封面是什么颜色」的算法近似。
 */
const pickDominantColor = (data: Uint8ClampedArray) => {
  const buckets = Array.from({ length: HUE_BUCKETS }, () => ({ weight: 0, r: 0, g: 0, b: 0 }))

  for (let i = 0; i + 3 < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    if (data[i + 3] < 128) continue

    const { h, s, v } = rgbToHsv(r, g, b)
    // 近黑（描边、阴影）、近白（留白、文字）、近灰（背景）都不代表封面的「颜色」
    if (v < 0.12 || v > 0.97 || s < 0.1) continue

    const weight = s * s * v
    const bucket = buckets[Math.min(HUE_BUCKETS - 1, Math.floor(h / (360 / HUE_BUCKETS)))]
    bucket.weight += weight
    bucket.r += r * weight
    bucket.g += g * weight
    bucket.b += b * weight
  }

  const best = buckets.reduce((a, b) => (b.weight > a.weight ? b : a), buckets[0])
  // 一个像素都没进桶 = 这张封面本身就是黑白的（或者接近），那就别染色。
  // 灰度图没有色相可言，硬提饱和度只会凭空捏造一个颜色出来。
  if (!best.weight) return null

  return tone(best.r / best.weight, best.g / best.weight, best.b / best.weight)
}

const CANVAS = document.createElement('canvas')
CANVAS.width = SAMPLE
CANVAS.height = SAMPLE

const decode = async(source: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image()
  image.onload = () => { resolve(image) }
  image.onerror = () => { reject(new Error('cover decode failed')) }
  image.src = source
})

/**
 * 从图源算主色。
 *
 * data URL 直接本地画 —— 它本身就是解码结果，没必要为它多绕一趟 IPC（几百 KB 的字符串
 * 在 IPC 上是要老实复制一遍的）。
 * 其余图源（本地文件路径 / http 地址）交给主进程读，原因见那个模块的注释。
 */
const resolveCoverColor = async(pic: string) => {
  const source = pic.startsWith('data:') ? pic : await getCoverImage(pic)
  if (!source) return null

  const image = await decode(source)
  const context = CANVAS.getContext('2d')
  if (!context) return null

  context.clearRect(0, 0, SAMPLE, SAMPLE)
  context.drawImage(image, 0, 0, SAMPLE, SAMPLE)
  return pickDominantColor(context.getImageData(0, 0, SAMPLE, SAMPLE).data)
}

const applyCoverColor = (color: string | null) => {
  const root = document.documentElement
  if (!color || !COLOR_RE.test(color)) {
    root.style.removeProperty('--cover-color')
    return
  }
  root.style.setProperty('--cover-color', color)
}

export default () => {
  // 切歌很快时（连点下一首）会有一批取色任务同时在飞，先发的未必先回。
  // 用一个自增令牌丢弃迟到的结果，否则界面会停在某一首先前的颜色上。
  let token = 0

  watch([
    () => appSetting['common.coverColor'],
    () => musicInfo.pic,
  ], ([enabled, pic]) => {
    const current = ++token
    if (!enabled || typeof pic !== 'string' || !pic) {
      applyCoverColor(null)
      return
    }

    void resolveCoverColor(pic).then(color => {
      if (current !== token) return
      applyCoverColor(color)
    }).catch(() => {
      if (current !== token) return
      applyCoverColor(null)
    })
  }, { immediate: true })
}
