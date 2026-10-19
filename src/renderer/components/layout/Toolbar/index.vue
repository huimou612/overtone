<template>
  <div :class="[$style.toolbar, { [$style.fullscreen]: isFullscreen }]">
    <SearchInput />
    <ControlBtns />
  </div>
</template>

<script setup>
import { isFullscreen } from '@renderer/store'
import ControlBtns from './ControlBtns.vue'
import SearchInput from './SearchInput.vue'

</script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.toolbar {
  display: flex;
  height: @height-toolbar;
  align-items: center;
  justify-content: space-between;
  padding-left: 15px;
  -webkit-app-region: drag;
  z-index: 2;

  &.fullscreen {
    -webkit-app-region: no-drag;
  }
}

</style>
