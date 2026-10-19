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

    <!-- 主区：顶栏 + 歌词区 + 侧栏。
         侧栏的定位上下文是这一层，而底部播放栏在它**之外** —— 所以面板无论
         是让位还是覆盖，都不可能压住底部控件（L2 需求）。 -->
    <div :class="$style.mainArea" data-immersive-main>
      <div :class="$style.topBar">
        <div :class="$style.topActions">
          <!-- 面板入口（L2）：放在退出按钮左侧，退出按钮仍是最后一个子元素，
               位置与 L1 完全一致，因此关闭态的唯一视觉差异就是这一个新按钮。 -->
          <button
            type="button"
            :class="[$style.topBtn, { [$style.topBtnActive]: panelOpen }]"
            :aria-label="$t('immersive_lyric__panel_open')"
            :aria-expanded="panelOpen ? 'true' : 'false'"
            data-immersive-panel-toggle="1"
            @click="$emit('toggle-panel')"
          >
            <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" height="18px" viewBox="0 0 24 24" space="preserve">
              <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.7" />
              <rect x="14.2" y="4.5" width="6.3" height="15" rx="2" fill="currentColor" opacity=".85" />
              <path d="M7 9h4M7 12.5h4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
            </svg>
          </button>
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
      </div>

      <!-- 歌词区只负责「容器 + 无歌词兜底」，具体怎么画由视觉模式（slot）决定。
           无歌词时渲染 .empty、否则渲染 slot —— 与拆分前的 DOM 结构一致。 -->
      <div :class="$style.lyricArea" data-immersive-lyric-area>
        <div v-if="!hasLyric" :class="$style.empty">
          {{ $t('immersive_lyric__no_lyric') }}
        </div>
        <slot v-else />
      </div>

      <!-- 侧栏：v-if 在 PanelShell 内部，关闭时不渲染任何节点 -->
      <immersive-panel :open="panelOpen" @close="$emit('toggle-panel')">
        <panel-volume />
        <panel-play-mode />
        <panel-queue />
      </immersive-panel>
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

    <!-- 侧栏已在 .mainArea 内（见上），这里不再重复渲染 -->
  </div>
</template>

<script>
import { computed } from '@common/utils/vueTools'
import { musicInfo, isPlay } from '@renderer/store/player/state'
import { playNext, playPrev, togglePlay } from '@renderer/core/player'
import usePlayProgress from '@renderer/utils/compositions/usePlayProgress'
import ImmersivePanel from './panel/PanelShell.vue'
import PanelVolume from './panel/PanelVolume.vue'
import PanelPlayMode from './panel/PanelPlayMode.vue'
import PanelQueue from './panel/PanelQueue.vue'

/**
 * 沉浸式舞台外壳（L1 拆分，L2 接侧栏）
 *
 * 只负责「舞台」本身：三层背景、顶栏、歌词容器、底部信息与播放控制、侧栏挂点。
 * 歌词怎么画由 slot 里的视觉模式决定（当前只有 classic）。
 *
 * L2 变化（两处，其余保持 L1 原样）：
 *   · 顶栏加了侧栏入口按钮（放在退出按钮左侧，退出按钮位置不变）；
 *   · 顶栏 + 歌词区 + 侧栏包进 .mainArea —— 侧栏只覆盖/挤占主区，
 *     底部播放栏在 .mainArea 之外，永远不会被面板遮挡。
 *
 * ⚠️ 这一层的样式尽量别再顺手调：零视觉回归（除入口按钮外）仍是验收前提。
 * 时钟不在这一层：舞台和模式都只消费 index.vue 传下来的时间。
 */
