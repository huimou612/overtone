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

    <!-- 无限画布：只渲染视口附近的卡片（虚拟化），拖动/滚轮只改视口原点 -->
    <div
      ref="dom_stage"
      :class="[$style.stage, dragging && $style.stageDrag]"
      @pointerdown="onStageDown"
      @pointermove="onStageMove"
      @pointerup="onStageUp"
      @pointercancel="onStageUp"
      @pointerleave="onStageUp"
      @wheel.prevent="onWheel"
      @click="onStageClick"
    >
      <div
        v-for="tile in visibleTiles"
        :key="tile.key"
        :class="[$style.tile, {
          [$style.tileActive]: isCurrent(tile.index),
          [$style.tileFocus]: focusIndex === tile.index,
          [$style.tileDim]: focusIndex !== null && focusIndex !== tile.index,
          [$style.tileDisabled]: !assertApiSupport(tile.source),
        }]"
        :style="tile.style"
        role="button"
        tabindex="0"
        :aria-label="tile.name"
        :data-tile-index="tile.index"
        @keydown.enter="handlePlay(tile.index)"
        @pointermove="handleTileMove"
        @pointerleave="handleTileLeave"
      >
        <img v-if="tile.pic" :class="$style.cover" :src="tile.pic" loading="lazy" alt="">
        <div v-else :class="$style.coverFallback" :style="tile.fallback">
          <span>{{ (tile.name || '?').slice(0, 1) }}</span>
        </div>
        <div :class="$style.overlay">
          <div :class="$style.name">{{ tile.name }}</div>
          <div :class="$style.singer">{{ tile.singer }}</div>
        </div>
        <div v-if="isCurrent(tile.index)" :class="$style.eq" aria-hidden="true">
          <i></i><i></i><i></i>
        </div>
      </div>

      <div v-if="!list.length" :class="$style.empty">{{ $t('no_item') }}</div>

      <div :class="[$style.hint, focusIndex !== null && $style.hintHide]">
        拖动画布 · 滚轮平移 · 单击放大 · 双击进歌词
      </div>
      <button v-if="focusIndex !== null" :class="$style.focusClose" aria-label="收回" title="收回" @click.stop="clearFocus">
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
 * 歌曲封面墙（对齐 Folia 的 Lattice 海报墙）
 *
 * 布局照搬 Folia `components/wall` 的引擎思路：
 *  · 一个 block = 12 列 × 8 行，内含 12 个 slot（尺寸各异、正好铺满整块）
 *  · block 在平面上无限重复；每个 block 的模板/镜像由它自己的坐标哈希决定，所以看不出周期
 *  · **只渲染视口附近的卡片**（虚拟化，上限 400）—— 这是 1140 首也不卡、更不会出现黑块的关键
 *  · 选中一张时它长到 6×6 格（Folia 的 EXPANSION_SPAN）并居中，邻居压暗
 *
 * 参考实现：https://github.com/chthollyphile/folia-major
 *   src/components/wall/layout.ts、blockTemplates.ts
 */

// ── 块模板：12×8 的 12 个 slot，正好铺满、无缝隙（数据取自 Folia blockTemplates.ts）──
const BLOCK_COLS = 12
const BLOCK_ROWS = 8
const SLOTS_PER_BLOCK = 12
const EXPANSION_SPAN = 6 // 选中时放大到 6×6 格
const MAX_RENDERED = 400

