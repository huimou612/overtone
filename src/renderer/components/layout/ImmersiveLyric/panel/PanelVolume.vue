<template>
  <section :class="$style.section" data-panel-section="volume">
    <div :class="$style.head">
      <span :class="$style.title">{{ $t('immersive_lyric__volume_title') }}</span>
      <div :class="$style.headRight">
        <span :class="$style.percent" data-volume-percent>{{ percent }}%</span>
        <button
          type="button"
          :class="[$style.muteBtn, { [$style.isMuted]: isMute }]"
          :aria-label="$t('player__volume_mute_label')"
          :aria-pressed="isMute ? 'true' : 'false'"
          :data-volume-muted="isMute ? '1' : '0'"
          @click="toggleMute"
        >
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" width="18px" viewBox="0 0 24 24" space="preserve">
            <use :xlink:href="icon" />
          </svg>
        </button>
      </div>
    </div>
    <base-slider-bar
      :class="$style.slider"
      :value="volume"
      :min="0"
      :max="1"
      :step="0.01"
      @change="handleVolume"
    />
  </section>
</template>

<script>
import { computed } from '@common/utils/vueTools'
import { volume, isMute } from '@renderer/store/player/volume'

/**
 * 侧栏 · 音量
 *
 * 只读 store 里的 `volume` / `isMute`（它们由 `core/useApp/usePlayer/useVolume.ts`
 * 与 appSetting 双向同步），写入一律走 `window.app_event`：
 *   · setVolume(n)        —— useVolume 里会钳制到 0~1、落 audio.volume、300ms 防抖持久化
 *   · setVolumeIsMute(b)  —— 只切 audio.muted，**不动 volume 值**
 * 刻意不直接调 `saveVolume` / `saveVolumeIsMute`：那会绕过 store→播放器的同步链。
 */
export default {
  name: 'PanelVolume',
  setup() {
    // 显示用百分比：内部/持久化一律 0~1，只在这里换算
    const percent = computed(() => Math.round(volume.value * 100))

    const icon = computed(() => {
      if (isMute.value) return '#icon-volume-mute-outline'
      if (volume.value == 0) return '#icon-volume-off-outline'
      if (volume.value < 0.3) return '#icon-volume-low-outline'
      if (volume.value < 0.7) return '#icon-volume-medium-outline'
      return '#icon-volume-high-outline'
    })

    const handleVolume = val => {
      window.app_event.setVolume(val)
    }

    const toggleMute = () => {
      window.app_event.setVolumeIsMute(!isMute.value)
    }

    return {
      volume,
      isMute,
      percent,
      icon,
      handleVolume,
      toggleMute,
    }
  },
}
</script>

<style lang="less" module>
.section {
  padding: 14px 0;
  border-bottom: 1px solid rgba(255, 255, 255, .08);
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: .2px;
  opacity: .9;
}

.headRight {
  display: flex;
  align-items: center;
  gap: 8px;
}

.percent {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  opacity: .6;
}

.muteBtn {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  color: #fff;
  background-color: transparent;
  opacity: .7;
  transition: opacity .2s ease, background-color .2s ease;

  &:hover {
    opacity: 1;
    background-color: rgba(255, 255, 255, .12);
  }
}

.isMuted {
  opacity: 1;
  background-color: rgba(255, 255, 255, .16);
}

.slider {
  height: 3px;
}
</style>
