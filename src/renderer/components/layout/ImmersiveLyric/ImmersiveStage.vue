<template>
  <div
    v-if="visible"
    data-view="immersive-lyric"
    :class="[$style.root, { [$style.rootPanelOpen]: panelOpen }]"
  >
    <!-- 背景三层（自底向上）：
         · bgFallBack：不透明深色兜底，永远在最低层 —— 有封面时它被上方封面完全盖住；
           无封面 / 封面加载失败 / 切歌间隙时它顶上，保证底层播放页面永不透出、也不闪白。
         · bgPic：封面层，仅在 musicInfo.pic 存在时才有 background-image；否则透明，露出兜底层。
         · bgMask：暗化渐变，压在最上保证歌词可读。
         刻意不复用 AppBackground 组件：它是为 #root / PlayDetail 挂点写的，沉浸式只需
         「一张图 + 一张暗幕 + 一层不透明兜底」，直接铺 CSS 更轻，也不牵动背景系统。 -->
    <div :class="$style.bgFallBack"></div>
    <div :class="$style.bgPic" :style="bgStyle"></div>
    <div :class="$style.bgMask"></div>

    <div :class="$style.topBar">
      <div
        :class="$style.topBtn"
        role="button"
        aria-hidden="true"
        :aria-label="$t('immersive_lyric__close')"
        @click="$emit('close')"
      >
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" height="18px" viewBox="0 0 24 24" space="preserve">
          <use xlink:href="#icon-close" />
        </svg>
      </div>
    </div>

    <!-- 歌词区只负责「容器 + 无歌词兜底」，具体怎么画由视觉模式（slot）决定。
         无歌词时渲染 .empty、否则渲染 slot —— 与拆分前的 DOM 结构一致。 -->
    <div :class="$style.lyricArea">
      <div v-if="!hasLyric" :class="$style.empty">
        {{ $t('immersive_lyric__no_lyric') }}
      </div>
      <slot v-else />
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

    <!-- 侧栏（L1 只有空壳）：默认不渲染，因此关闭时 DOM 与拆分前完全一致 -->
    <immersive-panel :open="panelOpen" @close="$emit('toggle-panel')" />
  </div>
</template>

<script>
import { computed } from '@common/utils/vueTools'
import { musicInfo, isPlay } from '@renderer/store/player/state'
import { playNext, playPrev, togglePlay } from '@renderer/core/player'
import usePlayProgress from '@renderer/utils/compositions/usePlayProgress'
import ImmersivePanel from './panel/PanelShell.vue'

/**
 * 沉浸式舞台外壳（L1 拆分）
 *
 * 只负责「舞台」本身：三层背景、顶栏、歌词容器、底部信息与播放控制、侧栏挂点。
 * 歌词怎么画由 slot 里的视觉模式决定（当前只有 classic）。
 *
 * ⚠️ 这一层的样式与结构是从拆分前的 index.vue 原样搬过来的，**不要**在这里
 * 顺手改名/调间距/换布局：零视觉回归是 L1 的验收前提。
 * 时钟不在这一层：舞台和模式都只消费 index.vue 传下来的时间。
 */
export default {
  name: 'ImmersiveStage',
  components: { ImmersivePanel },
  props: {
    visible: Boolean,
    /** 当前是否有可用歌词行；false 时显示「暂无歌词」兜底 */
    hasLyric: Boolean,
    /** 侧栏是否展开（展开时歌词区收窄，而不是被遮住） */
    panelOpen: Boolean,
  },
  emits: ['close', 'toggle-panel'],
  setup() {
    const {
      nowPlayTimeStr,
      maxPlayTimeStr,
      progress,
      isActiveTransition,
      handleTransitionEnd,
    } = usePlayProgress()

    const bgStyle = computed(() => musicInfo.pic
      ? { backgroundImage: `url("${musicInfo.pic.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")` }
      : null)

    return {
      musicInfo,
      isPlay,
      bgStyle,
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
// 侧栏宽度：与 PanelShell.vue 的 .panel 宽度保持一致
@panel-width: 320px;

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

  // 侧栏展开时「让位」而不是「遮住」：三条主带各自收右内边距。
  // 只改内边距，背景三层仍是 absolute left/right:0，继续铺满整窗 —— 所以面板底下
  // 看到的仍是同一张封面/暗幕，不会出现一条硬边。
  // 关闭时这个类名不挂，下面的规则全部不生效，经典模式布局与拆分前逐像素一致。
  &.rootPanelOpen {
    .lyricArea {
      padding-right: calc(8% + @panel-width);
    }

    .topBar {
      padding-right: calc(22px + @panel-width);
    }

    .footer {
      padding-right: calc(26px + @panel-width);
    }
  }
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

// 兜底背景：必须「不透明」，否则无封面时底层播放页面会透出来。
// 之前用的是 --color-app-background（带 alpha 的主题色）+ --background-image: none，
// 两者都半透明，无封面时底层直接漏出来（第四阶段任务 A 修复）。
// 这里改成纯不透明深色渐变：有封面时被上方 .bgPic 完全盖住；无封面 / 加载失败 /
// 切歌间隙时它顶上，既不会透出底层页面，也不会因为图片未加载完而闪白。
.bgFallBack {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(180deg, #1b1b22 0%, #101015 100%);
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
  // 与歌词区同步收窄（面板开合时一起动，避免各走各的）
  transition: padding-right .26s cubic-bezier(.22, .61, .36, 1);
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
  // 收窄时跟着背景一起过渡，避免面板一开一关歌词区"啪"地跳一下
  transition: padding-right .26s cubic-bezier(.22, .61, .36, 1);
}

.empty {
  font-size: 16px;
  opacity: .6;
}

// ── 底部信息与控制 ──────────────────────────────────────────────────
.footer {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  padding: 18px 26px 26px;
  gap: 24px;
  transition: padding-right .26s cubic-bezier(.22, .61, .36, 1);
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

// 减少动态效果：连"收窄"这个过渡也去掉，只保留最终布局
@media (prefers-reduced-motion: reduce) {
  .lyricArea,
  .topBar,
  .footer {
    transition: none;
  }
}
</style>