export default {
  name: 'ImmersiveStage',
  components: { ImmersivePanel, PanelVolume, PanelPlayMode, PanelQueue },
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

.root {
  // 侧栏宽度（自适应）：正常 320px，窄窗逐级收窄，极窄切覆盖式。
  // 由 CSS 变量下发，PanelShell.vue 用 var(--ilus-panel-w) 取同一份值。
  // ⚠️ 三档断点与 PanelShell.vue 的 760px 覆盖断点必须手工保持一致。
  --ilus-panel-w: 320px;

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

  // 侧栏展开时「让位」而不是「遮住」：主区两条带各自收右内边距。
  // 只改内边距，背景三层仍是 absolute left/right:0，继续铺满整窗 —— 所以面板底下
  // 看到的仍是同一张封面/暗幕，不会出现一条硬边。
  // 关闭时这个类名不挂，下面的规则全部不生效，经典模式布局与拆分前逐像素一致。
  // ⚠️ 底部 footer 不在 .mainArea 内，面板压不到它，因此**不需要**再给它加内边距。
  &.rootPanelOpen {
    .lyricArea {
      padding-right: calc(8% + var(--ilus-panel-w));
    }

    .topBar {
      padding-right: calc(22px + var(--ilus-panel-w));
    }
  }
}

// 窄窗口：侧栏跟着收窄，避免把歌词区挤没
@media (max-width: 1024px) {
  .root {
    --ilus-panel-w: 288px;
  }
}

@media (max-width: 900px) {
  .root {
    --ilus-panel-w: 264px;
  }
}

// 极窄窗口：面板改为「覆盖式」，不再让位（PanelShell 里同步切成 inset:0）
@media (max-width: 760px) {
  .root.rootPanelOpen {
    .lyricArea {
      padding-right: 8%;
    }

    .topBar {
      padding-right: 22px;
    }
  }
}

// 主区：顶栏 + 歌词区 + 侧栏。侧栏的定位上下文。
.mainArea {
  position: relative;
  flex: auto;
  min-height: 0;
  display: flex;
  flex-flow: column nowrap;
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
  filter: blur(64px) saturate(1.12) brightness(.92);
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
  background: linear-gradient(180deg, #14161c 0%, #0c0e13 100%);
}

// 暗幕：保证大字在任何封面上都读得清
.bgMask {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(180deg, rgba(8, 10, 14, .30) 0%, rgba(8, 10, 14, .50) 55%, rgba(8, 10, 14, .68) 100%);

  // 黑胶沟槽母题（v4）：极淡同心圆，位置偏右，mask 渐隐 —— 只做氛围，不压歌词。
  // 用背景定位实现（元素本身 inset:0），不会产生滚动溢出。
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: repeating-radial-gradient(circle at calc(100% + 100px) 50%, rgba(255, 255, 255, .035) 0 1.4px, transparent 1.4px 4.4px);
    -webkit-mask-image: radial-gradient(circle at calc(100% + 100px) 50%, #000 0 250px, transparent 390px);
    mask-image: radial-gradient(circle at calc(100% + 100px) 50%, #000 0 250px, transparent 390px);
  }
}

// ── 顶栏（L2：退出按钮左侧多一个侧栏入口）──────────────────────────────
.topBar {
  position: relative;
  flex: none;
  display: flex;
  justify-content: flex-end;
  padding: 18px 22px;
  // 与歌词区同步收窄（面板开合时一起动，避免各走各的）
  transition: padding-right .26s cubic-bezier(.22, .61, .36, 1);
}

// 按钮组：退出按钮始终是最后一个子元素 → 它的位置与 L1 完全一致
.topActions {
  display: flex;
  align-items: center;
  gap: 10px;
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

// 只有新加的入口是原生 <button>：清掉浏览器默认样式，外观与上面的 div 按钮一致。
// 写成 button.topBtn 是为了**不影响**退出按钮那个 div（保持 L1 逐像素不变）。
button.topBtn {
  padding: 0;
  border: none;
  font: inherit;
  appearance: none;
}

// 面板展开时给入口一个明确的状态，避免「点了没反应」的错觉
.topBtnActive {
  background-color: rgba(255, 255, 255, .26);
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
  border-radius: 8px;
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
