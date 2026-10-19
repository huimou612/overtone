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
      <button
        type="button"
        :class="$style.closeBtn"
        :aria-label="$t('immersive_lyric__panel_close')"
        @click="$emit('close')"
      >
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" height="16px" viewBox="0 0 24 24" space="preserve">
          <use xlink:href="#icon-close" />
        </svg>
      </button>
    </div>
    <div :class="$style.body">
      <slot>
        <p :class="$style.placeholder">{{ $t('immersive_lyric__panel_placeholder') }}</p>
      </slot>
    </div>
  </aside>
</template>

<script>
/**
 * 沉浸式侧栏外壳（L2）
 *
 * 仍然只负责「壳」：开关（v-if，关闭时**不渲染任何节点**）、标题、关闭按钮、
 * 可测试的 `data-immersive-panel` 钩子、以及内容区的滚动/伸缩容器。
 * 内容由调用方通过默认插槽传入（音量 / 播放模式 / 当前列表），
 * 本组件不碰任何播放器状态 —— 这样它可被单独复用与测试。
 *
 * 宽度：
 *  · 正常窗口 var(--ilus-panel-w)（ImmersiveStage 里定义，约 320px）；
 *  · 窄窗口由 ImmersiveStage 的媒体查询把该变量降级（288 / 264px），这里跟着变；
 *  · 极窄窗口（<= 760px）切「覆盖式」：不再是右侧一列，而是盖住歌词主区（不含底部
 *    播放栏 —— 面板的定位上下文是 .mainArea，footer 在它之外，永远不被遮挡）。
 *  ⚠️ 断点数值与 ImmersiveStage.vue 的媒体查询必须保持一致，改一处就要改另一处。
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
.panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: var(--ilus-panel-w, 320px);
  z-index: 2;
  display: flex;
  flex-flow: column nowrap;
  box-sizing: border-box;
  color: #fff;
  background-color: rgba(15, 18, 26, .78);
  backdrop-filter: blur(14px);
  border-left: 1px solid rgba(255, 255, 255, .08);
  animation: immersivePanelIn .26s cubic-bezier(.22, .61, .36, 1) both;
}

// 覆盖式：盖住歌词主区，但底部播放栏在 .mainArea 之外，仍然完整可用
@media (max-width: 760px) {
  .panel {
    left: 0;
    right: 0;
    width: auto;
    border-left: none;
    // 覆盖态必须足够不透明：底层歌词不能透出来干扰阅读
    background-color: rgba(13, 15, 20, .94);
  }
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
  padding: 0;
  border: none;
  cursor: pointer;
  color: #fff;
  border-radius: 50%;
  background-color: transparent;
  opacity: .7;
  transition: opacity .2s ease, background-color .2s ease;

  &:hover {
    opacity: 1;
    background-color: rgba(255, 255, 255, .12);
  }
}

// 内容区：整体不滚动，由各分区自行决定（队列列表在自己的容器里滚）
.body {
  flex: auto;
  min-height: 0;
  display: flex;
  flex-flow: column nowrap;
  padding: 0 20px 16px;
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
