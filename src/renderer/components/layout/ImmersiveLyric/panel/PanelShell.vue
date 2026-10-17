<template>
  <aside
    v-if="open"
    :class="$style.panel"
    role="complementary"
    :aria-label="$t('immersive_lyric__panel_title')"
    data-immersive-panel="open"
  >
    <div :class="$style.header">
      <span :class="$style.title">{{ $t('immersive_lyric__panel_title') }}</span>
      <div
        :class="$style.closeBtn"
        role="button"
        tabindex="0"
        :aria-label="$t('immersive_lyric__panel_close')"
        @click="$emit('close')"
      >
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" height="16px" viewBox="0 0 24 24" space="preserve">
          <use xlink:href="#icon-close" />
        </svg>
      </div>
    </div>
    <div :class="$style.body">
      <p :class="$style.placeholder">{{ $t('immersive_lyric__panel_placeholder') }}</p>
    </div>
  </aside>
</template>

<script>
/**
 * 沉浸式侧栏空壳（L1）
 *
 * 只做三件事：开关（`v-if`，关闭时**不渲染任何节点**，所以经典模式布局零影响）、
 * 明确的关闭按钮、可测试的 `data-immersive-panel` 钩子。内容留给 L2/L4 填。
 *
 * 打开时由 ImmersiveStage 给歌词区加右内边距让位（不是盖上去）。
 * 宽度必须与 ImmersiveStage.vue 里的 `@panel-width` 保持一致。
 */
export default {
  name: 'ImmersivePanelShell',
  props: {
    open: Boolean,
  },
  emits: ['close'],
}
</script>

<style lang="less" module>
// 与 ImmersiveStage.vue 的 @panel-width 保持一致（320px）
@panel-width: 320px;

.panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: @panel-width;
  z-index: 2;
  display: flex;
  flex-flow: column nowrap;
  box-sizing: border-box;
  color: #fff;
  background-color: rgba(0, 0, 0, .42);
  backdrop-filter: blur(18px);
  border-left: 1px solid rgba(255, 255, 255, .08);
  animation: immersivePanelIn .26s cubic-bezier(.22, .61, .36, 1) both;
}

@keyframes immersivePanelIn {
  from {
    opacity: 0;
    transform: translateX(18px);
  }

  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.header {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 12px 20px;
}

.title {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: .3px;
}

.closeBtn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 50%;
  opacity: .7;
  transition: opacity .2s ease, background-color .2s ease;

  &:hover {
    opacity: 1;
    background-color: rgba(255, 255, 255, .12);
  }
}

.body {
  flex: auto;
  min-height: 0;
  overflow: auto;
  padding: 4px 20px 20px;
}

.placeholder {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  opacity: .55;
}

// 减少动态效果：面板直接出现，不做位移与淡入
@media (prefers-reduced-motion: reduce) {
  .panel {
    animation: none;
  }
}
</style>
