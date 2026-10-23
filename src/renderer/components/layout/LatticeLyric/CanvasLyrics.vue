<template>
  <canvas ref="canvas_ref" :class="$style.canvas" aria-hidden="true"></canvas>
</template>

<script>
import { ref, watch, onMounted, onBeforeUnmount } from '@common/utils/vueTools'

/**
 * Canvas 歌词渲染器（对齐 Folia 的 latticeLyricRaster / Scene 管线）
 *
 * Folia 的做法（读源码确认）：
 *  · 每行歌词用 fillText 画到离屏 canvas，当作**字形纹理**
 *  · 用逐 sprite 的 shader 按播放进度做「扫光」：前沿软边 + 渐变，前白后淡
 *  · 行与行之间靠纹理缩放 + alpha 过渡
 * 没有粒子——「粒子」是我这次额外加的一档效果。
 *
 * 这里用 Canvas2D 等价实现（泛音没有 PixiJS）：
 *  · 字形纹理：离屏 canvas 缓存（同文本同字号只画一次）
 *  · 扫光：按进度裁剪 + 软边渐变（多条竖条模拟 shader 的 smoothstep）
 *  · 粒子：对字形纹理做 alpha 采样，粒子从随机位置聚合成字
 */
export default {
  name: 'CanvasLyrics',
  props: {
    lines: { type: Array, default: () => [] },
    nowMs: { type: Number, default: 0 },
    activeIndex: { type: Number, default: -1 },
    styleName: { type: String, default: 'standard' },
    scale: { type: Number, default: 1 },
    paused: { type: Boolean, default: false },
  },
  setup(props) {
    const canvas_ref = ref(null)
    let raf = 0
    let ctx = null
    let dpr = 1
    let width = 0
    let height = 0

    // 字形纹理缓存：key = text|fontPx
    const rasterCache = new Map()
    const RASTER_LIMIT = 120

    // 粒子状态（当前行）
    let particles = []
    let particleLineKey = ''
    let lineStartAt = 0

    const rasterize = (text, fontPx, weight = 700) => {
      const key = `${text}|${Math.round(fontPx)}|${weight}`
      const hit = rasterCache.get(key)
      if (hit) return hit
      const font = `${weight} ${fontPx}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`
      const probe = document.createElement('canvas').getContext('2d')
      probe.font = font
      const m = probe.measureText(text)
      const pad = Math.ceil(fontPx * 0.25)
      const w = Math.max(1, Math.ceil(m.width + pad * 2))
      const h = Math.max(1, Math.ceil(fontPx * 1.35 + pad * 2))
      const cv = document.createElement('canvas')
      cv.width = w
      cv.height = h
      const c = cv.getContext('2d')
      c.font = font
      c.fillStyle = '#fff'
      c.textBaseline = 'middle'
      c.fillText(text, pad, h / 2)
      const entry = { canvas: cv, w, h, pad }
      if (rasterCache.size > RASTER_LIMIT) rasterCache.clear()
      rasterCache.set(key, entry)
      return entry
    }

    /** 从字形纹理采样粒子（alpha > 128 的像素，隔 step 取一个） */
    const buildParticles = (raster, originX, originY, color) => {
      const { canvas, w, h } = raster
      const c = canvas.getContext('2d')
      const data = c.getImageData(0, 0, w, h).data
      const step = Math.max(3, Math.round(w / 160))
      const out = []
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          const a = data[(y * w + x) * 4 + 3]
          if (a < 140) continue
          out.push({
            tx: originX + x,
            ty: originY + y,
            x: originX + x + (Math.random() - 0.5) * 260,
            y: originY + y + (Math.random() - 0.5) * 200,
            size: step * (0.5 + Math.random() * 0.5),
            delay: Math.random() * 0.45,
            color,
          })
        }
      }
      return out
    }

    const easeOut = t => 1 - Math.pow(1 - t, 3)

    // 染色缓存：把白色字形染成目标色（同纹理同色复用）
    const tintCache = new Map()
    const tint = (raster, color) => {
      const key = `${raster.canvas.width}x${raster.canvas.height}|${color}`
      const hit = tintCache.get(key)
      if (hit) return hit
      const cv = document.createElement('canvas')
      cv.width = raster.canvas.width
      cv.height = raster.canvas.height
      const c = cv.getContext('2d')
      c.drawImage(raster.canvas, 0, 0)
      c.globalCompositeOperation = 'source-in'
      c.fillStyle = color
      c.fillRect(0, 0, cv.width, cv.height)
      if (tintCache.size > 240) tintCache.clear()
      tintCache.set(key, cv)
      return cv
    }

    // ── 逐字排版（Folia「Lattice」的核心：每个字独立定位）──────────────
    const charCache = new Map()
    const splitChars = text => Array.from(String(text || ''))

    /** 把一行拆成字形，算出每个字的位置（基准 x + 相对 y 偏移） */
    const layoutChars = (text, fontPx, style) => {
      const key = `${text}|${Math.round(fontPx)}|${style}`
      const hit = charCache.get(key)
      if (hit) return hit
      const chars = splitChars(text)
      const n = chars.length
      if (!n) return { chars: [], total: 0 }
      // 云阶：整行从左到右逐字抬高，形成阶梯
      const step = style === 'cloud' ? fontPx * 0.22 : 0
      let acc = 0
      const items = chars.map((ch, i) => {
        const r = rasterize(ch, fontPx, 700)
        const dx = acc
        acc += r.w - r.pad * 2 + (style === 'cloud' ? fontPx * 0.06 : 0)
        // 以行中心为轴：i 越大越高
        const dy = -step * (i - (n - 1) / 2)
        return { ch, raster: r, dx, dy, i }
      })
      const entry = { chars: items, total: acc }
      if (charCache.size > 300) charCache.clear()
      charCache.set(key, entry)
      return entry
    }

    /** 画一行字（逐字）：progress 0~1 控制逐字填充 */
    const drawChars = (text, cx, cy, fontPx, opts = {}) => {
      const {
        alpha = 1, color = 'rgba(255,255,255,0.34)', bright = 'rgba(255,255,255,1)',
        progress = 0, style = 'standard', active = true, jitter = 0,
      } = opts
      const { chars, total } = layoutChars(text, fontPx, style)
      if (!chars.length) return
      const startX = cx - total / 2
      const n = chars.length
      ctx.globalAlpha = alpha

      for (const it of chars) {
        const x = startX + it.dx
        const y = cy + it.dy
        const r = it.raster
        // 逐字进度：整行进度映射到每个字
        const cp = active ? Math.max(0, Math.min(1, progress * n - it.i)) : 0
        const wobble = jitter ? Math.sin((props.nowMs / 900) + it.i * 1.7) * jitter : 0

        if (!active) {
          ctx.drawImage(tint(r, color), x, y - r.h / 2 + wobble)
          continue
        }
        // 底色
        ctx.drawImage(tint(r, color), x, y - r.h / 2 + wobble)
        if (cp <= 0) continue
        // 已唱过的部分：整字高亮
        if (cp >= 1) {
          ctx.drawImage(tint(r, bright), x, y - r.h / 2 + wobble)
          continue
        }
        // 正在唱的字：从左往右刷
        const cut = r.w * cp
        const bands = 8
        for (let b = 0; b < bands; b++) {
          const t0 = b / bands
          if (cut <= r.w * t0) break
          const t1 = Math.min(1, (b + 1) / bands)
          const bw = Math.max(1, r.w * (t1 - t0))
          ctx.globalAlpha = alpha * (0.55 + 0.45 * (1 - Math.abs((t0 + t1) / 2 - 1)))
          ctx.drawImage(tint(r, bright), 0, 0, bw, r.h, x + r.w * t0, y - r.h / 2 + wobble, bw, r.h)
        }
        ctx.globalAlpha = alpha
      }
      ctx.globalAlpha = 1
    }

    const render = () => {
      if (!ctx || !width || !height) return
      const lines = props.lines
      const ai = props.activeIndex
      ctx.clearRect(0, 0, width, height)
      if (!lines.length || ai < 0) return

      const baseSize = Math.min(64, Math.max(28, width * 0.034)) * props.scale
      const active = lines[ai]
      const cx = width / 2
      const cy = height / 2
      const style = props.styleName

      const next = lines[ai + 1]
      const dur = Math.max(600, (next ? next.time : active.time + 4200) - active.time)
      const p = Math.max(0, Math.min(1, (props.nowMs - active.time) / dur))

      // 粒子：换行时重建
      const lineKey = `${ai}|${active.text}`
      if (lineKey !== particleLineKey) {
        particleLineKey = lineKey
        lineStartAt = performance.now()
        if (style === 'particle') {
          const r = rasterize(active.text, baseSize, 700)
          particles = buildParticles(r, cx - r.w / 2, cy - r.h / 2, 'rgba(255,255,255,0.95)')
        } else {
          particles = []
        }
      }

      // 前后行：整行绘制（便宜）
      const sideAlpha = style === 'fade' ? 0.12 : 0.32
      for (let i = ai - 1; i >= Math.max(0, ai - 2); i--) {
        const dy = cy - baseSize * 1.85 * (ai - i)
        const ox = style === 'cloud' ? -width * 0.04 * (ai - i) : 0
        drawChars(lines[i].text, cx + ox, dy, baseSize * 0.58, {
          alpha: sideAlpha * (i === ai - 1 ? 1 : 0.55), color: 'rgba(255,255,255,0.85)', active: false,
        })
      }
      for (let i = ai + 1; i < Math.min(lines.length, ai + 3); i++) {
        const dy = cy + baseSize * 1.85 * (i - ai)
        const ox = style === 'cloud' ? width * 0.04 * (i - ai) : 0
        drawChars(lines[i].text, cx + ox, dy, baseSize * 0.58, {
          alpha: sideAlpha * (i === ai + 1 ? 1 : 0.55), color: 'rgba(255,255,255,0.85)', active: false,
        })
      }

      // 群唱：左右各一份错位虚影
      if (style === 'chorus') {
        for (const [ox, a] of [[-baseSize * 0.14, 0.16], [baseSize * 0.14, 0.16]]) {
          drawChars(active.text, cx + ox, cy, baseSize, {
            alpha: a, color: 'rgba(255,255,255,0.9)', progress: p, style, active: true,
          })
        }
      }

      // 莫奈：三次偏移叠色 + 抖动
      if (style === 'monet') {
        const palette = ['rgba(255,214,170,0.45)', 'rgba(180,200,255,0.4)', 'rgba(255,180,220,0.38)']
        for (let k = 0; k < 3; k++) {
          drawChars(active.text, cx, cy, baseSize, {
            alpha: 0.5, color: palette[k], progress: p, style, active: true, jitter: baseSize * 0.03,
          })
        }
      }

      // 主体
      drawChars(active.text, cx, cy, baseSize, {
        alpha: 1,
        color: 'rgba(255,255,255,0.30)',
        bright: 'rgba(255,255,255,1)',
        progress: p,
        style,
        active: true,
      })

      // 流光：进度处亮带
      if (style === 'flow' && p > 0) {
        const bandX = cx - width * 0.3 + width * 0.6 * p
        const grad = ctx.createLinearGradient(bandX - 70, 0, bandX + 70, 0)
        grad.addColorStop(0, 'rgba(180,150,255,0)')
        grad.addColorStop(0.5, 'rgba(200,180,255,0.5)')
        grad.addColorStop(1, 'rgba(180,150,255,0)')
        ctx.globalAlpha = 0.75
        ctx.fillStyle = grad
        ctx.fillRect(bandX - 70, cy - baseSize, 140, baseSize * 2)
        ctx.globalAlpha = 1
      }

      // 粒子聚合
      if (particles.length) {
        const elapsed = performance.now() - lineStartAt
        const dur2 = 900
        for (const pt of particles) {
          const t = Math.min(1, Math.max(0, (elapsed / dur2 - pt.delay) / (1 - pt.delay)))
          const e = easeOut(t)
          const x = pt.x + (pt.tx - pt.x) * e
          const y = pt.y + (pt.ty - pt.y) * e
          ctx.globalAlpha = 0.25 + 0.75 * e
          ctx.fillStyle = pt.color
          ctx.fillRect(x, y, pt.size, pt.size)
        }
        ctx.globalAlpha = 1
      }
    }

    let failed = false
    const loop = () => {
      if (failed) return
      try {
        render()
      } catch (e) {
        // 渲染出错就停下，别把整个歌词界面带崩（DOM 歌词仍可回退）
        failed = true
        console.error('[CanvasLyrics] render failed:', e)
        return
      }
      raf = requestAnimationFrame(loop)
    }

    const resize = () => {
      const el = canvas_ref.value
      if (!el) return
      const parent = el.parentElement
      if (!parent) return
      dpr = window.devicePixelRatio || 1
      width = parent.clientWidth
      height = parent.clientHeight
      el.width = Math.round(width * dpr)
      el.height = Math.round(height * dpr)
      el.style.width = `${width}px`
      el.style.height = `${height}px`
      ctx = el.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      render()
    }

    onMounted(() => {
      resize()
      window.addEventListener('resize', resize)
      raf = requestAnimationFrame(loop)
    })
    onBeforeUnmount(() => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      rasterCache.clear()
      tintCache.clear()
      particles = []
    })
    watch(() => props.lines, () => { particleLineKey = '' }, { deep: false })

    return { canvas_ref }
  },
}
</script>

<style lang="less" module>
.canvas {
  position: absolute;
  inset: 0;
  display: block;
  pointer-events: none;
}
</style>
