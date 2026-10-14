<template>
  <!-- data-layer 是给验证脚本用的稳定锚点：CSS module 会把类名编译成哈希，
       `[class*="wall"]` 这种写法既撞得上别处的 .wallpaper，又随构建变化。
       和 PlayDetail 的 data-view 同款做法。 -->
  <div
    v-if="active"
    data-layer="wall"
    :class="[$style.wall, { [$style.behind]: behind }]"
    :style="wallStyle"
    aria-hidden="true"
  >
    <!-- 视频壁纸：CSS 的 background-image 播不了视频，所以这里必须是真实元素。
         muted 是自动播放的硬前提（Chromium 只对静音媒体免手势放行），
         playsinline 防止某些环境把画面弹到独立窗口。 -->
    <video
      v-if="state.kind === 'video'"
      ref="dom_media"
      :class="$style.media"
      :src="state.source"
      autoplay
      loop
      muted
      playsinline
      disablepictureinpicture
      preload="auto"
    />
    <img v-else-if="state.kind === 'image'" :class="$style.media" :src="state.source" alt="">
    <!-- 跟随封面取色：主色染色层。压在壁纸之上、遮罩之下，
         没设壁纸时它就是这一层唯一的内容（此时等于给界面铺了一层歌的颜色）。 -->
    <div v-if="state.tint" data-layer="cover-tint" :class="$style.tint" />
    <div data-layer="wall-mask" :class="$style.mask" />
  </div>
</template>

<script>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from '@common/utils/vueTools'

/**
 * 壁纸图层 —— 阶段 7.2
 *
 * 为什么要有这个组件：`--background-image` 在样式里只有两处用到
 * （App.vue 的 #root、PlayDetail 的 .bg），今天都只是 `background: var(--background-image)`。
 * CSS 的 background 做不了两件事：
 *   1. 播视频（`background-image` 只认图片，动图只有 GIF 能走这条路）
 *   2. 单独模糊背景而不牵连内容（filter 会作用到整棵子树）
 * 所以这里用真实元素重画一遍壁纸，模糊/遮罩都加在这一层上，内容层完全不受影响。
 *
 * 兼容性：只有当「是视频」「模糊/遮罩大于 0」「开启了跟随封面取色」三者之一成立时才挂载（active）。
 * 内置主题这几项全是默认值，因此它们一帧都不会多画。
 *
 * 阶段 7.4 起这一层还多了一件事：跟随封面取色的染色层与遮罩取色（见 .tint / .mask）。
 * 它同时挂在 App.vue 与 PlayDetail 两处，所以这两处的氛围是同一份实现。
 */

// 收视频扩展名。图片那条路不动，GIF 继续用 CSS 的 background-image 播。
const VIDEO_EXT = /\.(mp4|m4v|webm|ogv|mov|mkv)$/i

// `--cover-color` 是「跟随封面取色」开启时由 useCoverColor 写下的十六进制主色。
// 这里只认这个格式：写进来的必须是完整颜色，不能是 var() 之类的间接引用，
// 否则下面的 v-if 判断和 color-mix 都会失去意义。
const COVER_COLOR_RE = /^#[0-9a-f]{6}$/i

const clamp = (value, min, max) => value < min ? min : (value > max ? max : value)

/**
 * 把 `url(...)` 剥成裸地址。
 * 主题变量里存的一律是 CSS 的 url() 形状（main / renderer 两边都按这个形状产出），
 * 但 <img src> / <video src> 要的是裸地址，所以统一在这里剥一次。
 */
