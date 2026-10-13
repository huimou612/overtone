<template>
  <div :class="$style.view">
    <router-view v-slot="{ Component }">
      <!-- 只有个性模式才包过渡。经典模式保持上游的「直接切换」，
           不改变已经用惯的人的观感；两档的差别要落在明处，而不是到处都动一下。 -->
      <transition
        v-if="isPersonalMode"
        enter-active-class="animated-fast fadeIn"
        leave-active-class="animated-fast fadeOut"
      >
        <component :is="Component" class="view-container" />
      </transition>
      <component :is="Component" v-else class="view-container" />
    </router-view>
  </div>
</template>

<script setup>
import { isPersonalMode } from '@renderer/store'
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.view {
  position: relative;
  z-index: 1;
  > :global(.view-container) {
    position: absolute !important;
    left: 0;
    top: 0;
    height: 100%;
    width: 100%;
  }
  // background: #fff;
  // overflow: hidden;
}

</style>
