<template>
  <section :class="$style.section" data-panel-section="play-mode">
    <div :class="$style.head">
      <span :class="$style.title">{{ $t('immersive_lyric__mode_title') }}</span>
    </div>
    <div :class="$style.grid">
      <button
        v-for="mode in modes"
        :key="mode.id"
        type="button"
        :class="[$style.item, { [$style.active]: isActive(mode.id) }]"
        :aria-label="$t(mode.labelKey)"
        :aria-pressed="isActive(mode.id) ? 'true' : 'false'"
        :data-play-mode="mode.id"
        :data-active="isActive(mode.id) ? '1' : '0'"
        @click="select(mode.id)"
      >
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="16px" viewBox="0 0 32 32" space="preserve">
          <use :xlink:href="mode.icon" />
        </svg>
        <span :class="$style.label">{{ $t(mode.labelKey) }}</span>
      </button>
    </div>
  </section>
</template>

<script>
import { appSetting } from '@renderer/store/setting'
import useNextTogglePlay from '@renderer/utils/compositions/useNextTogglePlay'

/**
 * 侧栏 · 播放模式
 *
 * 五种模式就是 `LX.AppSetting['player.togglePlayMethod']` 的真实取值域
 * （见 common/types/app_setting.d.ts）：listLoop / random / list / singleLoop / none。
 *
 * 为什么自绘而不是直接用 `common-toggle-play-mode-btn`：
 * 那个组件是「按钮 + 弹层」，弹层由 material-popup-btn 定位，在 320px 侧栏里会被
 * PanelShell 的 `overflow: auto` 裁掉（L2 实拍确认，见 docs/development/10）。
 * 因此这里**只复用业务逻辑**：`useNextTogglePlay().toggleNextPlayMode(mode)`
 * → `setTogglePlayMode` → updateSetting，与主界面按钮写入同一份设置。
 * 名称也复用既有 i18n 键，不新增文案。
 */
const MODES = [
  { id: 'listLoop', labelKey: 'player__play_toggle_mode_list_loop', icon: '#icon-list-loop' },
  { id: 'random', labelKey: 'player__play_toggle_mode_random', icon: '#icon-list-random' },
  { id: 'list', labelKey: 'player__play_toggle_mode_list', icon: '#icon-list-order' },
  { id: 'singleLoop', labelKey: 'player__play_toggle_mode_single_loop', icon: '#icon-single-loop' },
  { id: 'none', labelKey: 'player__play_toggle_mode_off', icon: '#icon-single' },
]

export default {
  name: 'PanelPlayMode',
  setup() {
    const { toggleNextPlayMode } = useNextTogglePlay()

    const isActive = id => appSetting['player.togglePlayMethod'] == id

    const select = id => {
      toggleNextPlayMode(id)
    }

    return {
      modes: MODES,
      isActive,
      select,
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
  margin-bottom: 10px;
}

.title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: .2px;
  opacity: .9;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.item {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 7px 8px;
  border: 1px solid rgba(255, 255, 255, .12);
  border-radius: 6px;
  cursor: pointer;
  color: #fff;
  font-size: 12px;
  text-align: left;
  background-color: rgba(255, 255, 255, .04);
  transition: background-color .2s ease, border-color .2s ease;

  svg {
    flex: none;
    opacity: .8;
  }

  &:hover {
    background-color: rgba(255, 255, 255, .12);
  }
}

.active {
  border-color: var(--color-primary-alpha-300);
  background-color: var(--color-primary-alpha-200);

  svg {
    opacity: 1;
  }
}

.label {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