const TEMPLATES = [
  [
    { x: 0, y: 0, cols: 3, rows: 2 },
    { x: 3, y: 0, cols: 6, rows: 4 },
    { x: 9, y: 0, cols: 3, rows: 2 },
    { x: 0, y: 2, cols: 3, rows: 2 },
    { x: 9, y: 2, cols: 3, rows: 4 },
    { x: 0, y: 4, cols: 4, rows: 4 },
    { x: 4, y: 4, cols: 2, rows: 2 },
    { x: 6, y: 4, cols: 3, rows: 2 },
    { x: 4, y: 6, cols: 2, rows: 2 },
    { x: 6, y: 6, cols: 2, rows: 2 },
    { x: 8, y: 6, cols: 2, rows: 2 },
    { x: 10, y: 6, cols: 2, rows: 2 },
  ],
  [
    { x: 0, y: 0, cols: 2, rows: 3 },
    { x: 2, y: 0, cols: 2, rows: 3 },
    { x: 4, y: 0, cols: 2, rows: 3 },
    { x: 6, y: 0, cols: 6, rows: 4 },
    { x: 0, y: 3, cols: 6, rows: 2 },
    { x: 6, y: 4, cols: 2, rows: 4 },
    { x: 8, y: 4, cols: 2, rows: 4 },
    { x: 10, y: 4, cols: 2, rows: 2 },
    { x: 0, y: 5, cols: 2, rows: 3 },
    { x: 2, y: 5, cols: 2, rows: 3 },
    { x: 4, y: 5, cols: 2, rows: 3 },
    { x: 10, y: 6, cols: 2, rows: 2 },
  ],
  [
    { x: 0, y: 0, cols: 6, rows: 4 },
    { x: 6, y: 0, cols: 6, rows: 3 },
    { x: 6, y: 3, cols: 4, rows: 3 },
    { x: 10, y: 3, cols: 2, rows: 2 },
    { x: 0, y: 4, cols: 4, rows: 2 },
    { x: 4, y: 4, cols: 2, rows: 2 },
    { x: 10, y: 5, cols: 2, rows: 3 },
    { x: 0, y: 6, cols: 2, rows: 2 },
    { x: 2, y: 6, cols: 2, rows: 2 },
    { x: 4, y: 6, cols: 2, rows: 2 },
    { x: 6, y: 6, cols: 2, rows: 2 },
    { x: 8, y: 6, cols: 2, rows: 2 },
  ],
  [
    { x: 0, y: 0, cols: 2, rows: 2 },
    { x: 2, y: 0, cols: 2, rows: 2 },
    { x: 4, y: 0, cols: 4, rows: 3 },
    { x: 8, y: 0, cols: 2, rows: 4 },
    { x: 10, y: 0, cols: 2, rows: 4 },
    { x: 0, y: 2, cols: 2, rows: 3 },
    { x: 2, y: 2, cols: 2, rows: 2 },
    { x: 4, y: 3, cols: 4, rows: 3 },
    { x: 2, y: 4, cols: 2, rows: 2 },
    { x: 8, y: 4, cols: 4, rows: 4 },
    { x: 0, y: 5, cols: 2, rows: 3 },
    { x: 2, y: 6, cols: 6, rows: 2 },
  ],
]

const flipX = slots => slots.map(s => ({ ...s, x: BLOCK_COLS - s.x - s.cols }))
const flipY = slots => slots.map(s => ({ ...s, y: BLOCK_ROWS - s.y - s.rows }))
const REFLECTIONS = [s => s, flipX, flipY, s => flipX(flipY(s))]
// 4 套模板 × 4 种镜像 = 16 种朝向，相邻块不会撞脸
const ORIENTED = TEMPLATES.flatMap(t => REFLECTIONS.map(f => f(t)))

