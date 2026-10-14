<template>
  <dt id="appearance">{{ $t('setting__appearance') }}</dt>
  <dd class="gap-top">
    <div>
      <h3 id="appearance_mode">{{ $t('setting__appearance_mode') }}</h3>

      <div class="p gap-top">{{ $t('setting__appearance_mode_desc') }}</div>

      <div class="p gap-top">
        <base-selection
          :list="modeList"
          :model-value="appSetting['common.appMode']"
          item-key="id"
          item-name="label"
          @update:model-value="updateSetting({ 'common.appMode': $event })"
        />
        <div class="p small">{{ modeTip }}</div>
      </div>
    </div>

    <div>
      <h3 id="appearance_cover">{{ $t('setting__appearance_cover') }}</h3>

      <div class="p gap-top">{{ $t('setting__appearance_cover_desc') }}</div>

      <div class="p gap-top">
        <base-checkbox
          id="setting_cover_color"
          :model-value="appSetting['common.coverColor']"
          :label="$t('setting__appearance_cover_enable')"
          @update:model-value="updateSetting({ 'common.coverColor': $event })"
        />
      </div>

      <div class="p small gap-top">{{ $t('setting__appearance_cover_tip') }}</div>
    </div>

    <div>
      <h3 id="appearance_splash">{{ $t('setting__appearance_splash') }}</h3>

      <div class="p gap-top">{{ $t('setting__appearance_splash_desc') }}</div>

      <div class="p gap-top">
        <base-checkbox
          id="setting_splash_enable"
          :model-value="appSetting['common.splashEnable']"
          :label="$t('setting__appearance_splash_enable')"
          @update:model-value="updateSetting({ 'common.splashEnable': $event })"
        />
      </div>

      <div class="p gap-top">
        <div class="p small">{{ $t('setting__appearance_splash_image') }}</div>
        <div :class="$style.row">
          <span :class="[$style.value, $style.ellipsis]" :title="appSetting['common.splashImage'] || ''">{{ imageLabel }}</span>
          <base-btn min @click="handlePickImage">{{ $t('setting__appearance_splash_image_pick') }}</base-btn>
          <base-btn v-if="appSetting['common.splashImage']" min @click="handleClearImage">
            {{ $t('setting__appearance_splash_image_clear') }}
          </base-btn>
        </div>
        <div class="p small">{{ $t('setting__appearance_splash_image_tip') }}</div>
      </div>

      <div class="p gap-top">
        <div class="p small">{{ $t('setting__appearance_splash_title') }}</div>
        <base-input
          :class="$style.input"
          :model-value="titleInput"
          :placeholder="$t('setting__appearance_splash_title_placeholder')"
          @update:model-value="handleTitleInput"
        />
      </div>

      <div class="p gap-top">
        <div class="p small">{{ $t('setting__appearance_splash_min') }}</div>
        <base-selection
          :list="durationList"
          :model-value="appSetting['common.splashMinMs']"
          item-key="id"
          item-name="label"
          @update:model-value="updateSetting({ 'common.splashMinMs': $event })"
        />
        <div class="p small">{{ $t('setting__appearance_splash_min_tip') }}</div>
      </div>

      <div class="p small gap-top">{{ $t('setting__appearance_splash_tip') }}</div>
    </div>
  </dd>
</template>

<script>
import { computed, ref } from '@common/utils/vueTools'
import { debounce } from '@common/utils'
import { useI18n } from '@renderer/plugins/i18n'
import { showSelectDialog } from '@renderer/utils/ipc'
import { appSetting, updateSetting } from '@renderer/store/setting'

export default {
  name: 'SettingAppearance',
  setup() {
    const t = useI18n()

    // 标题走本地副本 + 防抖落盘：这是输入框，不能每敲一个字都写一次配置
    const titleInput = ref(appSetting['common.splashTitle'] ?? '')

    const imageLabel = computed(() => {
      const file = appSetting['common.splashImage']
      if (!file) return t('setting__appearance_splash_image_none')
      // pop() 的类型是 string | undefined，用 ?? 而不是 ||：后者会把空文件名也当成缺失
      return file.split(/[\\/]/).pop() ?? file
    })

    const durationList = computed(() => [
      { id: 800, label: t('setting__appearance_splash_sec', { n: '0.8' }) },
      { id: 1400, label: t('setting__appearance_splash_sec', { n: '1.4' }) },
      { id: 2000, label: t('setting__appearance_splash_sec', { n: '2' }) },
      { id: 3000, label: t('setting__appearance_splash_sec', { n: '3' }) },
    ])

    const modeList = computed(() => [
      { id: 'classic', label: t('setting__appearance_mode_classic') },
      { id: 'personal', label: t('setting__appearance_mode_personal') },
    ])

    // 提示跟着当前选择走：这两档的差别不在功能上，只在形态上，必须写清楚，
    // 否则用户切过去发现「界面变了但功能没少」会以为出了 bug
    const modeTip = computed(() => (
      appSetting['common.appMode'] == 'personal'
        ? t('setting__appearance_mode_tip_personal')
        : t('setting__appearance_mode_tip_classic')
    ))

    const handlePickImage = async() => {
      const result = await showSelectDialog({
        title: t('setting__appearance_splash_image_pick'),
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] }],
      })
      if (result.canceled || !result.filePaths.length) return
      // 只改图片，不动开关：用户可能先挑图再决定要不要开
      updateSetting({ 'common.splashImage': result.filePaths[0] })
    }

    const handleClearImage = () => {
      updateSetting({ 'common.splashImage': '' })
    }

    const persistTitle = debounce(value => {
      updateSetting({ 'common.splashTitle': value })
    }, 600)

    const handleTitleInput = value => {
      titleInput.value = value
      persistTitle(value)
    }

    return {
      appSetting,
      updateSetting,
      titleInput,
      imageLabel,
      durationList,
      modeList,
      modeTip,
      handlePickImage,
      handleClearImage,
      handleTitleInput,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.row {
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  gap: 10px;
}
.value {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--color-550);
}
.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.input {
  width: 100%;
  max-width: 24rem;
}
</style>
