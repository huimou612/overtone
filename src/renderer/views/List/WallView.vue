<template>
  <div
    v-if="visible"
    ref="dom_root"
    data-view="song-wall"
    :class="$style.root"
    tabindex="-1"
    @keydown.esc.stop="handleClose"
  >
    <div :class="$style.bg"></div>

    <header :class="$style.topBar">
      <button :class="$style.backBtn" :aria-label="$t('back')" @click="handleClose">
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="18px" viewBox="0 0 24 24" space="preserve">
          <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <div :class="$style.title">
        <span :class="$style.titleName">{{ listName }}</span>
        <span :class="$style.titleCount">{{ list.length }} {{ $t('wall__song_count') }}</span>
      </div>
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
          @click="handlePlay(index)"
          @keydown.enter="handlePlay(index)"
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
  </div>
</template>

<script>
import { ref, computed, watch, onMounted, onBeforeUnmount } from '@common/utils/vueTools'
import { nextTick } from 'vue'
import { getListMusics } from '@renderer/store/list/action'
import { defaultList, loveList, tempList, userLists } from '@renderer/store/list/state'
import { playMusicInfo, playInfo } from '@renderer/store/player/state'
import { playList } from '@renderer/core/player'
import { assertApiSupport } from '@renderer/store/utils'
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
        void nextTick(() => {
          // 移挂 body：路由过渡容器带 transform 会创建层叠上下文，
          // 把 fixed+z-index 的墙困在本地层级里（toolbar 会透出来）
          if (dom_root.value && dom_root.value.parentElement !== document.body) {
            document.body.appendChild(dom_root.value)
          }
          dom_root.value?.focus()
        })
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
      if (dom_root.value && dom_root.value.parentElement === document.body) dom_root.value.remove()
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

    const handlePlay = index => {
      const item = list.value[index]
      if (!item || !assertApiSupport(item.source)) return
      playList(props.listId, index)
    }
    const handleClose = () => { emit('close') }

    return {
      list,
      dom_root,
      listName,
      isCurrent,
      playingName,
      picUrl,
      fallbackStyle,
      handlePlay,
      handleClose,
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

.topBar {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px 26px 12px;
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
  transition: transform .22s ease, box-shadow .22s ease;
  animation: tileIn .34s cubic-bezier(.22, .61, .36, 1) backwards;

  &:hover {
    transform: translateY(-3px);
    box-shadow: 0 10px 28px rgba(0, 0, 0, .45);
    .cover { filter: brightness(1.12); }
    .overlay { opacity: 1; }
  }

  &:active { transform: translateY(-1px) scale(.99); }
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
  transition: filter .22s ease;
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
