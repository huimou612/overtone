<template>
  <Teleport to="body" :disabled="embedded">
    <div
      v-if="visible"
      ref="hostRef"
      :class="embedded ? 'folia-viewer-host is-embedded' : 'folia-viewer-host'"
    />
  </Teleport>
</template>

<script setup lang="ts">
// Folia 视觉层的 Vue 壳（React 岛）。
//
// 两种形态共用这一份挂载逻辑：
//  · 独立模式（embedded=false）：Teleport 到 body，铺满视口，自带 Esc 兜底；
//  · 嵌入模式（embedded=true）：直接落在宿主容器的文档流里，作为「统一沉浸
//    歌词画面」的歌词区视觉层，不新开界面、不抢 Esc、不盖住宿主的顶栏/侧栏。
//
// 关键约束：host 默认 pointer-events:none，只有真正渲染出内容的 .folia-overlay
// 才恢复交互；React 树外包 ErrorBoundary；挂载后若 host 仍是空的，自动收回，
// 避免留下一个吃掉点击的空壳（这正是之前「点了按钮界面没反应」的根因）。
import { ref, watch, onBeforeUnmount, nextTick, onMounted } from 'vue'
import { createRoot, type Root } from 'react-dom/client'
import { createElement } from 'react'
import FoliaStage from '@renderer/folia/stage/FoliaStage'
import FoliaErrorBoundary from '@renderer/folia/stage/FoliaErrorBoundary'
import { setFoliaVisualOn } from '@renderer/store/player/action'

const props = defineProps<{
  visible?: boolean
  embedded?: boolean
}>()

const emit = defineEmits<{ close: [] }>()

const hostRef = ref<HTMLElement | null>(null)
let root: Root | null = null
let watchdog: ReturnType<typeof setTimeout> | null = null

const close = () => {
  setFoliaVisualOn(false)
  emit('close')
}

const mount = async() => {
  await nextTick()
  if (!hostRef.value || root) return
  root = createRoot(hostRef.value)
  root.render(createElement(FoliaErrorBoundary, {
    onClose: close,
  }, createElement(FoliaStage, {
    onClose: close,
    embedded: props.embedded,
  })))

  watchdog = setTimeout(() => {
    const host = hostRef.value
    if (host && !host.querySelector('.folia-overlay')) {
      console.warn('[Folia] 视觉层未渲染出内容，自动关闭以免遮挡界面')
      close()
    }
  }, 4000)
}

const unmount = () => {
  if (watchdog) { clearTimeout(watchdog); watchdog = null }
  root?.unmount()
  root = null
}

const onKeydown = (event: KeyboardEvent) => {
  // 嵌入模式下 Esc 由宿主画面统一处理（先收面板、再退出画面）
  if (event.key === 'Escape' && !props.embedded && props.visible) close()
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) void mount()
    else unmount()
  },
  { immediate: true },
)

onMounted(() => { window.addEventListener('keydown', onKeydown) })
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  unmount()
})
</script>

<style>
.folia-viewer-host {
  position: fixed;
  inset: 0;
  z-index: 3000;
  /* 空壳绝不拦截点击；只有真正的覆盖层恢复交互 */
  pointer-events: none;
}
.folia-viewer-host .folia-overlay {
  pointer-events: auto;
}

/* ── 嵌入形态：只占宿主（歌词区）的范围，背景交给宿主的封面模糊层 ── */
.folia-viewer-host.is-embedded {
  position: absolute;
  inset: 0;
  z-index: 1;
  overflow: hidden;
  border-radius: 12px;
}
.folia-viewer-host.is-embedded .folia-overlay,
.folia-viewer-host.is-embedded .lab-folia {
  position: absolute !important;
  inset: 0;
  z-index: auto !important;
  background-color: transparent !important;
  pointer-events: none;
}
.folia-viewer-host.is-embedded .lab-folia-stage {
  position: absolute;
  inset: 0;
}
/* 错误兜底卡片需要能点「关闭」 */
.folia-viewer-host.is-embedded .folia-fallback {
  pointer-events: auto;
  background: rgba(12, 12, 16, 0.82);
}

.folia-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(12, 12, 16, 0.92);
  color: #ececf1;
}
.folia-fallback-card {
  max-width: 460px;
  padding: 28px 32px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 16px;
  background: rgba(28, 28, 36, 0.95);
  font-family: 'Inter', system-ui, "PingFang SC", "Microsoft YaHei", sans-serif;
}
.folia-fallback-card h2 { margin: 0 0 12px; font-size: 18px; }
.folia-fallback-card p { margin: 0 0 14px; font-size: 13px; line-height: 1.7; opacity: 0.82; }
.folia-fallback-card pre {
  margin: 0 0 18px;
  padding: 10px;
  max-height: 120px;
  overflow: auto;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.35);
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-all;
}
.folia-fallback-actions { display: flex; gap: 10px; }
.folia-fallback-actions button {
  flex: 1;
  padding: 9px 14px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.1);
  color: inherit;
  font-size: 13px;
  cursor: pointer;
}
.folia-fallback-actions button:hover { background: rgba(255, 255, 255, 0.2); }
</style>
