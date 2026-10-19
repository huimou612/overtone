<template>
  <div :class="$style.footer">
    <div :class="$style.footerLeft">
      <control-btns />
      <div :class="$style.progressContainer">
        <div :class="$style.progressContent">
          <common-progress-bar
            :class-name="$style.progress"
            :progress="progress"
            :handle-transition-end="handleTransitionEnd"
            :is-active-transition="isActiveTransition"
          />
        </div>
      </div>
      <div :class="$style.timeLabel"><span :class="$style.status" style="margin-right: 15px">{{ status }}</span><span>{{ nowPlayTimeStr }}</span><span style="margin: 0 5px;">/</span><span>{{ maxPlayTimeStr }}</span></div>
    </div>
    <div :class="$style.playControl">
      <div :class="$style.playBtn" :aria-label="$t('player__prev')" @click="playPrev()">
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 1024 1024" space="preserve">
          <use xlink:href="#icon-prevMusic" />
        </svg>
      </div>
      <div :class="$style.playBtn" :aria-label="isPlay ? $t('player__pause') : $t('player__play')" @click="togglePlay">
        <svg v-if="isPlay" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 1024 1024" space="preserve">
          <use xlink:href="#icon-pause" />
        </svg>
        <svg v-else version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 1024 1024" space="preserve">
          <use xlink:href="#icon-play" />
        </svg>
      </div>
      <div :class="$style.playBtn" :aria-label="$t('player__next')" @click="playNext()">
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 1024 1024" space="preserve">
          <use xlink:href="#icon-nextMusic" />
        </svg>
      </div>
      <!-- 进入沉浸式歌词（独立于普通歌词页，点右上角的 × 或 Esc 退出） -->
      <div :class="$style.openImmersive" :aria-label="$t('immersive_lyric__open')" @click="openImmersiveLyric">
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="16px" viewBox="0 0 24 24" space="preserve">
          <use xlink:href="#icon-immersive" />
        </svg>
        <span :class="$style.openText">{{ $t('immersive_lyric__open') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { playNext, playPrev, togglePlay } from '@renderer/core/player'
import { status, isPlay } from '@renderer/store/player/state'
import { setShowImmersiveLyric } from '@renderer/store/player/action'
import usePlayProgress from '@renderer/utils/compositions/usePlayProgress'

import ControlBtns from './components/ControlBtns.vue'

const {
  nowPlayTimeStr,
  maxPlayTimeStr,
  progress,
  isActiveTransition,
  handleTransitionEnd,
} = usePlayProgress()

const openImmersiveLyric = () => {
  setShowImmersiveLyric(true)
}

</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.footer {
  flex: 0 0 100px;
  overflow: hidden;
  display: flex;
  align-items: center;
}
.footerLeft {
  flex: auto;
  display: flex;
  flex-flow: column nowrap;
  padding: 13px 13px 13px 30px;
  overflow: hidden;
}

.progressContainer {
  width: 100%;
  position: relative;
  padding: 3px 0;
}

.progressContent {
  position: relative;
  height: 16px;
  padding: 5px 0;
  width: 100%;
}
.progress {
  height: 100%;
}

.barTransition {
  transition-property: transform;
  transition-timing-function: ease-out;
  transition-duration: 0.2s;
}
.timeLabel {
  width: 100%;
  height: 18px;
  display: flex;
  span {
    font-size: 13px;
  }
}
.status {
  flex: auto;
}

.playControl {
  flex: none;
  height: 100%;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding: 0 25px;
  color: var(--color-button-font);
}
.openImmersive {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 14px;
  padding: 7px 14px 7px 10px;
  border-radius: 999px;
  border: 1px solid var(--color-primary-alpha-300);
  background-color: var(--color-primary-alpha-100);
  color: var(--color-primary);
  cursor: pointer;
  transition: background-color 0.2s ease, border-color 0.2s ease;

  svg {
    fill: currentColor;
    flex: none;
  }

  &:hover {
    background-color: var(--color-primary-alpha-200);
    border-color: var(--color-primary-alpha-400);
  }

  &:active {
    opacity: .8;
  }
}

.openText {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: .5px;
  white-space: nowrap;
}

@media (max-width: 900px) {
  .openText {
    display: none;
  }

  .openImmersive {
    padding: 7px 10px;
  }
}

.playBtn {
  height: 40%;
  padding: 5px;
  cursor: pointer;
  flex: none;
  // transition: @transition-normal;
  // transition-property: color;
  color: var(--color-button-font);
  transition: opacity 0.2s ease;
  opacity: 1;
  cursor: pointer;

  +.playBtn {
    margin-left: 10px;
  }
  svg {
    fill: currentColor;
    filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.2));
  }
  &:hover {
    opacity: 0.8;
  }
  &:active {
    opacity: 0.6;
  }
}

</style>