const unwrapUrl = (value) => {
  const matched = /^url\(\s*(['"]?)([\s\S]*?)\1\s*\)$/i.exec(value)
  return matched ? matched[2].trim() : value
}

const toNumber = (value) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export default {
  name: 'AppBackground',
  props: {
    /**
     * 图层要落在哪一层。
     *
     * 两个使用场景的堆叠位置不一样，必须分开：
     * - App.vue 的 #root：`#root` 不是堆叠上下文（position: relative 但 z-index 是 auto），
     *   图层用 z-index: 0，和 #container 同层、靠 DOM 顺序（在前面）落到它下面。
     * - PlayDetail 的 .bg：`.bg` 自己就是堆叠上下文（绝对定位 + z-index: -1），
     *   而 `.bg::before/::after` 两块蒙版必须压住壁纸。图层要用 z-index: -1 才会
     *   落在「元素自身背景」那一层，正好是原 CSS 背景图待的位置。
     */
    behind: {
      type: Boolean,
      default: false,
    },
  },
  setup(props) {
    const state = reactive({
      kind: 'none', // none | image | video
      source: '',
      blur: 0, // px
      mask: 0, // 0-90，遮罩不透明度百分比
      position: 'center',
      tint: false, // 是否存在封面主色（即「跟随封面取色」是否生效）
    })
    const dom_media = ref(null)

    const read = () => {
      const style = window.getComputedStyle(document.documentElement)
      const raw = (name) => (style.getPropertyValue(name) || '').trim()

      const video = unwrapUrl(raw('--background-video'))
      const image = unwrapUrl(raw('--background-image'))

      state.blur = clamp(toNumber(raw('--background-blur')), 0, 40)
      state.mask = clamp(toNumber(raw('--background-mask')), 0, 90)
      state.position = raw('--background-image-position') || 'center'

      // `--cover-color` 只在「跟随封面取色」开启时存在（关闭时是 removeProperty，
      // 而不是写一个兜底色），所以它的有无本身就是功能开关，组件不必再去读配置。
      state.tint = COVER_COLOR_RE.test(raw('--cover-color'))

      if (video && video !== 'none') {
        state.kind = 'video'
        state.source = video
        return
      }
      if (image && image !== 'none') {
        // 兜一道：万一视频被写进了 --background-image（旧主题、手工改过的主题），
        // 也按视频处理，不然会得到一个 <img src="x.mp4"> 的坏图。
        state.kind = VIDEO_EXT.test(image) ? 'video' : 'image'
        state.source = image
        return
      }
      state.kind = 'none'
      state.source = ''
    }

    const active = computed(() => {
      // 没有壁纸时，只有封面染色层可画：这层让「没设壁纸」的用户也能用上取色
      if (state.kind === 'none') return state.tint
      if (state.kind === 'video') return true
      return state.blur > 0 || state.mask > 0 || state.tint
    })

    const wallStyle = computed(() => ({
      '--wall-blur': `${state.blur}px`,
      // 模糊会让元素自己的边缘向外采样到透明，露出一圈底色。
      // 按模糊半径同比放大，把这圈推到可视区之外，再由父级 overflow: hidden 裁掉。
      // 40px 封顶时约 1.27 倍，够用且不会把画面拉得离谱。
      '--wall-scale': String(1 + state.blur / 150),
      '--wall-mask-alpha': String(state.mask / 100),
      '--wall-position': state.position,
    }))

    // 窗口不可见时让视频停住。壁纸是常驻的，不暂停会平白占一路解码。
    const handleVisibility = () => {
      const media = dom_media.value
      if (!media || state.kind !== 'video') return
      if (document.hidden) {
        media.pause()
      } else {
        void media.play().catch(() => {})
      }
    }

    let observer = null
    let stopWatchActive = null

    onMounted(() => {
      read()

      // setTheme 的实现是往同一个 <style> 里整段重写 `:root {…}`（见 src/renderer/index.html）。
      // 观察这个元素，等价于观察「主题变量被重写」这件事，且天然覆盖所有路径：
      // 启动时的兜底主题、切换主题、主题编辑器里的预览（预览根本不经过 store）。
      if (window.dom_style) {
        observer = new MutationObserver(read)
        observer.observe(window.dom_style, { childList: true, characterData: true, subtree: true })
        // `--cover-color` 走的是另一条路：useCoverColor 把它写在 documentElement 的
        // inline style 上（不能写进 dom_style，那个元素每次切主题都会被整段重写冲掉）。
        // 所以这里要额外盯一眼 <html> 的 style 属性变化，否则切歌时这一层不会重读。
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
      }

      // 主题变了以后 video 可能是刚插进来的，等 DOM 更新再补一次静音 + 播放
      stopWatchActive = watch(active, (value) => {
        if (!value) return
        void Promise.resolve().then(() => {
          const media = dom_media.value
          if (!media || state.kind !== 'video') return
          media.muted = true
          void media.play().catch(() => {})
        })
      })

      document.addEventListener('visibilitychange', handleVisibility)
    })

    onBeforeUnmount(() => {
      observer?.disconnect()
      observer = null
      stopWatchActive?.()
      document.removeEventListener('visibilitychange', handleVisibility)
    })

    return {
      state,
      active,
      wallStyle,
      dom_media,
    }
  },
}
</script>

<style lang="less" module>
.wall {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  // contain: paint —— 把模糊/放大的溢出关在这一层里，
  // 同时给它一个独立的绘制边界，省得每帧重绘整棵树
  contain: paint;
}

// PlayDetail 专用（见 props.behind 的说明）
.behind {
  z-index: -1;
}

.media {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: var(--wall-position, center);
  filter: blur(var(--wall-blur, 0px));
  transform: scale(var(--wall-scale, 1));
  transform-origin: center;
}

// 跟随封面取色的染色层。
//
// 用 color-mix 而不是让 JS 灌一个 rgba 进来：颜色的不透明度在这里是**渐变**的
// （越往上越浓、越往下越淡），把它做成一个变量反而会把「渐变」这件事压缩成一个数。
// 万一 --cover-color 缺失（v-if 已挡掉，这里是兜底），第一个参数会退化成 transparent，
// 整层变成不透明渐变到透明 —— 也就是「什么都没画」，不会出现黑块。
.tint {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: linear-gradient(
    180deg,
    color-mix(in srgb, var(--cover-color, transparent) 26%, transparent) 0%,
    color-mix(in srgb, var(--cover-color, transparent) 12%, transparent) 46%,
    color-mix(in srgb, var(--cover-color, transparent) 4%, transparent) 100%
  );
}

.mask {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  // 遮罩色默认取 --color-000 —— 调色板里「背景那一端」：浅色主题是白、深色主题是深灰。
  // 这样一档遮罩在两个方向上都是「把壁纸压下去、把文字抬上来」，不用跟着主题切换换颜色。
  // 开启跟随封面取色时改进 --cover-color：同一个不透明度，压下去的从「主题底色」变成
  //「这首歌的颜色」，这就是「跟随封面取色」最直接的那一步。
  background-color: var(--cover-color, var(--color-000, #000));
  opacity: var(--wall-mask-alpha, 0);
}
</style>
