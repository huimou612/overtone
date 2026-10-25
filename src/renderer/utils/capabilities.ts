/**
 * 图形能力探测（P0）
 *
 * 目的：让界面知道「这台机器能不能上 GPU 渲染」，从而在不能的时候给出**明确说明**，
 * 而不是白屏或静默失败。借鉴 Folia 的 platform/runtime.ts 思路（能力探测集中一处），
 * 但只做泛音当前需要的那一项：WebGL 上下文能不能真正创建出来。
 *
 * 三条设计约束：
 *  1. **探测 ≠ 渲染成功**。这里只回答「浏览器是否给得出 WebGL 上下文」，
 *     至于 Pixi 初始化是否成功、着色器是否编译通过，由渲染宿主自己上报，
 *     两者不能混为一谈（Pixi 失败的原因可能是版本、参数、资源，不是「不支持 WebGL」）。
 *  2. **探测必须自己收尾**。每探测一次就创建一个真实上下文，Chromium 对同时存在的
 *     WebGL 上下文有上限（约 16 个），不主动释放会把后续渲染宿主挤死。
 *     因此拿到上下文后立刻用 WEBGL_lose_context 归还。
 *  3. **探测不抛错**。任何异常都收敛成 false + 原因字符串，绝不把探测失败变成页面崩溃。
 */

export type GraphicsTier = 'webgl2' | 'webgl1' | 'none'

export interface GraphicsCapabilities {
  /** WebGL 2 上下文能否创建 */
  webgl2: boolean
  /** WebGL 1 上下文能否创建（WebGL2 不可用时的退路） */
  webgl1: boolean
  /** 可用于渲染的最高等级 */
  tier: GraphicsTier
  /** 探测期间的异常信息（正常为 null），仅用于日志与提示，不参与判定 */
  error: string | null
  /** 探测时间戳（ms），便于判断是否需要重新探测 */
  probedAt: number
}

const PROBE_ATTRIBUTES: WebGLContextAttributes = {
  // 与真实渲染宿主保持接近的上下文属性，避免「探测能过、实际建不起来」
  alpha: true,
  antialias: false,
  depth: false,
  stencil: false,
  premultipliedAlpha: true,
  preserveDrawingBuffer: false,
  powerPreference: 'default',
}

/**
 * 试着创建一个指定类型的上下文，成功则立刻归还。
 * @returns 是否创建成功
 */
const canCreateContext = (kind: 'webgl2' | 'webgl'): boolean => {
  let canvas: HTMLCanvasElement | null = null
  try {
    canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const gl = canvas.getContext(kind, PROBE_ATTRIBUTES) as WebGLRenderingContext | null
    if (!gl) return false
    // 主动丢弃，避免占用上下文额度（探测完就不该继续持有）
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    // 某些环境下 getContext 会直接抛（被策略禁用 / 驱动异常），一律视为不可用
    return false
  } finally {
    // 断开引用，交给 GC；不挂到 DOM 上，也不保留全局引用
    if (canvas) {
      canvas.width = 0
      canvas.height = 0
    }
    canvas = null
  }
}

const probe = (): GraphicsCapabilities => {
  let error: string | null = null
  let webgl2 = false
  let webgl1 = false
  try {
    webgl2 = canCreateContext('webgl2')
    // WebGL2 可用时不必再探 WebGL1：绝大多数渲染宿主会优先用 2
    webgl1 = webgl2 ? true : canCreateContext('webgl')
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }
  return {
    webgl2,
    webgl1,
    tier: webgl2 ? 'webgl2' : (webgl1 ? 'webgl1' : 'none'),
    error,
    probedAt: Date.now(),
  }
}

let cached: GraphicsCapabilities | null = null

/** 取图形能力（进程内只探一次；需要重探时调 resetGraphicsCapabilities） */
export const getGraphicsCapabilities = (): GraphicsCapabilities => {
  cached ??= probe()
  return cached
}

/** 清掉缓存，下次调用重新探测（例如用户改了「渲染显卡」并重启后、或从设置里手动重试） */
export const resetGraphicsCapabilities = (): void => {
  cached = null
}

/** 是否具备任何可用的 WebGL 能力 */
export const hasAnyWebGL = (): boolean => getGraphicsCapabilities().tier !== 'none'

/**
 * 给用户看的简短说明。**不承诺特效已可用**——只解释为什么没有 GPU 渲染。
 */
export const describeGraphicsTier = (): string => {
  const caps = getGraphicsCapabilities()
  switch (caps.tier) {
    case 'webgl2':
      return 'WebGL 2 可用'
    case 'webgl1':
      return '仅 WebGL 1 可用（GPU 特效可能受限）'
    default:
      return '当前设备未提供 WebGL，GPU 歌词特效不可用，已回退到文字样式'
  }
}
