<template>
  <canvas ref="canvas_ref" :class="$style.canvas" aria-hidden="true"></canvas>
</template>

<script>
import { ref, watch, onMounted, onBeforeUnmount } from '@common/utils/vueTools'

/**
 * Canvas 歌词渲染器 —— 按 Folia 的 latticeLyric 源码移植
 *
 * 参考：
 *  · latticeLyricLayout.ts  以 **token（词/字）** 为单位排版，按宽度换行，piece = {text,x,y,row,width}
 *  · latticeLyricRaster.ts  fillText 到离屏 canvas 当字形纹理
 *  · latticeLyricScene.ts   每个 piece 一个 mesh；**near/far 两层高斯模糊副本做辉光**；
 *                           底色 = 主题主色，字色 = 词色，按 progress 混合
 *  · latticeLyricFilters.ts 扫光 shader：uFront 前沿 + uSoftness 软边，前沿之前全亮、之后渐隐
 *
 * 泛音没有 PixiJS，用 Canvas2D 等价实现：
 *  · 辉光 = ctx.filter = blur(Npx) 画同一张字形纹理（对应 Pixi BlurFilter）
 *  · 扫光 = 把字形按「前沿」切成若干竖条，前沿附近做 alpha 渐变（对应 shader 的 smoothstep）
 */
const BLUR_NEAR = 0.28 // 近层模糊半径 / 字号（Folia: fontPx * 0.28）
const BLUR_FAR = 0.65 // 远层模糊半径 / 字号（Folia: fontPx * 0.65）

