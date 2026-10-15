<template>
  <div
    v-if="visible"
    data-view="immersive-lyric"
    :class="$style.root"
  >
    <!-- 背景两层：封面优先；没有封面时回落到现有的壁纸/主题背景（--background-image）。
         这里刻意不复用 AppBackground 组件 —— 它是为 #root / PlayDetail 两处挂点写的，
         沉浸式视图只需要「一张图 + 一张暗幕」，直接铺 CSS 更轻，也不会牵动背景系统。 -->
    <div :class="$style.bgPic" :style="bgStyle"></div>
    <div :class="$style.bgFallBack"></div>
    <div :class="$style.bgMask"></div>

    <div :class="$style.topBar">
      <div
        :class="$style.topBtn"
        role="button"
        aria-hidden="true"
        :aria-label="$t('immersive_lyric__close')"
        @click="close"
      >
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" height="18px" viewBox="0 0 24 24" space="preserve">
          <use xlink:href="#icon-close" />
        </svg>
      </div>
    </div>

    <div :class="$style.lyricArea">
      <div v-if="!timeline.lines.length" :class="$style.empty">
        {{ $t('immersive_lyric__no_lyric') }}
      </div>
      <div v-else :class="$style.lyricColumn">
        <div
          v-for="item in visibleLines"
          :key="`${keyPrefix}-${item.index}`"
          :class="[$style.line, $style['line_' + item.state]]"
          :data-state="item.state"
          :data-index="item.index"
        >
          <p v-if="item.line.words" :class="$style.words">
            <span
              v-for="(word, wi) in item.line.words"
              :key="wi"
              :class="[$style.word, $style['word_' + getWordState(word, nowMs)]]"
              :data-word-state="getWordState(word, nowMs)"
            >{{ word.text }}</span>
          </p>
          <p v-else :class="$style.text">{{ item.line.text }}</p>
          <p v-if="item.line.translation" :class="$style.translation">{{ item.line.translation }}</p>
        </div>
      </div>
    </div>

    <div :class="$style.footer">
      <div :class="$style.info">
        <img v-if="musicInfo.pic" :class="$style.cover" :src="musicInfo.pic" alt="">
        <div :class="$style.infoText">
          <div :class="$style.name">{{ musicInfo.name }}</div>
          <div :class="$style.singer">{{ musicInfo.singer }}</div>
        </div>
      </div>
      <div :class="$style.progressWrap">
        <common-progress-bar
          :class-name="$style.progress"
          :progress="progress"
          :handle-transition-end="handleTransitionEnd"
          :is-active-transition="isActiveTransition"
        />
        <div :class="$style.timeLabel">
          <span>{{ nowPlayTimeStr }}</span>
          <span>{{ maxPlayTimeStr }}</span>
        </div>
      </div>
      <div :class="$style.controls">
        <div :class="$style.controlBtn" :aria-label="$t('player__prev')" @click="playPrev()">
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 1024 1024" space="preserve">
            <use xlink:href="#icon-prevMusic" />
          </svg>
        </div>
        <div :class="$style.controlBtn" :aria-label="isPlay ? $t('player__pause') : $t('player__play')" @click="togglePlay">
          <svg v-if="isPlay" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 1024 1024" space="preserve">
            <use xlink:href="#icon-pause" />
          </svg>
          <svg v-else version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 1024 1024" space="preserve">
            <use xlink:href="#icon-play" />
          </svg>
        </div>
        <div :class="$style.controlBtn" :aria-label="$t('player__next')" @click="playNext()">
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 1024 1024" space="preserve">
            <use xlink:href="#icon-nextMusic" />
          </svg>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, watch, onMounted, onBeforeUnmount } from '@common/utils/vueTools'
import { musicInfo, isPlay, isShowImmersiveLyric } from '@renderer/store/player/state'
import { setShowImmersiveLyric } from '@renderer/store/player/action'
import { playNext, playPrev, togglePlay } from '@renderer/core/player'
import { getCurrentTime, onPlaying, onPause, onEnded, onEmptied, onTimeupdate, isEmpty } from '@renderer/plugins/player'
import usePlayProgress from '@renderer/utils/compositions/usePlayProgress'
import {
  buildLyricTimeline,
  findActiveLineIndex,
  getWordState,
} from '@renderer/core/immersiveLyric/timeline'

