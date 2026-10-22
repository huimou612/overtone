<template>
  <!-- Teleport 到 body：墙必须脱离 #root 的层叠上下文。
       弹窗打开时 #root 会加 show-modal 类、.view-container 变成 opacity:.9，
       opacity 会创建新的层叠上下文，把墙的 z-index:400 困在里面 → 实际渲染在弹窗之下，
       弹窗的全屏透明容器会吃掉所有点击（返回按钮点不动）。挂到 body 后层级才真实生效。 -->
  <Teleport to="body">
    <div
      v-if="visible"
      ref="dom_root"
      data-view="song-wall"
      :class="$style.root"
      tabindex="-1"
      @keydown.esc.stop="handleClose"
    >
      <div :class="$style.bg"></div>

      <!-- 右上角窗口控制：默认隐藏，鼠标靠近才出现 -->
      <div
        :class="[$style.winZone, winCtrlOn && $style.winZoneOn]"
        @pointerenter="showWinCtrl"
        @pointerleave="hideWinCtrl"
      >
        <button :class="$style.winBtn" :aria-label="$t('min')" :title="$t('min')" @click="minWindow">
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" height="14px" viewBox="0 0 24 24" space="preserve">
            <use xlink:href="#icon-window-minimize" />
          </svg>
        </button>
        <button :class="$style.winBtn" :aria-label="$t('maximize')" :title="$t('maximize')" @click="maxWindowToggle">
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" height="14px" viewBox="0 0 24 24" space="preserve">
            <use xlink:href="#icon-window-maximize-2" />
          </svg>
        </button>
        <button :class="[$style.winBtn, $style.winClose]" :aria-label="$t('close')" :title="$t('close')" @click="closeWindow">
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" height="14px" viewBox="0 0 24 24" space="preserve">
            <use xlink:href="#icon-window-close" />
          </svg>
        </button>
      </div>

    <header :class="$style.topBar">
      <button :class="$style.backBtn" :aria-label="$t('back')" :title="$t('back')" @click="handleClose" @pointerdown="handleBackPointerDown">
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="18px" viewBox="0 0 24 24" space="preserve">
          <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <div :class="$style.dragArea">
        <div :class="$style.title">
          <span :class="$style.titleName">{{ listName }}</span>
          <span :class="$style.titleCount">{{ list.length }} {{ $t('wall__song_count') }}</span>
        </div>
      </div>
      <button :class="$style.latticeBtn" :aria-label="$t('wall__open')" :title="'Lattice 歌词'" @click="openLattice">
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" height="15px" viewBox="0 0 24 24" space="preserve">
          <use xlink:href="#icon-wall" />
        </svg>
        <span>Lattice</span>
      </button>
      <div v-if="playingName" :class="$style.nowPlaying">
        <span :class="$style.nowDot"></span>
        <span :class="$style.nowText">{{ playingName }}</span>
      </div>
    </header>

    <div class="scroll" :class="$style.gridWrap">
      <div :class="$style.grid">
        <div
          v-for="(item, index) in list"
          :key="item.id"
          :class="[$style.tile, {
            [$style.tileActive]: isCurrent(index),
            [$style.tileDisabled]: !assertApiSupport(item.source),
          }]"
          :style="{ animationDelay: `${(index % 24) * 26}ms` }"
          role="button"
          tabindex="0"
          :aria-label="item.name"
          @click="handleTileClick(index)"
          @dblclick="handleTileDblClick(index)"
          @keydown.enter="handlePlay(index)"
          @pointermove="handleTileMove"
          @pointerleave="handleTileLeave"
        >
          <img v-if="picUrl(item)" :class="$style.cover" :src="picUrl(item)" loading="lazy" alt="">
          <div v-else :class="$style.coverFallback" :style="fallbackStyle(item)">
            <span>{{ (item.name || '?').slice(0, 1) }}</span>
          </div>
          <div :class="$style.overlay">
            <div :class="$style.name">{{ item.name }}</div>
            <div :class="$style.singer">{{ item.singer }}</div>
          </div>
          <div v-if="isCurrent(index)" :class="$style.eq" aria-hidden="true">
            <i></i><i></i><i></i>
          </div>
        </div>
      </div>
      <div v-if="!list.length" :class="$style.empty">{{ $t('no_item') }}</div>
    </div>
      <!-- Folia 风格歌词舞台：在同一窗口内覆盖显示，不再弹独立窗口 -->
      <lattice-stage :visible="latticeVisible" @close="latticeVisible = false" />
    </div>
  </Teleport>
</template>

