<template>
  <div v-show="!isFullscreen" ref="dom_btns" :class="$style.control">
    <button type="button" :class="[$style.btn, $style.min]" :aria-label="$t('min')" ignore-tip :title="$t('min')" @click="minWindow">
      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="60%" viewBox="0 0 24 24" space="preserve">
        <use xlink:href="#icon-window-minimize-2" />
      </svg>
    </button>
    <button type="button" :class="[$style.btn, $style.max]" :aria-label="isMaximized ? $t('restore') : $t('maximize')" ignore-tip :title="isMaximized ? $t('restore') : $t('maximize')" @click="maxWindowToggle">
      <svg v-if="isMaximized" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="60%" viewBox="0 0 24 24" space="preserve">
        <use xlink:href="#icon-window-restore-2" />
      </svg>
      <svg v-else version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="60%" viewBox="0 0 24 24" space="preserve">
        <use xlink:href="#icon-window-maximize-2" />
      </svg>
    </button>
    <button type="button" :class="[$style.btn, $style.close]" :aria-label="$t('close')" ignore-tip :title="$t('close')" @click="closeWindow">
      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="60%" viewBox="0 0 24 24" space="preserve">
        <use xlink:href="#icon-window-close-2" />
      </svg>
    </button>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from '@common/utils/vueTools'
import { minWindow, closeWindow, maxWindowToggle, onMaxStatus } from '@renderer/utils/ipc'
import { isFullscreen } from '@renderer/store'

const dom_btns = ref()
const isMaximized = ref(false)

let removeMaxStatusListener
onMounted(() => {
  removeMaxStatusListener = onMaxStatus(({ params }) => {
    isMaximized.value = params
  })
})
onBeforeUnmount(() => {
  removeMaxStatusListener?.()
})
</script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.control {
  display: flex;
  align-self: flex-start;
  -webkit-app-region: no-drag;
  height: 30px;

  .btn {
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    width: 46px;
    height: 30px;
    background: none;
    border: none;
    outline: none;
    padding: 1px;
    cursor: pointer;
    color: var(--color-font-label);
    transition: background-color 0.2s ease-in-out;
    &:hover {
      &.min, &.max {
        background-color: var(--color-button-background-hover);
      }
      &.close {
        background-color: var(--color-btn-close);
      }
    }
  }
}

</style>
