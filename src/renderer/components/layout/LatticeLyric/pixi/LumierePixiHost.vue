<template>
  <canvas ref="canvas_ref" :class="$style.canvas"></canvas>
</template>

<script>
import { ref, onMounted, onBeforeUnmount } from '@common/utils/vueTools'
import { loadPixi } from './loadPixi'
import { getGraphicsCapabilities, hasAnyWebGL } from '@renderer/utils/capabilities'
import { PIXI_FILTER_VERTEX } from './pixiFilterVertex'

/**
 * LatticeLyric 的 Pixi 宿主（S1）
 *
 * 职责边界（对齐 Folia 的 pixi/pixiRuntimeHost.ts，但重写为 Vue 生命周期）：
 *  · 创建 / 销毁 Pixi Application，DPR 上限 2
 *  · 窗口尺寸变化自适应（ResizeObserver → renderer.resize）
 *  · 卸载时彻底释放 WebGL 上下文与子对象，避免切样式/切歌泄漏
 *
 * S1 阶段这里只跑一个**验证用光柱 shader**，用来证明 Pixi 链路通：
 * 片元着色器直接画一根体积光柱（核心 + 外晕 + 流动条纹 + 脉动）。
 * S2 会把 BEAM_FRAGMENT 换成 lumiere 的真实 light/lineart 程序。
 *
 * 注意：本组件不做歌词排版，只负责「在画布上跑 shader」。
 */