export default {
  name: 'ImmersiveLyric',
  setup() {
    const visible = computed(() => isShowImmersiveLyric.value)

    const {
      nowPlayTimeStr,
      maxPlayTimeStr,
      progress,
      isActiveTransition,
      handleTransitionEnd,
    } = usePlayProgress()

    // ── 时间源 ────────────────────────────────────────────────────────
    // 不另造时钟：每一帧都去读现有播放器里那枚 audio 元素的 currentTime。
    // 播放中才跑 rAF；暂停/停止/卸载立即停。setProgress（拖动进度）与
    // musicToggled（切歌）到达时补一次同步，保证就算当前没在播也能立刻定位。
    const nowMs = ref(0)

    const syncTime = () => {
      nowMs.value = getCurrentTime() * 1000
    }

    let rafId = null
    const tick = () => {
      syncTime()
      rafId = window.requestAnimationFrame(tick)
    }
    const startLoop = () => {
      if (rafId != null) return
      syncTime()
      rafId = window.requestAnimationFrame(tick)
    }
    const stopLoop = () => {
      if (rafId == null) return
      window.cancelAnimationFrame(rafId)
      rafId = null
      syncTime()
    }

    // ⚠️ 这里**只用** visible，不看 store 里的 isPlay：
    //    isPlay 是应用自己的一份副本，播放失败/被接管时会被置回 false，
    //    而 audio 其实还在走 —— 拿它当开关会把刚启动的循环立刻停掉
    //    （实测症状：播放推进中歌词不动，一暂停反而跳到正确位置）。
    //    播放状态一律以 audio 元素的 playing / pause / ended / emptied 为准。
    watch(visible, isVisible => {
      if (isVisible) startLoop()
      else stopLoop()
    })

    // ── 歌词时间轴 ────────────────────────────────────────────────────
    const timeline = computed(() => buildLyricTimeline({
      lrc: musicInfo.lrc,
      lxlrc: musicInfo.lxlrc,
      tlrc: musicInfo.tlrc,
    }))

    const activeIndex = computed(() => findActiveLineIndex(timeline.value.lines, nowMs.value))

    const visibleLines = computed(() => {
      const lines = timeline.value.lines
      if (!lines.length) return []
      const base = activeIndex.value < 0 ? 0 : activeIndex.value
      const start = Math.max(0, base - 1)
      const end = Math.min(lines.length, start + 4)
      const list = []
      for (let index = start; index < end; index++) {
        list.push({
          index,
          line: lines[index],
          state: index === activeIndex.value ? 'active' : (index < activeIndex.value ? 'prev' : 'next'),
        })
      }
      return list
    })

    // 带上歌曲 id：切歌时强制重建行节点，避免沿用上一首的过渡状态
    const keyPrefix = computed(() => musicInfo.id ?? 'none')

    const bgStyle = computed(() => musicInfo.pic
      ? { backgroundImage: `url("${musicInfo.pic.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")` }
      : null)

    const close = () => {
      setShowImmersiveLyric(false)
    }

    // ── 事件订阅 ──────────────────────────────────────────────────────
    // 循环的开关挂在 **audio 元素自己的** playing / pause / ended / emptied 上。
    // 这是播放状态的唯一真相来源 —— store 里的 isPlay 是一条可能滞后的副本。
    const handleSetProgress = () => {
      syncTime()
    }
    const handleMusicToggled = () => {
      syncTime()
    }
    const handleLyricUpdated = () => {
      syncTime()
    }
    const handlePlaying = () => {
      startLoop()
    }
    const handleStopped = () => {
      stopLoop()
    }
    const handleEmptied = () => {
      // ⚠️ emptied 有两种来源，不能一律当成「播放器空了」：
      //    ① setResource 换资源时会顺带触发一次 emptied（此刻 src 其实已经换成新的）；
      //    ② 真的 setStop() 才把 src 清空。
      //    一律停循环的话，① 之后如果没有 playing 事件到达（实测在某些机器上
      //    play() 会先 error→emptied 再真正起播，playing 事件根本不来），歌词就卡死了。
      //    所以只有 isEmpty() 为真（src 真的没了）才收工，否则只补一次同步。
      if (isEmpty()) {
        stopLoop()
        nowMs.value = 0
      } else {
        syncTime()
      }
    }

    // ── 看门狗（1Hz）───────────────────────────────────────────────────
    // 光靠事件不够：上面那种「error→emptied→真正起播但没有 playing 事件」的时序
    // 会让循环停掉后再也拉不起来。所以挂一条低频心跳做兜底：
    //   · 只在「视图开着且循环没在跑」时才读一次 currentTime，别的时候不做任何事
    //     —— 不烧 CPU，也不跟 rAF 抢活；
    //   · 判据是「累计读到 2 次时间在前进」才把循环拉起来。
    //     真暂停时时间不动 → 累计永远是 0 → 永不误启；
    //     拖进度只造成一次跳变 → 只累计 1 次 → 也不会误启。
    //     ⚠️ 必须是**累计**而不是「连续两次」：实测本机音频时间是跳变式推进的
    //     （5s → 9s → 14s → 17s，中间隔一两次心跳完全不动），
    //     写成「连续」会因为中间那一次不动而清零，永远凑不满。
    //   · 它不另造时钟：时间仍然只有一个来源 —— getCurrentTime()。
    let heartbeatId = null
    let lastSeenTime = -1
    let advanceHits = 0
    const heartbeat = () => {
      if (!visible.value) { advanceHits = 0; lastSeenTime = -1; return }
      if (rafId != null) { lastSeenTime = getCurrentTime(); advanceHits = 0; return }
      const time = getCurrentTime()
      if (lastSeenTime >= 0 && time > lastSeenTime + 0.05) advanceHits++
      lastSeenTime = time
      if (advanceHits >= 2) {
        advanceHits = 0
        startLoop()
      }
    }

    const handleKeyDown = event => {
      if (event.key == 'Escape' && visible.value) close()
    }

    let removePlaying = null
    let removePause = null
    let removeEnded = null
    let removeEmptied = null
    let removeTimeupdate = null

    onMounted(() => {
      window.app_event.on('setProgress', handleSetProgress)
      window.app_event.on('musicToggled', handleMusicToggled)
      window.app_event.on('lyricUpdated', handleLyricUpdated)
      window.addEventListener('keydown', handleKeyDown)

      removePlaying = onPlaying(handlePlaying)
      removePause = onPause(handleStopped)
      removeEnded = onEnded(handleStopped)
      removeEmptied = onEmptied(handleEmptied)
      // ⚠️ 补一条 timeupdate 兜底（约 4Hz）：窗口被盖住/停合成时 Chromium 不跑 rAF，
      //    而 media 的 timeupdate 照常触发。这样就算没有帧，歌词也不会停在原地。
      //    帧正常时 rAF 负责平滑，这条只当下限，不会和它打架（读到的是同一个 currentTime）。
      removeTimeupdate = onTimeupdate(syncTime)

      syncTime()
      if (visible.value && isPlay.value) startLoop()
      heartbeatId = window.setInterval(heartbeat, 1000)
    })

    onBeforeUnmount(() => {
      window.app_event.off('setProgress', handleSetProgress)
      window.app_event.off('musicToggled', handleMusicToggled)
      window.app_event.off('lyricUpdated', handleLyricUpdated)
      window.removeEventListener('keydown', handleKeyDown)

      removePlaying?.()
      removePause?.()
      removeEnded?.()
      removeEmptied?.()
      removeTimeupdate?.()

      if (heartbeatId != null) {
        window.clearInterval(heartbeatId)
        heartbeatId = null
      }
      stopLoop()
      nowMs.value = 0
    })

    return {
      visible,
      musicInfo,
      isPlay,
      timeline,
      visibleLines,
      keyPrefix,
      nowMs,
      bgStyle,
      close,
      getWordState,
      nowPlayTimeStr,
      maxPlayTimeStr,
      progress,
      isActiveTransition,
      handleTransitionEnd,
      playNext,
      playPrev,
      togglePlay,
    }
  },
}
</script>