// 整数哈希（同 Folia mixBlockCoords）：镜像由坐标哈希决定，避免整片墙看起来像网格
const mixCoords = (col, row) => {
  let v = Math.imul(col, 0x9e3779b1) ^ Math.imul(row, 0x85ebca6b)
  v = Math.imul(v ^ (v >>> 15), 0x2c1b3c6d)
  v ^= v >>> 12
  return v >>> 0
}
const templateAt = (col, row) => {
  const t = (((col + row * 2) % TEMPLATES.length) + TEMPLATES.length) % TEMPLATES.length
  return ORIENTED[t * REFLECTIONS.length + (mixCoords(col, row) % REFLECTIONS.length)]
}

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
    const pitch = ref(80) // 单元格 + 间隙
    const gap = 3
    const pan = ref({ x: 0, y: 0 })
    const viewW = ref(0)
    const viewH = ref(0)
    const dragging = ref(false)
    const focusIndex = ref(null)
    let prevPan = { x: 0, y: 0 }

    const blockW = computed(() => BLOCK_COLS * pitch.value)
    const blockH = computed(() => BLOCK_ROWS * pitch.value)
    const blocksPerRow = computed(() => Math.max(1, Math.round(viewW.value / blockW.value) || 1))
    const blockRows = computed(() => Math.max(1, Math.ceil(Math.ceil(list.value.length / SLOTS_PER_BLOCK) / blocksPerRow.value)))
    const contentW = computed(() => blocksPerRow.value * blockW.value)
    const contentH = computed(() => blockRows.value * blockH.value)

    /** 视口附近的卡片（虚拟化核心）：只算看得见的块，最多 MAX_RENDERED 张 */
    const visibleTiles = computed(() => {
      const items = list.value
      if (!items.length || !viewW.value) return []
      const p = pitch.value
      const bw = blockW.value
      const bh = blockH.value
      const vw = viewW.value
      const vh = viewH.value
      const ox = -pan.value.x
      const oy = -pan.value.y

      const colFrom = Math.floor(ox / bw) - 1
      const colTo = Math.floor((ox + vw) / bw) + 1
      const rowFrom = Math.floor(oy / bh) - 1
      const rowTo = Math.floor((oy + vh) / bh) + 1
      const perRow = blocksPerRow.value
      const out = []
      const focus = focusIndex.value

      for (let row = Math.max(0, rowFrom); row <= rowTo; row++) {
        for (let col = Math.max(0, colFrom); col <= colTo; col++) {
          if (col >= perRow) continue
          const blockIndex = row * perRow + col
          if (blockIndex * SLOTS_PER_BLOCK >= items.length) continue
          const tpl = templateAt(col, row)
          const baseX = col * bw
          const baseY = row * bh
          for (let slot = 0; slot < SLOTS_PER_BLOCK; slot++) {
            const index = blockIndex * SLOTS_PER_BLOCK + slot
            if (index >= items.length) break
            const s = tpl[slot]
            const item = items[index]
            // 画布坐标 → 舞台坐标：减去视口原点，拖动才会真的移动
            let x = baseX + s.x * p - pan.value.x
            let y = baseY + s.y * p - pan.value.y
            let w = s.cols * p - gap
            let h = s.rows * p - gap

            if (focus === index) {
              // 选中：长到 6×6 格，以原卡片中心为锚点
              const fw = EXPANSION_SPAN * p - gap
              const fh = EXPANSION_SPAN * p - gap
              x -= (fw - w) / 2
              y -= (fh - h) / 2
              w = fw
              h = fh
            }

            out.push({
              key: `${index}`,
              index,
              name: item.name,
              singer: item.singer,
              source: item.source,
              pic: item.meta?.picUrl || '',
              fallback: fallbackStyle(item),
              style: {
                left: `${x}px`,
                top: `${y}px`,
                width: `${w}px`,
                height: `${h}px`,
                borderRadius: s.cols >= 4 || s.rows >= 4 ? '6px' : '3px',
                zIndex: focus === index ? 30 : undefined,
              },
            })
            if (out.length >= MAX_RENDERED) return out
          }
        }
      }
      return out
    })

    const clampPan = () => {
      const vw = viewW.value
      const vh = viewH.value
      const maxX = 40
      const minX = Math.min(maxX, vw - contentW.value - 40)
      const maxY = 40
      const minY = Math.min(maxY, vh - contentH.value - 40)
      pan.value = {
        x: Math.min(maxX, Math.max(minX, pan.value.x)),
        y: Math.min(maxY, Math.max(minY, pan.value.y)),
      }
    }

    const measure = () => {
      const stage = dom_stage.value
      if (!stage) return
      viewW.value = stage.clientWidth
      viewH.value = stage.clientHeight
      // 单元格大小跟窗口走：一屏大约看到 1.2 个块宽
      pitch.value = Math.round(Math.min(96, Math.max(46, viewW.value / 12.6)))
      clampPan()
    }

    // ── 平移 ───────────────────────────────────────────────────
    let dragStart = null
    let moved = false
    const onStageDown = e => {
      if (e.button !== 0) return
      dragStart = { x: e.clientX, y: e.clientY, px: pan.value.x, py: pan.value.y }
      moved = false
      dragging.value = true
      // ⚠️ 这里**不能** setPointerCapture：一旦捕获，pointerup 会被重定向到 stage，
      // 浏览器就不再派发卡片上的 click（实测单击完全失效）。
      // 捕获推迟到「确认是拖动」之后再要，见 onStageMove。
    }
    const onStageMove = e => {
      if (!dragStart) return
      const dx = e.clientX - dragStart.x
      const dy = e.clientY - dragStart.y
      if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return
      if (!moved && focusIndex.value !== null) {
        // 放大态下开始拖 → 先收回，再以当前位置继续拖，避免跳
        clearFocus()
        dragStart = { x: e.clientX, y: e.clientY, px: pan.value.x, py: pan.value.y }
      }
      if (!moved) {
        moved = true
        // 确认在拖动后才捕获指针：保证拖出窗口/拖快时事件不丢，同时不影响点击
        dom_stage.value?.setPointerCapture?.(e.pointerId)
      }
      pan.value = { x: dragStart.px + (e.clientX - dragStart.x), y: dragStart.py + (e.clientY - dragStart.y) }
      clampPan()
    }
    const onStageUp = () => {
      if (!dragStart) return
      dragStart = null
      dragging.value = false
    }
    const onWheel = e => {
      const dx = e.shiftKey ? e.deltaY : e.deltaX
      const dy = e.shiftKey ? 0 : e.deltaY
      if (focusIndex.value !== null) clearFocus()
      pan.value = { x: pan.value.x - dx, y: pan.value.y - dy }
      clampPan()
    }

    // ── 放大 / 收回 ────────────────────────────────────────────
    const clearFocus = () => {
      if (focusIndex.value === null) return
      focusIndex.value = null
      pan.value = { ...prevPan }
    }
    const focusTile = index => {
      if (!dom_stage.value || !list.value[index]) return
      const p = pitch.value
      const blockIndex = Math.floor(index / SLOTS_PER_BLOCK)
      const slot = index % SLOTS_PER_BLOCK
      const col = blockIndex % blocksPerRow.value
      const row = Math.floor(blockIndex / blocksPerRow.value)
      const s = templateAt(col, row)[slot]
      if (!s) return
      // 卡片中心（画布坐标）——放大是围绕这个中心长到 6×6 的
      const cx = col * blockW.value + s.x * p + (s.cols * p - gap) / 2
      const cy = row * blockH.value + s.y * p + (s.rows * p - gap) / 2
      prevPan = { ...pan.value }
      focusIndex.value = index
      pan.value = {
        x: Math.round(cx - viewW.value / 2),
        y: Math.round(cy - viewH.value / 2),
      }
    }

    const load = id => {
      if (!id) return
      getListMusics(id).then(l => {
        list.value = [...l]
        void nextTick(() => {
          measure()
          pan.value = { x: 0, y: 0 }
          focusIndex.value = null
        })
      }).catch(() => {})
    }
    watch(() => props.listId, id => { load(id) }, { immediate: true })
    watch(() => props.visible, v => {
      if (v) {
        load(props.listId)
        focusIndex.value = null
        void nextTick(() => { dom_root.value?.focus(); measure() })
      } else {
        focusIndex.value = null
      }
    })

    const handleMyListUpdate = ids => {
      if (!props.listId || !ids.includes(props.listId)) return
      load(props.listId)
    }
    const onResize = () => { measure() }
    onMounted(() => {
      window.app_event.on('myListUpdate', handleMyListUpdate)
      window.addEventListener('resize', onResize)
      void nextTick(measure)
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

    // 单击 = 放大 + 播放；再点同一张 = 收回；双击 = 进歌词舞台。
    //
    // ⚠️ 判定放在**舞台层**而不是卡片上：第一次点击会让卡片长到 6×6 并平移居中，
    // 动画期间卡片已经不在鼠标下面了，第二次点击会落到空白处 —— 卡片级 dblclick 永远不触发。
    // 这里只看「同一位置 320ms 内点了两次」，第二次落在哪都算。
    let lastTap = { index: -1, time: 0, x: 0, y: 0 }
    const onStageClick = e => {
      if (moved) { moved = false; return } // 刚拖过画布，不算点击
      const tileEl = e.target.closest ? e.target.closest('[data-tile-index]') : null
      const index = tileEl ? Number(tileEl.dataset.tileIndex) : -1
      const now = Date.now()
      const near = Math.abs(e.clientX - lastTap.x) < 12 && Math.abs(e.clientY - lastTap.y) < 12
      if (now - lastTap.time < 320 && near) {
        const idx = index >= 0 ? index : lastTap.index
        lastTap = { index: -1, time: 0, x: 0, y: 0 }
        if (idx >= 0) {
          handlePlay(idx)
          latticeVisible.value = true
        }
        return
      }
      lastTap = { index, time: now, x: e.clientX, y: e.clientY }
      if (index < 0) { clearFocus(); return } // 点空白 → 收回
      if (focusIndex.value === index) clearFocus()
      else {
        focusTile(index)
        handlePlay(index)
      }
    }
    const handleClose = () => { emit('close') }

    const handleEsc = () => {
      if (focusIndex.value !== null) { clearFocus(); return }
      handleClose()
    }
    // 返回加固：pointerdown 先于 click 触发，避免「窗口刚恢复焦点/悬浮物遮挡导致 click 丢失」时点不动。
    const handleBackPointerDown = e => { if (e.button === 0) handleClose() }
    // 全局 ESC：不依赖墙本身持有焦点
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
      fallbackStyle,
      handlePlay,
      onStageClick,
      handleClose,
      handleBackPointerDown,
      handleEsc,
      assertApiSupport,
      // 画布
      visibleTiles,
      dragging,
      focusIndex,
      clearFocus,
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

// ── 画布 ─────────────────────────────────────────────────────
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
}

.tile {
  position: absolute;
  overflow: hidden;
  cursor: pointer;
  background-color: rgba(255, 255, 255, .06);
  // 位置/尺寸变化（选中放大）用过渡；拖动时只改 transform 的容器，不触发重排
  transition: left .34s cubic-bezier(.22, .61, .36, 1), top .34s cubic-bezier(.22, .61, .36, 1),
    width .34s cubic-bezier(.22, .61, .36, 1), height .34s cubic-bezier(.22, .61, .36, 1),
    opacity .28s ease, box-shadow .28s ease;
  // 视差用的鼠标相对位置（-0.5 ~ 0.5），由 @pointermove 写入
  --mx: 0;
  --my: 0;

  &:hover {
    z-index: 5;
    box-shadow: 0 16px 40px rgba(0, 0, 0, .55);
    outline: 1px solid rgba(255, 255, 255, .7);
    outline-offset: -1px;

    .cover {
      filter: brightness(1.1);
      transform: translate(calc(var(--mx) * 10px), calc(var(--my) * 10px)) scale(1.05);
    }
    .coverFallback { transform: translate(calc(var(--mx) * 10px), calc(var(--my) * 10px)) scale(1.05); }
    .overlay { opacity: 1; }
  }
}

// 被点开的那张：长到 6×6 格 + 白描边 + 抬到最上层，邻居压暗
.tileFocus {
  z-index: 30;
  border-radius: 8px !important;
  box-shadow: 0 40px 100px rgba(0, 0, 0, .78), 0 0 0 2px rgba(255, 255, 255, .9);
  outline: none;

  &:hover { outline: none; }

  .overlay {
    opacity: 1;
    padding: 52px 18px 16px;
    background: linear-gradient(180deg, transparent 0%, rgba(5, 7, 10, .84) 84%);
  }
  .name { font-size: 16px; }
  .singer { font-size: 12px; margin-top: 3px; opacity: .78; }
  .eq { right: 18px; bottom: 18px; height: 20px; }
}
.tileDim {
  opacity: .3;
  &:hover { outline: none; box-shadow: none; }
}

.tileActive {
  box-shadow: 0 0 0 2px var(--color-primary), 0 10px 30px rgba(0, 0, 0, .5);

  &:hover { box-shadow: 0 0 0 2px var(--color-primary), 0 16px 40px rgba(0, 0, 0, .6); }
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
  z-index: 32;
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
  .tile { transition: none; }
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
