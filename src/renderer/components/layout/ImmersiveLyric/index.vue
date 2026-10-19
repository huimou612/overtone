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
import { computed, ref, watch, onMounted, onBeforeUnmount } from '@common/utils/vueTools'
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

    // 侧栏：L1 起就是组件内状态（没有对应的全局设置项），默认关闭
    const panelOpen = ref(false)
    const togglePanel = () => { panelOpen.value = !panelOpen.value }
    const closeStage = () => { setShowImmersiveLyric(false) }

    // 退出舞台时顺手收起侧栏：下次进来一定从关闭态开始，不残留上次的展开状态
    watch(visible, isVisible => {
      if (!isVisible) panelOpen.value = false
    })

    // ── 快捷键：走应用既有的 key_event 通路（L2 修复）──────────────────
    // 不再裸监听 window keydown。L1 那样写在三处会出错：
    //   ① 不认 event.lx_handled → 全屏下按 Esc 会「退全屏 + 退沉浸」同时发生；
    //   ② 不认自定义热键 → 用户把 p 绑成热键时，动作与面板开关双触发；
    //   ③ 不认输入控件 → 在搜索框里打字母 p 也会开面板。
    // key_event 的 emit 时机已经把这三件事过滤好了（event/keyEvent.ts:26-44）：
    //   命中已配置热键 → 只 emit 对应 action，**不发** key_p_down；
    //   lx_handled 已置位（如全屏 Esc 已被消费）→ 直接 return，不发通用键事件；
    //   焦点在 INPUT/SELECT/TEXTAREA（isEditing）→ 同样 return。
    // 所以这里收到的永远是「轮不到别人处理」的那一份；处理完再把 lx_handled
    // 置位，保证同一次按键不会继续被下游消费。
    const handlePanelKey = payload => {
      if (!visible.value) return
      if (payload?.event?.repeat) return
      togglePanel()
      if (payload?.event) payload.event.lx_handled = true
    }

    const handleEscapeKey = payload => {
      if (!visible.value) return
      if (payload?.event?.repeat) return
      // 一次按键只做一件事：面板开着就只关面板，否则才退舞台
      if (panelOpen.value) {
        panelOpen.value = false
      } else {
        closeStage()
      }
      if (payload?.event) payload.event.lx_handled = true
    }

    onMounted(() => {
      window.key_event.on('key_p_down', handlePanelKey)
      window.key_event.on('key_escape_down', handleEscapeKey)
    })

    onBeforeUnmount(() => {
      window.key_event.off('key_p_down', handlePanelKey)
      window.key_event.off('key_escape_down', handleEscapeKey)
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