<style lang="less" module>
// 层级夹在弹窗(100)之上、Tips(10001)之下
@immersive-z: 200;

.root {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: @immersive-z;
  overflow: hidden;
  display: flex;
  flex-flow: column nowrap;
  color: #fff;
  user-select: none;
}

// ── 背景 ────────────────────────────────────────────────────────────
.bgPic {
  position: absolute;
  top: -8%;
  left: -8%;
  right: -8%;
  bottom: -8%;
  background-position: center;
  background-size: cover;
  background-repeat: no-repeat;
  filter: blur(60px) saturate(1.2);
  // 放大到超出窗口，避免模糊把边缘拉透明
  transform: scale(1.1);
}

.bgFallBack {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--color-app-background);
  background-image: var(--background-image);
  background-position: center;
  background-size: cover;
}

// 暗幕：保证大字在任何封面上都读得清
.bgMask {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(180deg, rgba(0, 0, 0, .35) 0%, rgba(0, 0, 0, .55) 55%, rgba(0, 0, 0, .72) 100%);
}

// ── 顶栏（只有退出，设置面板留给后续阶段）────────────────────────────
.topBar {
  position: relative;
  flex: none;
  display: flex;
  justify-content: flex-end;
  padding: 18px 22px;
}

.topBtn {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 50%;
  color: #fff;
  background-color: rgba(255, 255, 255, .12);
  transition: background-color .2s ease;

  &:hover {
    background-color: rgba(255, 255, 255, .24);
  }
}