const BEAM_FRAGMENT = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uBeamColor;
uniform float uTime;
uniform float uIntensity;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
    vec2 uv = vTextureCoord * uInputSize.xy / max(uOutputFrame.zw, vec2(1.0));
    float t = uTime;

    // 光柱中心线随时间轻微摆动
    float cx = 0.5 + sin(t * 0.35) * 0.035;
    float dx = abs(uv.x - cx);

    // 体积光：核心极窄，外晕宽而淡
    float core = exp(-dx * dx * 900.0);
    float halo = exp(-dx * dx * 36.0) * 0.42;

    // 纵向流动的尘埃条纹
    float streak = noise(vec2(uv.x * 24.0, uv.y * 2.6 - t * 0.32));
    float beam = (core + halo) * (0.5 + 0.5 * streak);

    // 上亮下淡
    beam *= mix(1.0, 0.12, smoothstep(0.05, 0.95, uv.y));
    // 整体呼吸
    beam *= 0.85 + 0.15 * sin(t * 1.7);

    float a = clamp(beam * uIntensity, 0.0, 1.0);
    finalColor = vec4(uBeamColor.rgb * a, a);
}
`

export default {
  name: 'LumierePixiHost',
  props: {
    // 光柱颜色（后续由 builtinTheme 的封面取色喂入）
    color: { type: Array, default: () => [0.72, 0.62, 1, 1] },
  },
  emits: ['status'],
  setup(props, { emit }) {
    const canvas_ref = ref(null)
    let app = null
    let stage = null
    let uniforms = null
    let sprite = null
    let raf = 0
    let observer = null
    let disposed = false
    let startedAt = 0

    const tick = () => {
      if (disposed || !app) return
      if (uniforms) uniforms.uTime = (performance.now() - startedAt) / 1000
      // 不依赖 Application 自带 ticker：自己驱动渲染，生命周期完全可控
      try {
        app.renderer.render(app.stage)
      } catch (e) {
        console.warn('[LumierePixiHost] render failed:', e)
        return
      }
      raf = requestAnimationFrame(tick)
    }

    const resize = () => {
      if (!app || disposed) return
      const el = canvas_ref.value
      const box = el?.parentElement
      if (!box) return
      const w = Math.max(1, box.clientWidth)
      const h = Math.max(1, box.clientHeight)
      app.renderer.resize(w, h)
      if (sprite) {
        sprite.width = w
        sprite.height = h
      }
    }

    const start = async() => {
      const pixi = await loadPixi()
      if (disposed) return

      // 能力探测先行：没有 WebGL 就不要创建 Pixi，避免把「不支持」误报成「初始化失败」
      const caps = getGraphicsCapabilities()
      if (!hasAnyWebGL()) {
        if (canvas_ref.value) canvas_ref.value.dataset.pixiState = 'unsupported'
        emit('status', { state: 'unsupported', tier: caps.tier, reason: caps.error })
        return
      }

      const el = canvas_ref.value
      const box = el?.parentElement
      const w = Math.max(1, box?.clientWidth ?? 1)
      const h = Math.max(1, box?.clientHeight ?? 1)
      // DPR 上限 2：4K 屏上避免 3x 采样把 GPU 拖死
      const dpr = Math.min(2, window.devicePixelRatio || 1)

      // ⚠️ 不用 Application：Pixi 8.22 的 autoDetectRenderer 无视 preference:'webgl'
      // 与传入的 context，实测仍会挑 WebGPURenderer（本机 WebGPU 画不出来 → canvas 一片白，
      // 把 DOM 歌词盖在上面，看着像「白底舞台 + 旧效果」）。
      // 这里直接 new WebGLRenderer，路径唯一，不依赖自动探测。
      const gl = el.getContext('webgl2', {
        alpha: true,
        antialias: true,
        premultipliedAlpha: true,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      })
      const renderer = new pixi.WebGLRenderer()
      await renderer.init({
        canvas: el,
        ...(gl ? { context: gl } : {}),
        width: w,
        height: h,
        backgroundAlpha: 0,
        antialias: true,
        resolution: dpr,
        autoDensity: true,
        preserveDrawingBuffer: true,
      })
      stage = new pixi.Container()
      app = { renderer, stage }
      if (disposed) { renderer.destroy(true); app = null; return }

      const group = new pixi.UniformGroup({
        uBeamColor: { value: new Float32Array(props.color), type: 'vec4<f32>' },
        uTime: { value: 0, type: 'f32' },
        uIntensity: { value: 1, type: 'f32' },
      })
      uniforms = group.uniforms

      const glProgram = pixi.GlProgram.from({
        vertex: PIXI_FILTER_VERTEX,
        fragment: BEAM_FRAGMENT,
        name: 'lumiere-s1-beam',
      })
      const filter = new pixi.Filter({ glProgram, resources: { beamUniforms: group }, padding: 0 })

      sprite = new pixi.Sprite(pixi.Texture.WHITE)
      sprite.width = w
      sprite.height = h
      sprite.filters = [filter]
      stage.addChild(sprite)


      // 调试钩子：把 app 挂在 canvas 上，便于 CDP 检查渲染状态（不污染 window）
      if (el) el.__pixiApp = app
      startedAt = performance.now()
      raf = requestAnimationFrame(tick)
      emit('status', { state: 'ready', tier: caps.tier, reason: null })
      observer = new ResizeObserver(resize)
      if (box) observer.observe(box)
    }

    onMounted(() => {
      start().catch(e => {
        // 能力有、但 Pixi 没建起来：这是「初始化失败」，不是「不支持 WebGL」，
        // 两者对用户的含义不同（前者可能是驱动/参数问题，值得反馈）
        const reason = e?.message ?? String(e)
        console.error('[LumierePixiHost] init failed:', e)
        if (canvas_ref.value) canvas_ref.value.dataset.pixiState = 'error: ' + reason
        emit('status', { state: 'error', tier: getGraphicsCapabilities().tier, reason })
      })
    })

    onBeforeUnmount(() => {
      disposed = true
      cancelAnimationFrame(raf)
      raf = 0
      if (observer) { observer.disconnect(); observer = null }
      try {
        if (app) {
          // true = 连 renderer 一起销毁，释放 WebGL 上下文（切样式/切歌不留泄漏）
          app.renderer.destroy(true, { children: true, texture: false, textureSource: false })
          app.stage.destroy({ children: true })
        }
      } catch (e) {
        console.warn('[LumierePixiHost] destroy failed:', e)
      }
      app = null
      stage = null
      sprite = null
      uniforms = null
    })

    return { canvas_ref }
  },
}
</script>

<style lang="less" module>
.canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
}
</style>
