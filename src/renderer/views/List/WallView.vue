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
      @keydown.esc.stop="handleEsc"
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

    <!-- 无限画布：canvas 是比视口大得多的平面，靠 translate 平移；点卡片时平移到中心并放大 -->
    <div
      ref="dom_stage"
      :class="[$style.stage, dragging && $style.stageDrag]"
      @pointerdown="onStageDown"
      @pointermove="onStageMove"
      @pointerup="onStageUp"
      @pointercancel="onStageUp"
      @pointerleave="onStageUp"
      @wheel.prevent="onWheel"
    >
      <div :class="$style.canvas" :style="canvasStyle" @click="onCanvasClick">
        <div
          v-for="(item, index) in list"
          :key="item.id"
          :class="[$style.tile, {
            [$style.tileActive]: isCurrent(index),
            [$style.tileFocus]: focusIndex === index,
            [$style.tileDim]: focusIndex !== null && focusIndex !== index,
            [$style.tileDisabled]: !assertApiSupport(item.source),
          }]"
          :style="tileStyle(index)"
          role="button"
          tabindex="0"
          :aria-label="item.name"
          @click.stop="onTileClick(index)"
          @dblclick.stop="onTileDbl(index)"
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

      <div :class="[$style.hint, focusIndex !== null && $style.hintHide]">
        拖动画布 · 滚轮平移 · 单击放大 · 双击进歌词
      </div>
      <button v-if="focusIndex !== null" :class="$style.focusClose" aria-label="关闭" @click.stop="clearFocus">
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 0 24 24" space="preserve">
          <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      </button>
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
 * 歌曲封面墙（Folia「海报墙」体验的 Vue 重实现）
 *
 * 交互对齐 Folia：整面墙是**一张可以拖着走的画布**，封面按大小不一的块密铺在上面；
 * 悬停轻微抬起 + 白描边，**单击把这张封面放大到屏幕中央**（再点空白 / ESC 收回），双击进歌词舞台。
 *
 * 实现要点：
 *  · 布局在 JS 里算（packLayout）：以 cell 为单位的占位图，按固定尺寸序列铺块。
 *    块大小不同才有 Folia 那种错落的马赛克感 —— 纯 CSS grid 铺不出不等大密铺。
 *  · 平移只改 canvas 的 translate，不触发重排，所以「拖着走」很廉价。
 *  · 放大只改被点那张的 scale + 把画布平移到它居中，邻居不动。
 */
