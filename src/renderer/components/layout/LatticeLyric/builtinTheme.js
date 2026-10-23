/* global Image */
/**
 * 内置主题生成器 —— 移植自 Folia src/utils/builtinTheme/
 *
 * Folia 的「AI 主题」在没有配置 API Key 时走这条离线路径：
 *  · coverPaletteAnalysis.ts：从封面像素提取色相直方图，选主色 + 强调色
 *    （偏好「饱和且中等明度」的像素——近黑近白只描述背景，不带身份）
 *  · generateBuiltinDualTheme.ts：按色调（ink/tinted/rich）定背景明度/饱和度区间，
 *    主色/次色/强调色沿明度轴推到对比度下限（保持色相，不塌成纯白/纯黑）
 *  · themeNameTable.ts：按色相段起中文名（绯色/琥珀/鎏金/潮汐/紫烟…），
 *    浅色后缀（破晓/晨光…）与深色后缀（子夜/深潭…）共享前缀 + " Built-in" 标记
 */

// ── 颜色工具 ──────────────────────────────────────────────
export const rgbToHsl = (r, g, b) => {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0))
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return { h: h * 60, s, l }
}

export const hslToRgb = (h, s, l) => {
  h = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0; let g = 0; let b = 0
  if (h < 60) { r = c; g = x } else if (h < 120) { r = x; g = c } else if (h < 180) { g = c; b = x } else if (h < 240) { g = x; b = c } else if (h < 300) { r = x; b = c } else { r = c; b = x }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  }
}
export const hslToCss = (h, s, l, a = 1) => {
  const { r, g, b } = hslToRgb(h, s, l)
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`
}

// ── 封面取色（对应 coverPaletteAnalysis 的输入端）────────────────
// Folia 在 worker 里先抽好颜色，这里直接从封面图采样。
export const extractCoverPalette = picUrl => new Promise(resolve => {
  const fallback = { baseHue: 220, baseSaturation: 0.4, baseLightness: 0.5, accentHue: 40, scheme: 'analogous', tone: 'tinted' }
  if (!picUrl) { resolve(fallback); return }
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    try {
      const N = 48
      const cv = document.createElement('canvas')
      cv.width = N; cv.height = N
      const c = cv.getContext('2d', { willReadFrequently: true })
      c.drawImage(img, 0, 0, N, N)
      const data = c.getImageData(0, 0, N, N).data
      const buckets = new Map() // hue 桶(20°) -> {count, s, l}
      for (let i = 0; i < data.length; i += 4) {
        const { h, s, l } = rgbToHsl(data[i], data[i + 1], data[i + 2])
        if (l < 0.08 || l > 0.95) continue // 跳过近黑近白
        const b = Math.floor(h / 20)
        const cur = buckets.get(b) || { count: 0, s: 0, l: 0 }
        cur.count++
        cur.s += s
        cur.l += l
        buckets.set(b, cur)
      }
      if (!buckets.size) { resolve(fallback); return }
      // Folia 的评分：s * max(0, 1 - |l-0.5|*1.2)——饱和且中等明度的像素代表封面身份
      const scored = [...buckets.entries()].map(([b, v]) => ({
        hue: b * 20 + 10,
        score: (v.s / v.count) * Math.max(0, 1 - Math.abs(v.l / v.count - 0.5) * 1.2) * Math.log2(v.count + 1),
        s: v.s / v.count,
        l: v.l / v.count,
      })).sort((a, b) => b.score - a.score)
      const base = scored[0]
      // 强调色：与主色相距 25°~160° 的次高桶
      const accent = scored.find(x => {
        const d = Math.abs(x.hue - base.hue)
        return d >= 25 && d <= 160
      }) || scored[1] || { hue: (base.hue + 150) % 360, s: base.s }
      const tone = base.s < 0.18 ? 'ink' : (base.s > 0.45 ? 'rich' : 'tinted')
      resolve({
        baseHue: base.hue,
        baseSaturation: base.s,
        baseLightness: base.l,
        accentHue: accent.hue,
        scheme: accent ? 'complementary' : 'monochrome',
        tone,
      })
    } catch (e) {
      resolve(fallback)
    }
  }
  img.onerror = () => resolve(fallback)
  img.src = picUrl
})

// ── 命名表（对应 themeNameTable.ts）────────────────────────
const NEUTRAL_PREFIXES = ['月白', '银灰', '素墨', '雾白', '灰烬']
const HUE_PREFIX_BUCKETS = [
  { maxHue: 20, prefixes: ['绯色', '朱砂', '珊瑚', '赤霞', '石榴'] },
  { maxHue: 45, prefixes: ['琥珀', '暮光', '橘光', '麦浪', '落日'] },
  { maxHue: 70, prefixes: ['鎏金', '稻香', '芒草', '秋黄', '沙丘'] },
  { maxHue: 105, prefixes: ['新柳', '青苔', '竹露', '草木', '春芜'] },
  { maxHue: 165, prefixes: ['苔痕', '松风', '薄荷', '翡翠', '深林'] },
  { maxHue: 205, prefixes: ['潮汐', '雾蓝', '海雾', '天青', '汀洲'] },
  { maxHue: 255, prefixes: ['深蓝', '靛青', '群青', '远洋', '蓝调'] },
  { maxHue: 300, prefixes: ['紫烟', '丁香', '暮霭', '紫棠', '薰衣'] },
  { maxHue: 360, prefixes: ['玫影', '桃夭', '藕荷', '蔷薇', '胭脂'] },
]
const DARK_SUFFIXES = ['子夜', '夜色', '深潭', '暗涌', '沉夜', '星屑']

/** 生成主题（对应 generateBuiltinDualTheme，简化为暗色单份 + 命名） */
export const generateBuiltinTheme = (palette, seed = Math.random()) => {
  const rand = (typeof seed === 'function') ? seed : (() => {
    let v = Math.floor(seed * 1e9) || 1
    return () => { v = (v * 9301 + 49297) % 233280; return v / 233280 }
  })()
  const between = ([min, max]) => min + rand() * (max - min)

  // 背景：色调决定明度/饱和区间（ink 偏暗低饱和，rich 偏深但饱和）
  const bgS = palette.tone === 'rich' ? between([0.35, 0.55]) : palette.tone === 'ink' ? between([0.06, 0.18]) : between([0.18, 0.38])
  const bgL = palette.tone === 'ink' ? between([0.07, 0.13]) : between([0.12, 0.22])
  // 主色（歌词已唱部分）：同色相提亮，保证在暗背景上可读
  const primaryL = Math.min(0.92, bgL + 0.62)
  const primaryS = Math.min(1, bgS * 1.6 + 0.15)
  // 强调色（辉光/高亮）：用强调色相
  const accentS = Math.min(1, Math.max(0.35, palette.baseSaturation * 1.4))

  const sat = palette.baseSaturation
  const prefixes = sat < 0.12 ? NEUTRAL_PREFIXES : (HUE_PREFIX_BUCKETS.find(b => palette.baseHue < b.maxHue)?.prefixes || HUE_PREFIX_BUCKETS[8].prefixes)
  const prefix = prefixes[Math.floor(rand() * prefixes.length)]
  const name = `${prefix}${DARK_SUFFIXES[Math.floor(rand() * DARK_SUFFIXES.length)]} Built-in`

  return {
    name,
    palette,
    bg: {
      // 两层径向渐变 + 底色，喂给 .bgTint
      tint: `radial-gradient(80% 60% at 22% 18%, ${hslToCss(palette.accentHue, bgS * 1.1, bgL + 0.1, 0.5)}, ${hslToCss(palette.accentHue, bgS, bgL + 0.1, 0)} 62%),` +
        `radial-gradient(70% 55% at 82% 78%, ${hslToCss(palette.baseHue, bgS * 0.9, bgL + 0.06, 0.45)}, ${hslToCss(palette.baseHue, bgS, bgL + 0.06, 0)} 60%),` +
        `linear-gradient(140deg, ${hslToCss(palette.baseHue, bgS * 0.8, bgL, 0.62)}, ${hslToCss(palette.baseHue, bgS * 0.6, Math.max(0.04, bgL - 0.04), 0.72)})`,
      swatch: `linear-gradient(135deg, ${hslToCss(palette.baseHue, bgS, bgL + 0.12)}, ${hslToCss(palette.accentHue, bgS, bgL + 0.06)})`,
    },
    // 歌词颜色：未唱=主色偏暗、已唱=接近白、辉光=强调色
    baseColor: hslToCss(palette.baseHue, Math.min(0.5, primaryS * 0.5), Math.min(0.8, primaryL * 0.72), 0.9),
    wordColor: hslToCss(palette.baseHue, primaryS * 0.35, 0.96),
    glowColor: hslToCss(palette.accentHue, accentS, 0.7),
  }
}

/** 一键：从封面生成主题 */
export const generateThemeFromCover = async picUrl => {
  const palette = await extractCoverPalette(picUrl)
  return generateBuiltinTheme(palette)
}