// ── 歌词区 ──────────────────────────────────────────────────────────
.lyricArea {
  position: relative;
  flex: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 8%;
  overflow: hidden;
}

.empty {
  font-size: 16px;
  opacity: .6;
}

.lyricColumn {
  width: 100%;
  display: flex;
  flex-flow: column nowrap;
  align-items: flex-start;
  gap: 18px;
}

.line {
  max-width: 100%;
  line-height: 1.4;
  word-break: break-word;
  transition: opacity .28s ease;
}

// 当前行是焦点，其余弱化但不隐藏：滚动/跟读都需要看到上下文
.line_active {
  font-size: 42px;
  font-weight: 700;
  opacity: 1;
}

.line_next {
  font-size: 26px;
  opacity: .42;
}

.line_prev {
  font-size: 26px;
  opacity: .28;
}

.text {
  margin: 0;
}

.words {
  margin: 0;
}

.word {
  transition: color .18s ease, opacity .18s ease;
}

// 已唱过的字：恢复到满亮白（未唱到的字是半透明，形成自然的推进感）
.word_done {
  color: #fff;
  opacity: 1;
}

// 正在唱的字：只上主色，不做位移/缩放 —— 阅读优先
.word_active {
  color: var(--color-primary, #4facfe);
}

.word_todo {
  opacity: .5;
}

.translation {
  margin: 6px 0 0;
  font-size: 18px;
  font-weight: 400;
  opacity: .62;
}

// ── 底部信息与控制 ──────────────────────────────────────────────────
.footer {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  padding: 18px 26px 26px;
  gap: 24px;
}

.info {
  flex: none;
  display: flex;
  align-items: center;
  width: 28%;
  min-width: 0;
  overflow: hidden;
}

.cover {
  width: 54px;
  height: 54px;
  flex: none;
  border-radius: 4px;
  object-fit: cover;
  box-shadow: 0 2px 12px rgba(0, 0, 0, .35);
}

.infoText {
  min-width: 0;
  padding-left: 12px;
}

.name {
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.singer {
  margin-top: 4px;
  font-size: 12px;
  opacity: .6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.progressWrap {
  flex: auto;
  min-width: 0;
}

.progress {
  height: 100%;
}

.timeLabel {
  margin-top: 4px;
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  opacity: .65;
}

.controls {
  flex: none;
  display: flex;
  align-items: center;
  gap: 14px;
}

.controlBtn {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #fff;
  opacity: .8;
  transition: opacity .2s ease;

  &:hover {
    opacity: 1;
  }
}
</style>
