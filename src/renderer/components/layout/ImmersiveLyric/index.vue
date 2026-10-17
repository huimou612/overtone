<template>
  <immersive-stage
    :visible="visible"
    :has-lyric="timeline.lines.length > 0"
    :panel-open="panelOpen"
    @close="closeStage"
    @toggle-panel="togglePanel"
  >
    <!-- 视觉模式在这里换。L1 只有 classic，注册表已按 id 兜底 -->
    <component
      :is="mode.component"
      :lines="timeline.lines"
      :active-index="activeIndex"
      :now-ms="nowMs"
      :key-prefix="keyPrefix"
    />
  </immersive-stage>
</template>

<script>
import { computed, ref, onMounted, onBeforeUnmount } from '@common/utils/vueTools'
import { musicInfo, isShowImmersiveLyric } from '@renderer/store/player/state'
import { setShowImmersiveLyric } from '@renderer/store/player/action'
import { buildLyricTimeline, findActiveLineIndex } from '@renderer/core/immersiveLyric/timeline'
import { DEFAULT_MODE_ID, getMode } from '@renderer/core/immersiveLyric/registry'
import ImmersiveStage from './ImmersiveStage.vue'
import useImmersiveClock from './stage/useImmersiveClock'

/**
 * 沉浸式歌词 —— 编排层（L1 拆分后）
 *
 * 只做四件事：
 *   1. 数据准备：时间轴（timeline）+ 当前行索引（activeIndex）；
 *   2. 时间源：useImmersiveClock（全应用唯一的歌词时钟，仍然只读 audio.currentTime）；
 *   3. 视觉模式：从注册表取组件，把时间与数据作为 props 传下去；
 *   4. 交互编排：Esc / 面板状态（先关面板再退舞台）。
 *
 * 舞台长什么样在 ImmersiveStage.vue；歌词行长什么样在 modes/classic.vue
 * 与 stage/LyricLineView.vue。这一层不碰样式，也不碰 audio。
 */
export default {
  name: 'ImmersiveLyric',
  components: { ImmersiveStage },
  setup() {
    const visible = computed(() => isShowImmersiveLyric.value)

    // 时钟：与拆分前完全一致（同一个 audio 元素、同一套事件订阅），实现见 stage/useImmersiveClock.js
    const { nowMs } = useImmersiveClock(visible)

    const timeline = computed(() => buildLyricTimeline({
      lrc: musicInfo.lrc,
      lxlrc: musicInfo.lxlrc,
      tlrc: musicInfo.tlrc,
    }))

    const activeIndex = computed(() => findActiveLineIndex(timeline.value.lines, nowMs.value))

    // 带上歌曲 id：切歌时强制重建行节点，避免沿用上一首的过渡状态
    const keyPrefix = computed(() => musicInfo.id ?? 'none')

    // L1 只有经典模式。getMode 对未知 id 会回落 classic，L2 起接设置项时不用改这里。
    const mode = computed(() => getMode(DEFAULT_MODE_ID))

    // 侧栏：L1 不持久化（没有对应设置项），默认关闭 —— 关闭时不渲染任何节点
    const panelOpen = ref(false)
    const togglePanel = () => { panelOpen.value = !panelOpen.value }
    const closeStage = () => { setShowImmersiveLyric(false) }

    const handleKeyDown = event => {
      if (!visible.value) return
      if (event.key == 'Escape') {
        // 面板开着时，Esc 只关面板：同一次按键不能既关面板又退出舞台
        if (panelOpen.value) { panelOpen.value = false; return }
        closeStage()
        return
      }
      // L1 没有可见的面板入口按钮（加了会改变经典模式的顶栏视觉），
      // 先用键盘开关；L2 接上顶栏按钮后这条快捷键保留即可。
      if ((event.key == 'p' || event.key == 'P') && !event.ctrlKey && !event.metaKey && !event.altKey) {
        togglePanel()
      }
    }

    onMounted(() => {
      window.addEventListener('keydown', handleKeyDown)
    })
    onBeforeUnmount(() => {
      window.removeEventListener('keydown', handleKeyDown)
    })

    return {
      visible,
      nowMs,
      timeline,
      activeIndex,
      keyPrefix,
      mode,
      panelOpen,
      togglePanel,
      closeStage,
    }
  },
}
</script>