export default {
  name: 'CanvasLyrics',
  props: {
    lines: { type: Array, default: () => [] },
    nowMs: { type: Number, default: 0 },
    activeIndex: { type: Number, default: -1 },
    styleName: { type: String, default: 'standard' },
    scale: { type: Number, default: 1 },
    paused: { type: Boolean, default: false },
    // 主题色覆盖（AI 主题/内置生成器输出）；为空则用默认白
    themeBase: { type: String, default: '' },
    themeWord: { type: String, default: '' },
    themeGlow: { type: String, default: '' },
  },
  setup(props) {
    const canvas_ref = ref(null)
    let raf = 0
    let ctx = null
    let dpr = 1
    let width = 0
    let height = 0
    let failed = false

    const rasterCache = new Map()
    const tintCache = new Map()
    const layoutCache = new Map()

    const FONT_FAMILY = '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif'

    const rasterize = (text, fontPx) => {
      const key = `${text}|${Math.round(fontPx)}`
      const hit = rasterCache.get(key)
      if (hit) return hit
      const font = `600 ${fontPx}px ${FONT_FAMILY}`
      const probe = document.createElement('canvas').getContext('2d')
      probe.font = font
      const m = probe.measureText(text)
      const pad = Math.ceil(fontPx * 0.6)
      const w = Math.max(1, Math.ceil(m.width + pad * 2))
      const h = Math.max(1, Math.ceil(fontPx * 1.5 + pad * 2))
      const cv = document.createElement('canvas')
      cv.width = w
      cv.height = h
      const c = cv.getContext('2d')
      c.font = font
      c.fillStyle = '#fff'
      c.textBaseline = 'middle'
      c.fillText(text, pad, h / 2)
      const entry = { canvas: cv, w, h, pad, textW: m.width, fontPx }
      if (rasterCache.size > 600) rasterCache.clear()
      rasterCache.set(key, entry)
      return entry
    }

    const tint = (r, color) => {
      const key = `${r.canvas.width}x${r.canvas.height}|${color}`
      const hit = tintCache.get(key)
      if (hit) return hit
      const cv = document.createElement('canvas')
      cv.width = r.canvas.width
      cv.height = r.canvas.height
      const c = cv.getContext('2d')
      c.drawImage(r.canvas, 0, 0)
      c.globalCompositeOperation = 'source-in'
      c.fillStyle = color
      c.fillRect(0, 0, cv.width, cv.height)
      if (tintCache.size > 400) tintCache.clear()
      tintCache.set(key, cv)
      return cv
    }

    // ── 排版：token 为单位，按宽度换行（对应 wrapLatticeTokens）──────────
    const splitTokens = text => {
      const s = String(text || '')
      const out = []
      let buf = ''
      for (const ch of Array.from(s)) {
        if (/[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/.test(ch)) {
          if (buf) { out.push(buf); buf = '' }
          out.push(ch)
        } else if (ch === ' ') {
          if (buf) { out.push(buf); buf = '' }
          out.push(' ')
        } else {
          buf += ch
        }
      }
      if (buf) out.push(buf)
      return out.filter(t => t.length)
    }

    const layoutLine = (text, fontPx, maxWidth) => {
      const key = `${text}|${Math.round(fontPx)}|${Math.round(maxWidth)}`
      const hit = layoutCache.get(key)
      if (hit) return hit
      const tokens = splitTokens(text)
      const lineHeight = fontPx * 1.18
      const pieces = []
      let x = 0
      let row = 0
      for (const tk of tokens) {
        const r = rasterize(tk, fontPx)
        const w = r.textW
        if (x > 0 && x + w > maxWidth) { row++; x = 0 }
        pieces.push({ text: tk, raster: r, x, y: row * lineHeight, width: w, row })
        x += w
      }
      const rows = (pieces.at(-1)?.row ?? 0) + 1
      const blockW = pieces.reduce((m, p) => Math.max(m, p.x + p.width), 0)
      const entry = { pieces, rows, lineHeight, blockW, textHeight: rows * lineHeight }
      if (layoutCache.size > 120) layoutCache.clear()
      layoutCache.set(key, entry)
      return entry
    }

    /** 画一个 piece：辉光 → 底色 → 已唱部分（软边前沿） */
    const drawPiece = (piece, ox, oy, fontPx, opts) => {
      const { baseColor, wordColor, progress = 0, alpha = 1, glow = 0 } = opts
      const r = piece.raster
      const dx = ox + piece.x - r.pad
      const dy = oy + piece.y - r.pad
      const base = tint(r, baseColor)

      // ① 辉光：两层模糊副本（对应 scene.ts 的 near/far BlurFilter）
      if (glow > 0.001) {
        const g = tint(r, wordColor)
        ctx.save()
        ctx.globalAlpha = Math.min(1, alpha * glow)
        ctx.filter = `blur(${Math.max(1, fontPx * BLUR_NEAR)}px)`
        ctx.drawImage(g, dx, dy)
        ctx.globalAlpha = Math.min(1, alpha * glow * 0.7)
        ctx.filter = `blur(${Math.max(2, fontPx * BLUR_FAR)}px)`
        ctx.drawImage(g, dx, dy)
        ctx.restore()
      }

      // ② 底色（未唱部分）
      ctx.globalAlpha = alpha
      ctx.drawImage(base, dx, dy)

      if (progress <= 0) { ctx.globalAlpha = 1; return }

      // ③ 已唱部分：按前沿切片，前沿附近 alpha 渐变（对应 shader 的 uSoftness）
      const word = tint(r, wordColor)
      const front = r.pad + r.textW * Math.min(1, progress)
      const soft = Math.max(2, fontPx * 0.18)
      const slices = 16
      const from = Math.max(0, front - soft)
      ctx.save()
      if (from > 0) {
        ctx.globalAlpha = alpha
        ctx.drawImage(word, 0, 0, from, r.h, dx, dy, from, r.h)
      }
      const span = Math.max(1, front - from)
      for (let i = 0; i < slices; i++) {
        const t0 = i / slices
        const t1 = (i + 1) / slices
        const x0 = from + span * t0
        const bw = Math.max(1, span * (t1 - t0))
        ctx.globalAlpha = alpha * (1 - t0) * (1 - t0)
        ctx.drawImage(word, x0, 0, bw, r.h, dx + x0, dy, bw, r.h)
      }
      ctx.restore()
      ctx.globalAlpha = 1
    }

    const drawLine = (line, centerY, fontPx, opts) => {
      const { alpha = 1, active = false, progress = 0, glow = 0, style = 'standard' } = opts
      const maxW = width * 0.72
      const layout = layoutLine(line.text || '', fontPx, maxW)
      const ox = (width - layout.blockW) / 2
      const oy = centerY - layout.textHeight / 2

      const chorus = style === 'chorus'
      const baseColor = props.themeBase || (active ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.34)')
      const wordColor = props.themeWord || (chorus ? 'rgba(214,196,255,1)' : 'rgba(255,255,255,1)')

      if (active && chorus) {
        for (const off of [-fontPx * 0.22, fontPx * 0.22]) {
          for (const p of layout.pieces) {
            drawPiece(p, ox + off, oy, fontPx, {
              baseColor, wordColor, progress, alpha: alpha * 0.25, glow: glow * 0.6,
            })
          }
        }
      }

      for (const p of layout.pieces) {
        drawPiece(p, ox, oy, fontPx, {
          baseColor,
          wordColor,
          progress: active ? progress : 0,
          alpha,
          glow: active ? glow : 0,
        })
      }
      return layout
    }

    const render = () => {
      if (!ctx || !width || !height) return
      const lines = props.lines
      const ai = props.activeIndex
      ctx.clearRect(0, 0, width, height)
      if (!lines.length || ai < 0) return

      const fontPx = Math.min(58, Math.max(24, width * 0.042)) * props.scale
      const lineGap = fontPx * 2.0
      const cy = height / 2

      const active = lines[ai]
      const next = lines[ai + 1]
      const dur = Math.max(500, (next ? next.time : active.time + 4000) - active.time)
      const p = Math.max(0, Math.min(1, (props.nowMs - active.time) / dur))

      // 辉光强度：进入爬升、结束前回落（对应 resolveMonetGlow）
      const tail = Math.min(1, Math.max(0, (props.nowMs - active.time) / 320))
      const glow = Math.sin(p * Math.PI) * 0.9 + 0.25 * tail

      for (let i = ai - 1; i >= Math.max(0, ai - 2); i--) {
        drawLine(lines[i], cy - lineGap * (ai - i), fontPx * 0.72, {
          alpha: props.styleName === 'fade' ? 0.1 : 0.3 * (i === ai - 1 ? 1 : 0.55),
          style: props.styleName,
        })
      }
      for (let i = ai + 1; i < Math.min(lines.length, ai + 3); i++) {
        drawLine(lines[i], cy + lineGap * (i - ai), fontPx * 0.72, {
          alpha: props.styleName === 'fade' ? 0.1 : 0.3 * (i === ai + 1 ? 1 : 0.55),
          style: props.styleName,
        })
      }

      // 莫奈：正文之下叠一层柔光（对应其「浑浊」观感）
      if (props.styleName === 'monet') {
        ctx.save()
        ctx.filter = `blur(${Math.round(fontPx * 0.5)}px)`
        drawLine(active, cy, fontPx, { alpha: 0.5, active: true, progress: p, glow: 0 })
        ctx.restore()
      }

      drawLine(active, cy, fontPx, {
        alpha: 1, active: true, progress: p, glow, style: props.styleName,
      })
    }

    const loop = () => {
      if (failed) return
      try {
        render()
      } catch (e) {
        failed = true
        console.error('[CanvasLyrics] render failed:', e)
        return
      }
      raf = requestAnimationFrame(loop)
    }

    const resize = () => {
      const el = canvas_ref.value
      if (!el?.parentElement) return
      dpr = window.devicePixelRatio || 1
      width = el.parentElement.clientWidth
      height = el.parentElement.clientHeight
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
      layoutCache.clear()
    })
    watch(() => props.lines, () => { layoutCache.clear() })

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