const TILE_PATTERN = [
  [2, 2], [1, 1], [1, 1], [2, 1], [1, 1],
  [1, 2], [1, 1], [2, 1], [1, 1], [1, 1],
  [2, 2], [1, 1], [2, 1], [1, 1], [1, 2],
]

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
    const dom_stage = ref(null)

    // ── 画布状态 ───────────────────────────────────────────────
    const cell = ref(190) // 单元边长（随窗口宽度调整）
    const tiles = ref([]) // [{ x, y, w, h }] 绝对像素
    const canvasW = ref(0)
    const canvasH = ref(0)
    const pan = ref({ x: 0, y: 0 })
    const dragging = ref(false)
    const focusIndex = ref(null)
    const focusScale = ref(1)
    let prevPan = { x: 0, y: 0 }

    /** 密铺：按占位图找第一块能放下的空位，放不下就退回 1×1 */
    const packLayout = (count, cellSize) => {
      const cols = Math.max(8, Math.ceil(Math.max(window.innerWidth, 900) / cellSize) + 4)
      const rows = Math.max(6, Math.ceil(count / 3)) + 4
      const used = Array.from({ length: rows }, () => new Array(cols).fill(false))
      const out = []
      let cursorRow = 0
      let cursorCol = 0

      const fits = (r, c, w, h) => {
        if (r + h > rows || c + w > cols) return false
        for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) if (used[y][x]) return false
        return true
      }
      const occupy = (r, c, w, h) => {
        for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) used[y][x] = true
      }
      const nextFree = () => {
        for (let r = cursorRow; r < rows; r++) {
          for (let c = (r === cursorRow ? cursorCol : 0); c < cols; c++) {
            if (!used[r][c]) return [r, c]
          }
        }
        return null
      }

      for (let i = 0; i < count; i++) {
        const pos = nextFree()
        if (!pos) break
        const [r, c] = pos
        let [w, h] = TILE_PATTERN[i % TILE_PATTERN.length]
        // 边界/占位不满足就降级成 1×1，保证一定能放下
        if (!fits(r, c, w, h)) { w = 1; h = 1 }
        occupy(r, c, w, h)
        out.push({ x: c * cellSize, y: r * cellSize, w: w * cellSize, h: h * cellSize })
        cursorRow = r
        cursorCol = c + w
      }

      let maxX = 0
      let maxY = 0
      for (const t of out) {
        maxX = Math.max(maxX, t.x + t.w)
        maxY = Math.max(maxY, t.y + t.h)
      }
      return { out, maxX, maxY }
    }

    const rebuild = () => {
      const stage = dom_stage.value
      const stageW = stage ? stage.clientWidth : window.innerWidth
      const stageH = stage ? stage.clientHeight : window.innerHeight
      // 单元大小跟窗口走：窄窗口小一点，宽屏大一点
      let size = Math.round(Math.min(230, Math.max(132, stageW / 6.4)))
      let packed = packLayout(list.value.length, size)
      // 歌少的时候画布会比视口小，右下角留一大块黑 —— 逐级放大单元直到铺满，
      // 这样 20 首和 2000 首都像「一整面墙」
      for (let i = 0; i < 5; i++) {
        if (packed.maxX >= stageW * 1.12 && packed.maxY >= stageH * 1.12) break
        if (size >= 320) break
        size = Math.round(size * 1.16)
        packed = packLayout(list.value.length, size)
      }
      cell.value = size
      tiles.value = packed.out
      canvasW.value = packed.maxX
      canvasH.value = packed.maxY
      clampPan()
    }

    // 初始视角：把画布往左上挪一点，看起来像「墙还在继续」
    const resetPan = () => {
      pan.value = { x: -Math.round(canvasW.value * 0.08), y: -Math.round(canvasH.value * 0.06) }
    }

    const clampPan = () => {
      const stage = dom_stage.value
      if (!stage) return
      const vw = stage.clientWidth
      const vh = stage.clientHeight
      // 允许拖出边界，但至少留约 1/3 屏的内容可见，避免拖进空白
      const minX = -(canvasW.value - vw * 0.34)
      const maxX = vw * 0.66
      const minY = -(canvasH.value - vh * 0.34)
      const maxY = vh * 0.66
      pan.value = {
        x: Math.min(maxX, Math.max(minX, pan.value.x)),
        y: Math.min(maxY, Math.max(minY, pan.value.y)),
      }
    }

    const canvasStyle = computed(() => ({
      width: `${canvasW.value}px`,
      height: `${canvasH.value}px`,
      transform: `translate3d(${pan.value.x}px, ${pan.value.y}px, 0)`,
    }))

    const tileStyle = index => {
      const t = tiles.value[index]
      if (!t) return { display: 'none' }
      const style = {
        left: `${t.x}px`,
        top: `${t.y}px`,
        width: `${t.w}px`,
        height: `${t.h}px`,
      }
      if (focusIndex.value === index) style.transform = `scale(${focusScale.value})`
      return style
    }

    // ── 平移 ───────────────────────────────────────────────────
    let dragStart = null
    let moved = false
    const onStageDown = e => {
      if (e.button !== 0) return
      dragStart = { x: e.clientX, y: e.clientY, px: pan.value.x, py: pan.value.y }
      moved = false
      dragging.value = true
      dom_stage.value?.setPointerCapture?.(e.pointerId)
    }
    const onStageMove = e => {
      if (!dragStart) return
      const dx = e.clientX - dragStart.x
      const dy = e.clientY - dragStart.y
      if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return
      if (!moved && focusIndex.value !== null) {
        // 放大态下开始拖画布 → 先收回，再以当前位置为起点继续拖，避免跳一下
        clearFocus()
        dragStart = { x: e.clientX, y: e.clientY, px: pan.value.x, py: pan.value.y }
      }
      moved = true
      pan.value = { x: dragStart.px + (e.clientX - dragStart.x), y: dragStart.py + (e.clientY - dragStart.y) }
      clampPan()
    }
    const onStageUp = () => {
      if (!dragStart) return
      dragStart = null
      dragging.value = false
    }
    const onWheel = e => {
      if (focusIndex.value !== null) return
      const dx = e.shiftKey ? e.deltaY : e.deltaX
      const dy = e.shiftKey ? 0 : e.deltaY
      pan.value = { x: pan.value.x - dx, y: pan.value.y - dy }
      clampPan()
    }

    // ── 放大 / 收回 ────────────────────────────────────────────
    // 点画布空白（不是卡片）→ 收回放大的那张
    const onCanvasClick = e => {
      if (e.target === e.currentTarget) clearFocus()
    }
    const clearFocus = () => {
      if (focusIndex.value === null) return
      focusIndex.value = null
      pan.value = { ...prevPan }
    }
    const focusTile = index => {
      const t = tiles.value[index]
      const stage = dom_stage.value
      if (!t || !stage) return
      const vw = stage.clientWidth
      const vh = stage.clientHeight
      prevPan = { ...pan.value }
      // 放大到「宽、高都不超出视口」为止（留 8% 边距），再夹到 1.2~3.2 倍
      const fit = Math.min((vw * 0.84) / t.w, (vh * 0.84) / t.h)
      focusScale.value = Math.min(3.2, Math.max(1.2, fit))
      focusIndex.value = index
      // 平移到这张卡片的中心
      pan.value = {
        x: Math.round(vw / 2 - (t.x + t.w / 2)),
        y: Math.round(vh / 2 - (t.y + t.h / 2)),
      }
    }

    const load = id => {
      if (!id) return
      getListMusics(id).then(l => {
        list.value = [...l]
        void nextTick(() => {
          rebuild()
          resetPan()
        })
      }).catch(() => {})
    }
    watch(() => props.listId, id => { load(id) }, { immediate: true })
    watch(() => props.visible, v => {
      if (v) {
        load(props.listId)
        focusIndex.value = null
        void nextTick(() => { dom_root.value?.focus() })
      } else {
        focusIndex.value = null
      }
    })

    const handleMyListUpdate = ids => {
      if (!props.listId || !ids.includes(props.listId)) return
      load(props.listId)
    }
    // load 内 promise 已带 catch，watch immediate 回调同样安全
    const onResize = () => { rebuild() }
    onMounted(() => {
      window.app_event.on('myListUpdate', handleMyListUpdate)
      window.addEventListener('resize', onResize)
    })
    onBeforeUnmount(() => {
      window.app_event.off('myListUpdate', handleMyListUpdate)
      window.removeEventListener('resize', onResize)
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

    // 鼠标在卡片上的相对位置 → 封面视差位移（CSS 变量，避免每帧改样式表）
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

    // 单击 = 放大 + 播放；再点同一张 = 收回。双击 = 播放并进歌词舞台。
    let clickTimer = null
    const onTileClick = index => {
      if (moved) { moved = false; return } // 刚拖过画布，不当作点击
      if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; return } // 双击的第二下
      clickTimer = setTimeout(() => {
        clickTimer = null
        if (focusIndex.value === index) { clearFocus(); return }
        focusTile(index)
        handlePlay(index)
      }, 210)
    }
    const onTileDbl = index => {
      if (clickTimer) { clearTimeout(clickTimer); clickTimer = null }
      handlePlay(index)
      latticeVisible.value = true
    }
    const handleClose = () => { emit('close') }

    const handleEsc = () => {
      if (focusIndex.value !== null) { clearFocus(); return }
      handleClose()
    }
    // 返回加固：pointerdown 先于 click 触发，避免「窗口刚恢复焦点/悬浮物遮挡导致 click 丢失」时点不动。
    const handleBackPointerDown = e => { if (e.button === 0) handleClose() }
    // 全局 ESC：不依赖墙本身持有焦点（窗口切换/点过其他区域后 root 会失焦，模板上的 @keydown 会失效）
    // 三段式退出：歌词舞台 → 放大的卡片 → 墙
    const handleGlobalEsc = e => {
      if (e.key !== 'Escape' || latticeVisible.value) return
      if (focusIndex.value !== null) { clearFocus(); return }
      handleClose()
    }
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
      dom_stage,
      listName,
      isCurrent,
      playingName,
      picUrl,
      fallbackStyle,
      handlePlay,
      onTileClick,
      onTileDbl,
      handleClose,
      handleBackPointerDown,
      handleEsc,
      assertApiSupport,
      // 画布
      canvasStyle,
      tileStyle,
      dragging,
      focusIndex,
      clearFocus,
      onCanvasClick,
      onStageDown,
      onStageMove,
      onStageUp,
      onWheel,
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
  z-index: 10;
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

// ── 无限画布 ─────────────────────────────────────────────────
.stage {
  position: relative;
  flex: auto;
  min-height: 0;
  overflow: hidden;
  cursor: grab;
  touch-action: none;
}
.stageDrag {
  cursor: grabbing;

  .canvas { transition: none; }
}

.canvas {
  position: absolute;
  top: 0;
  left: 0;
  // 平移由 style 里的 translate3d 驱动；拖动时过渡置 none（见 .stageDrag）
  transition: transform .46s cubic-bezier(.22, .61, .36, 1);
  will-change: transform;
}

.tile {
  position: absolute;
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
  background-color: rgba(255, 255, 255, .06);
  transition: transform .42s cubic-bezier(.22, .61, .36, 1), opacity .3s ease, box-shadow .3s ease;
  // 视差用的鼠标相对位置（-0.5 ~ 0.5），由 @pointermove 写入
  --mx: 0;
  --my: 0;

  // Folia 的观感：卡片之间几乎没有缝，靠悬停描边区分
  &:hover {
    z-index: 5;
    box-shadow: 0 18px 46px rgba(0, 0, 0, .6);
    outline: 1px solid rgba(255, 255, 255, .7);
    outline-offset: -1px;

    .cover {
      filter: brightness(1.1);
      transform: translate(calc(var(--mx) * 10px), calc(var(--my) * 10px)) scale(1.06);
    }
    .coverFallback { transform: translate(calc(var(--mx) * 10px), calc(var(--my) * 10px)) scale(1.06); }
    .overlay { opacity: 1; }
  }
}

// 被点开的那张：放大 + 白描边 + 抬到最上层，邻居压暗
.tileFocus {
  z-index: 20;
  border-radius: 8px;
  box-shadow: 0 40px 90px rgba(0, 0, 0, .72), 0 0 0 1px rgba(255, 255, 255, .85);
  outline: none;

  &:hover { outline: none; }

  .overlay {
    opacity: 1;
    padding: 42px 16px 14px;
    background: linear-gradient(180deg, transparent 0%, rgba(5, 7, 10, .82) 82%);
  }
  .name { font-size: 15px; }
  .singer { font-size: 12px; margin-top: 3px; opacity: .75; }
  .eq { right: 16px; bottom: 16px; height: 18px; }
}
.tileDim {
  opacity: .34;
  &:hover { outline: none; box-shadow: none; }
}

.tileActive {
  box-shadow: 0 0 0 2px var(--color-primary), 0 10px 30px rgba(0, 0, 0, .5);

  &:hover { box-shadow: 0 0 0 2px var(--color-primary), 0 18px 46px rgba(0, 0, 0, .6); }
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
    font-size: 40px;
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
  pointer-events: none;
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

// 底部操作提示 / 放大态的关闭按钮
.hint {
  position: absolute;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(0, 0, 0, .45);
  border: 1px solid rgba(255, 255, 255, .12);
  font-size: 11px;
  color: rgba(255, 255, 255, .62);
  pointer-events: none;
  transition: opacity .25s ease;
  z-index: 12;
}
.hintHide { opacity: 0; }

.focusClose {
  position: absolute;
  top: 18px;
  right: 22px;
  z-index: 22;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, .22);
  border-radius: 50%;
  background: rgba(0, 0, 0, .45);
  color: #fff;
  cursor: pointer;
  transition: background-color .18s ease;

  &:hover { background: rgba(255, 255, 255, .2); }
}

@media (prefers-reduced-motion: reduce) {
  .canvas { transition: none; }
  .eq i { animation: none; }
  .nowDot { animation: none; }
}

.empty {
  position: absolute;
  left: 0;
  right: 0;
  top: 40%;
  text-align: center;
  font-size: 15px;
  opacity: .55;
}
</style>
