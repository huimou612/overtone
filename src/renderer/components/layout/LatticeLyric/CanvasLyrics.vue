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

    const drawLine = (text, x, y, fontPx, opts = {}) => {
      const {
        alpha = 1, color = 'rgba(255,255,255,0.35)', weight = 700,
        progress = 0, active = false,
      } = opts
      if (!text) return
      const r = rasterize(text, fontPx, weight)
      const dx = x - r.w / 2
      const dy = y - r.h / 2
      ctx.globalAlpha = alpha

      if (!active) {
        // 非活动行：直接染色（用 source-in 上色）
        const tinted = tint(r, color)
        ctx.drawImage(tinted, dx, dy)
        ctx.globalAlpha = 1
        return
      }

      // 活动行：底 + 扫光
      const base = tint(r, color)
      ctx.drawImage(base, dx, dy)

      if (progress > 0) {
        // 裁剪到 progress 位置（软边：用 12 条窄带做渐变，模拟 shader 的 smoothstep）
        const cutW = r.w * Math.min(1, progress)
        const bands = 14
        ctx.save()
        for (let i = 0; i < bands; i++) {
          const t0 = i / bands
          const t1 = (i + 1) / bands
          const edge = 1 - Math.abs((t0 + t1) / 2 - 1) // 前沿最亮，尾部渐暗
          if (cutW < r.w * t0) break
          const bw = Math.max(1, cutW * (t1 - t0))
          ctx.globalAlpha = alpha * (0.55 + 0.45 * edge)
          const bright = tint(r, 'rgba(255,255,255,1)')
          ctx.drawImage(bright, 0, 0, bw / (r.w), r.h, dx + r.w * t0, dy, bw, r.h)
        }
        ctx.restore()
        ctx.globalAlpha = 1
      }
    }

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

    const render = () => {
      if (!ctx || !width || !height) return
      const lines = props.lines
      const ai = props.activeIndex
      ctx.clearRect(0, 0, width, height)
      if (!lines.length || ai < 0) return

      const baseSize = Math.min(64, Math.max(30, width * 0.036)) * props.scale
      const active = lines[ai]
      const cx = width / 2
      const cy = height / 2
      const style = props.styleName

      // 进度
      const next = lines[ai + 1]
      const dur = Math.max(600, (next ? next.time : active.time + 4200) - active.time)
      const p = Math.max(0, Math.min(1, (props.nowMs - active.time) / dur))

      // 粒子：换行时重建
      const lineKey = `${ai}|${active.text}`
      if (lineKey !== particleLineKey) {
        particleLineKey = lineKey
        lineStartAt = performance.now()
        if (style === 'particle' || style === 'monet') {
          const r = rasterize(active.text, baseSize, 700)
          particles = buildParticles(r, cx - r.w / 2, cy - r.h / 2, 'rgba(255,255,255,0.95)')
        } else {
          particles = []
        }
      }

      // 非活动行
      const prevAlpha = style === 'fade' ? 0.1 : 0.34
      for (let i = ai - 1; i >= Math.max(0, ai - 2); i--) {
        const dy = cy - baseSize * 1.9 * (ai - i)
        const offsetX = style === 'cloud' ? (i % 2 === 0 ? width * 0.06 : -width * 0.02) : 0
        drawLine(lines[i].text, cx + offsetX, dy, baseSize * 0.62, {
          alpha: prevAlpha * (i === ai - 1 ? 1 : 0.6),
          color: 'rgba(255,255,255,0.8)',
        })
      }
      for (let i = ai + 1; i < Math.min(lines.length, ai + 3); i++) {
        const dy = cy + baseSize * 1.9 * (i - ai)
        const offsetX = style === 'cloud' ? (i % 2 === 0 ? width * 0.06 : -width * 0.02) : 0
        drawLine(lines[i].text, cx + offsetX, dy, baseSize * 0.62, {
          alpha: prevAlpha * (i === ai + 1 ? 1 : 0.6),
          color: 'rgba(255,255,255,0.8)',
        })
      }

      // 活动行
      if (style === 'chorus') {
        // 群唱：左右各一份错位虚影
        for (const [ox, a] of [[-baseSize * 0.12, 0.18], [baseSize * 0.12, 0.18]]) {
          drawLine(active.text, cx + ox, cy, baseSize, {
            alpha: a, color: 'rgba(255,255,255,0.9)', progress: p, active: true,
          })
        }
      }

      if (style === 'monet') {
        // 莫奈：多次偏移叠色，做出油画的浑浊感
        const palette = ['rgba(255,214,170,0.55)', 'rgba(180,200,255,0.5)', 'rgba(255,180,220,0.45)']
        for (let k = 0; k < 3; k++) {
          const jx = (Math.sin(props.nowMs / 1400 + k * 2.1) * baseSize * 0.06)
          const jy = (Math.cos(props.nowMs / 1700 + k * 1.7) * baseSize * 0.05)
          drawLine(active.text, cx + jx, cy + jy, baseSize, {
            alpha: 0.5, color: palette[k], progress: p, active: true,
          })
        }
      }

      drawLine(active.text, cx, cy, baseSize, {
        alpha: 1, color: 'rgba(255,255,255,0.34)', progress: p, active: true,
      })

      // 流光：扫光后加一条亮带
      if (style === 'flow' && p > 0) {
        const r = rasterize(active.text, baseSize, 700)
        const bandX = cx - r.w / 2 + r.w * p
        const grad = ctx.createLinearGradient(bandX - 60, 0, bandX + 60, 0)
        grad.addColorStop(0, 'rgba(180,150,255,0)')
        grad.addColorStop(0.5, 'rgba(200,180,255,0.55)')
        grad.addColorStop(1, 'rgba(180,150,255,0)')
        ctx.globalAlpha = 0.8
        ctx.fillStyle = grad
        ctx.fillRect(bandX - 60, cy - baseSize, 120, baseSize * 2)
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
