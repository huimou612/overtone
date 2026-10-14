<template>
  <div :class="$style.tools">
    <button :class="$style.btn" :aria-label="$t('ai_lyric__menu')" @click="openAiLyric">
      <svg viewBox="0 0 24 24" width="14" height="14"><use xlink:href="#icon-text" /></svg>
      <span>{{ $t('player__tool_ai_lyric') }}</span>
    </button>
    <button :class="$style.btn" :aria-label="$t('stem__menu')" @click="openStems">
      <svg viewBox="0 0 24 24" width="14" height="14"><use xlink:href="#icon-audio-wave" /></svg>
      <span>{{ $t('player__tool_stem') }}</span>
    </button>

    <!--
      第三个入口是「不在这页也能到」：工作台页面能看到状态（模型装没装、Key 配没配），
      而这里只负责「随手就能点开」。两处各自挂一份对话框实例，同一时间只会有一个显形。
    -->
    <router-link :class="$style.btn" :to="{ path: '/workbench' }">
      <svg viewBox="0 0 24 24" width="14" height="14"><use xlink:href="#icon-workbench" /></svg>
      <span>{{ $t('workbench__nav') }}</span>
    </router-link>

    <AiLyricModal v-model="aiVisible" :music-info="playMusicInfo.musicInfo" @update-lyric="handleAiLyricSaved" />
    <StemModal v-model="stemVisible" />
  </div>
</template>

<script>
import { ref } from '@common/utils/vueTools'
import { playMusicInfo } from '@renderer/store/player/state'
import { setMusicInfo } from '@renderer/store/player/action'
import AiLyricModal from './AiLyricModal.vue'
import StemModal from './StemModal.vue'

export default {
  name: 'AiToolBar',
  components: {
    AiLyricModal,
    StemModal,
  },
  setup() {
    const aiVisible = ref(false)
    const stemVisible = ref(false)

    const openAiLyric = () => {
      aiVisible.value = true
    }
    const openStems = () => {
      stemVisible.value = true
    }

    // 与工作台页面同一条路：主进程把新生成的 lxlrc 带回来，这里灌进播放状态再广播，
    // LyricPlayer 监听 lyricUpdated 重读 —— 歌词立刻变成逐字效果，不必重播。
    const handleAiLyricSaved = ({ lxlrc }) => {
      if (!lxlrc) return
      setMusicInfo({ lxlrc })
      window.app_event.lyricUpdated()
    }

    return {
      playMusicInfo,
      aiVisible,
      stemVisible,
      openAiLyric,
      openStems,
      handleAiLyricSaved,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.tools {
  flex: none;
  display: flex;
  flex-flow: row wrap;
  justify-content: center;
  gap: 8px;
  padding-top: 14px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 12px;
  border: none;
  border-radius: 14px;
  font-family: inherit;
  font-size: 12px;
  text-decoration: none;
  cursor: pointer;
  outline: none;
  color: var(--color-font);
  // 播放详情页铺的是封面/壁纸，用带 alpha 的主题色做胶囊底，比实色块贴合得多
  background-color: var(--color-primary-light-100-alpha-700);
  backdrop-filter: blur(8px);
  transition: @transition-fast;
  transition-property: background-color, color;

  &:hover {
    color: var(--color-primary);
    background-color: var(--color-primary-light-300-alpha-700);
  }
  &:active {
    background-color: var(--color-primary-light-300-alpha-800);
  }
}
</style>