<script>
import { ref, computed, watch, onMounted, onBeforeUnmount } from '@common/utils/vueTools'
import { nextTick } from 'vue'
import { getListMusics } from '@renderer/store/list/action'
import { defaultList, loveList, tempList, userLists } from '@renderer/store/list/state'
import { playMusicInfo, playInfo } from '@renderer/store/player/state'
import { playList } from '@renderer/core/player'
import { assertApiSupport } from '@renderer/store/utils'
import LatticeStage from '@renderer/components/layout/LatticeLyric/index.vue'
import { minWindow, maxWindowToggle, closeWindow } from '@renderer/utils/ipc'
import { useI18n } from '@root/lang'

/**
 * 歌曲封面墙（Folia「封面墙」体验的 Vue 重实现，阶段 E）
 *
 * 从「我的列表」页右上角进入，全屏浏览当前列表：
 *  · 每格 = 封面 + 歌名/歌手，点击即播（playList(listId, index)，与表格双击行为一致）
 *  · 当前播放格放大高亮 + 播放动效条
 *  · Esc / 返回按钮退出
 * 只读消费 store 播放状态，不触碰播放核心逻辑与既有测试契约。
 */
export default {
  name: 'SongWallView',
  components: { LatticeStage },
  props: {
    visible: Boolean,
    listId: {
      type: String,
      default: null,
    },
  },
  emits: ['close'],
  setup(props, { emit }) {
    const list = ref([])
    const dom_root = ref(null)

    const load = id => {
      if (!id) return
      getListMusics(id).then(l => { list.value = [...l] }).catch(() => {})
    }
    watch(() => props.listId, id => { load(id) }, { immediate: true })
    watch(() => props.visible, v => {
      if (v) {
        load(props.listId)
        // 顶层挂载由模板上的 <Teleport to="body"> 保证（见模板注释），这里只负责聚焦
        void nextTick(() => { dom_root.value?.focus() })
      }
    })

    const handleMyListUpdate = ids => {
      if (!props.listId || !ids.includes(props.listId)) return
      load(props.listId)
    }
    // load 内 promise 已带 catch，watch immediate 回调同样安全
    onMounted(() => { window.app_event.on('myListUpdate', handleMyListUpdate) })
    onBeforeUnmount(() => {
      window.app_event.off('myListUpdate', handleMyListUpdate)
      window.removeEventListener('keydown', handleGlobalEsc)
    })

    const t = useI18n()
    const listName = computed(() => {
      if (!props.listId) return ''
      const all = [defaultList, loveList, tempList, ...userLists]
      const l = all.find(l => l.id === props.listId)
      return l ? t(l.name) : ''
    })

    const isCurrent = index => playMusicInfo.listId == props.listId && playInfo.playIndex === index
    const playingName = computed(() => {
      if (playMusicInfo.listId != props.listId) return ''
      const item = list.value[playInfo.playIndex]
      return item ? item.name : ''
    })

    const picUrl = item => item.meta?.picUrl || ''

    // 无封面 fallback：按歌名取一组稳定渐变，避免每次渲染变色
    const fallbackStyle = item => {
      const palettes = [
        ['#2b3550', '#3d4f73'], ['#3a2b50', '#55407a'], ['#1f4038', '#2d5c50'],
        ['#4a2b2b', '#734040'], ['#423a24', '#635636'], ['#243b4a', '#36576b'],
      ]
      let h = 0
      for (const c of String(item.name || '')) h = (h * 31 + c.charCodeAt(0)) % 997
      const [a, b] = palettes[h % palettes.length]
      return { background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)` }
    }

    // 右上角窗口控制：靠近才显示
    const winCtrlOn = ref(false)
    let winCtrlTimer = null
    const showWinCtrl = () => {
      if (winCtrlTimer) { window.clearTimeout(winCtrlTimer); winCtrlTimer = null }
      winCtrlOn.value = true
    }
    const hideWinCtrl = () => {
      if (winCtrlTimer) window.clearTimeout(winCtrlTimer)
      winCtrlTimer = window.setTimeout(() => { winCtrlOn.value = false }, 260)
    }

    // 鼠标在墙上的相对位置 → 卡片封面的视差位移（CSS 变量，避免每帧改样式表）
    const handleTileMove = e => {
      const el = e.currentTarget
      const r = el.getBoundingClientRect()
      el.style.setProperty('--mx', ((e.clientX - r.left) / r.width - 0.5).toFixed(3))
      el.style.setProperty('--my', ((e.clientY - r.top) / r.height - 0.5).toFixed(3))
    }
    const handleTileLeave = e => {
      e.currentTarget.style.setProperty('--mx', '0')
      e.currentTarget.style.setProperty('--my', '0')
    }

    const handlePlay = index => {
      const item = list.value[index]
      if (!item || !assertApiSupport(item.source)) return
      playList(props.listId, index)
    }

    // 单击 = 播放；双击 = 播放并进入 Lattice 歌词舞台。
    // 单击要等 ~230ms 再执行：否则双击会先触发一次播放（观感上「闪一下又切歌」）。
    let clickTimer = null
    const handleTileClick = index => {
      if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; return } // 这是双击的第二下
      clickTimer = setTimeout(() => {
        clickTimer = null
        handlePlay(index)
      }, 230)
    }
    const handleTileDblClick = index => {
      if (clickTimer) { clearTimeout(clickTimer); clickTimer = null }
      handlePlay(index)
      latticeVisible.value = true
    }
    const handleClose = () => { emit('close') }

    // 返回加固：pointerdown 先于 click 触发，避免「窗口刚恢复焦点/悬浮物遮挡导致 click 丢失」时点不动。
    const handleBackPointerDown = e => { if (e.button === 0) handleClose() }
    // 全局 ESC：不依赖墙本身持有焦点（窗口切换/点过其他区域后 root 会失焦，模板上的 @keydown 会失效）
    // 两段式退出：歌词舞台开着时，ESC 只关舞台（舞台自己也有监听），墙留着
    const handleGlobalEsc = e => { if (e.key === 'Escape' && !latticeVisible.value) handleClose() }
    watch(() => props.visible, v => {
      if (v) window.addEventListener('keydown', handleGlobalEsc)
      else window.removeEventListener('keydown', handleGlobalEsc)
    }, { immediate: true })

    // 点 Lattice：在当前窗口内切到 Folia 风格歌词舞台（不再开独立窗口）
    const latticeVisible = ref(false)
    const openLattice = () => { latticeVisible.value = true }
    // 墙关闭时一并收起舞台，避免下次打开残留
    watch(() => props.visible, v => { if (!v) latticeVisible.value = false })
    return {
      openLattice,
      latticeVisible,
      handleTileMove,
      handleTileLeave,
      winCtrlOn,
      showWinCtrl,
      hideWinCtrl,
      minWindow,
      maxWindowToggle,
      closeWindow,
      list,
      dom_root,
      listName,
      isCurrent,
      playingName,
      picUrl,
      fallbackStyle,
      handlePlay,
      handleTileClick,
      handleTileDblClick,
      handleClose,
      handleBackPointerDown,
      assertApiSupport,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

// 全屏覆盖主界面（含 toolbar/播放栏）。低于全局弹窗(10001)、与沉浸式互斥使用。
.root {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 400;
  outline: none;
  display: flex;
  flex-flow: column nowrap;
  color: #fff;
  user-select: none;
  // 显式声明非拖动区：左上角压在侧栏（-webkit-app-region: drag）上方时，
  // 真实鼠标点击否则会被当成窗口拖动吞掉（CDP 模拟点击不受影响，所以只有真机才复现）
  -webkit-app-region: no-drag;
}

// 炭黑兜底（同沉浸 bgFallBack 的色板，保持产品语言一致）
.bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(180deg, #14161c 0%, #0c0e13 100%);
}

.winZone {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 10px 12px 16px 28px;
  -webkit-app-region: no-drag;
  opacity: 0;
  transform: translateY(-6px);
  transition: opacity .22s ease, transform .22s ease;
}
.winZoneOn {
  opacity: 1;
  transform: translateY(0);
}
.winBtn {
  width: 30px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: rgba(255, 255, 255, .7);
  cursor: pointer;
  transition: background-color .16s ease, color .16s ease;
  &:hover {
    background: rgba(255, 255, 255, .14);
    color: #fff;
  }
}
.winClose:hover {
  background: #e81123;
  color: #fff;
}

.topBar {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px 26px 12px;
  // ⚠️ 整条顶栏不能是 drag：系统拖动区会吞掉鼠标事件，
  // 右上角窗口按钮的 hover / 点击就都不生效。拖动能力交给 .dragArea。
  -webkit-app-region: no-drag;
}
.dragArea {
  flex: auto;
  min-width: 0;
  // ⚠️ 必须留出右侧空间：拖动区会一路铺到窗口右边缘的话，右上角的窗口按钮
  // 就落在系统拖动区里 —— 真实鼠标事件会被系统吞掉（hover/点击都不触发）。
  max-width: calc(100% - 180px);
  align-self: stretch;
  display: flex;
  align-items: center;
  -webkit-app-region: drag;
}

.backBtn {
  flex: none;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background-color: rgba(255, 255, 255, .12);
  color: #fff;
  cursor: pointer;
  transition: background-color .2s ease;

  &:hover {
    background-color: rgba(255, 255, 255, .24);
  }
}

.title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}
.titleName {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: .5px;
  .mixin-ellipsis-1();
}
.titleCount {
  flex: none;
  font-size: 12px;
  opacity: .55;
}

.latticeBtn {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border: 1px solid rgba(255, 255, 255, .25);
  border-radius: 999px;
  background-color: rgba(255, 255, 255, .10);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  transition: background-color .2s ease;

  span { letter-spacing: .4px; }
  &:hover { background-color: rgba(255, 255, 255, .22); }
}

.nowPlaying {
  margin-left: auto;
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 40%;
  padding: 6px 14px;
  border-radius: 999px;
  background-color: rgba(255, 255, 255, .10);
}
.nowDot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: var(--color-primary);
  animation: nowPulse 1.6s ease-in-out infinite;
}
@keyframes nowPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: .35; }
}
.nowText {
  font-size: 12px;
  opacity: .85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gridWrap {
  position: relative;
  flex: auto;
  min-height: 0;
  overflow-y: auto;
  padding: 6px 26px 28px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(158px, 1fr));
  gap: 16px;
}

.tile {
  position: relative;
  aspect-ratio: 1 / 1;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  background-color: rgba(255, 255, 255, .06);
  transition: transform .3s cubic-bezier(.22, .61, .36, 1), box-shadow .3s ease, opacity .3s ease;
  animation: tileIn .34s cubic-bezier(.22, .61, .36, 1) backwards;
  // 视差用的鼠标相对位置（-0.5 ~ 0.5），由 @pointermove 写入
  --mx: 0;
  --my: 0;

  &:hover {
    // 悬停的这张「顶起来」：放大 + 抬层级 + 白色描边（Folia 海报墙的观感）
    transform: translateY(-4px) scale(1.09);
    z-index: 3;
    box-shadow: 0 20px 50px rgba(0, 0, 0, .6);
    outline: 1px solid rgba(255, 255, 255, .55);
    outline-offset: -1px;

    .cover {
      filter: brightness(1.12);
      // 封面跟着鼠标轻微位移，形成视差
      transform: translate(calc(var(--mx) * 12px), calc(var(--my) * 12px)) scale(1.08);
    }
    .coverFallback { transform: translate(calc(var(--mx) * 12px), calc(var(--my) * 12px)) scale(1.08); }
    .overlay { opacity: 1; }
  }

  &:active { transform: translateY(-1px) scale(1.02); }
}
@keyframes tileIn {
  from { opacity: 0; transform: translateY(14px) scale(.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.tileActive {
  box-shadow: 0 0 0 2px var(--color-primary), 0 10px 30px rgba(0, 0, 0, .5);
  transform: scale(1.03);

  &:hover { transform: scale(1.03) translateY(-2px); }
}

.tileDisabled {
  opacity: .38;
  cursor: not-allowed;
}

.cover {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: filter .22s ease, transform .35s cubic-bezier(.22, .61, .36, 1);
  will-change: transform;
}

.coverFallback {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;

  span {
    font-size: 44px;
    font-weight: 800;
    color: rgba(255, 255, 255, .35);
  }
}

.overlay {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 26px 10px 9px;
  background: linear-gradient(180deg, transparent 0%, rgba(5, 7, 10, .72) 78%);
  opacity: .92;
  transition: opacity .22s ease;
}
.name {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.singer {
  margin-top: 2px;
  font-size: 11px;
  opacity: .68;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

// 当前播放：底部三根跳动的均衡器条
.eq {
  position: absolute;
  right: 10px;
  bottom: 10px;
  display: flex;
  align-items: flex-end;
  gap: 2.5px;
  height: 14px;

  i {
    width: 3px;
    border-radius: 2px;
    background-color: var(--color-primary);
    animation: eqBar 0.9s ease-in-out infinite;
    &:nth-child(1) { height: 60%; animation-delay: 0s; }
    &:nth-child(2) { height: 100%; animation-delay: .18s; }
    &:nth-child(3) { height: 45%; animation-delay: .36s; }
  }
}
@keyframes eqBar {
  0%, 100% { transform: scaleY(.5); }
  50% { transform: scaleY(1); }
}

@media (prefers-reduced-motion: reduce) {
  .tile { animation: none; }
  .eq i { animation: none; }
  .nowDot { animation: none; }
}

.empty {
  padding: 80px 0;
  text-align: center;
  font-size: 15px;
  opacity: .55;
}
</style>
