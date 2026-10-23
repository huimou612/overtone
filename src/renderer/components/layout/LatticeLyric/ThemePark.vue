<template>
  <Teleport to="body">
    <div v-if="visible" :class="$style.mask" @click.self="$emit('close')">
      <div :class="$style.window" role="dialog" aria-label="主题公园">
        <!-- ── 标题栏 ── -->
        <header :class="$style.header">
          <div :class="$style.headerTitle">
            <span :class="$style.headerName">主题公园</span>
            <span :class="$style.headerSub">Theme Park</span>
          </div>
          <div :class="$style.headerActions">
            <button v-if="dirty" :class="$style.headerBtn" @click="resetDraft">放弃更改</button>
            <button :class="[$style.headerBtn, $style.headerBtnPrimary]" :disabled="!valid" @click="save">
              保存并应用
            </button>
            <button :class="$style.closeBtn" aria-label="关闭" @click="$emit('close')">
              <svg viewBox="0 0 24 24" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </header>

        <div :class="$style.body">
          <!-- ── 左：实时预览（真渲染器，循环播放示例歌词） ── -->
          <section :class="$style.preview">
            <div :class="$style.previewStage" :style="previewBg">
              <canvas-lyrics
                :lines="previewLines"
                :now-ms="previewNow"
                :active-index="previewActive"
                :style-name="previewStyle"
                :scale="draft.fontScale"
                :theme-base="draftBase"
                :theme-word="draftWord"
                :theme-glow="draftGlow"
                :class="$style.previewCanvas"
              />
              <div :class="$style.previewTag">预览 · {{ draft.name || '未命名主题' }}</div>
            </div>
            <!-- 已存主题列表 -->
            <div :class="$style.themeList">
              <div :class="$style.listHead">我的主题</div>
              <div v-if="!savedThemes.length" :class="$style.listEmpty">还没有保存的主题</div>
              <div v-else :class="$style.listScroll">
                <div
                  v-for="(t, i) in savedThemes" :key="i"
                  :class="[$style.listRow, i === activeSavedIndex && $style.listRowOn]"
                  @click="loadTheme(i)"
                >
                  <span :class="$style.listSwatch" :style="{ background: t.swatch }"></span>
                  <span :class="$style.listName">{{ t.name }}</span>
                  <button :class="$style.listDel" aria-label="删除" @click.stop="removeTheme(i)">✕</button>
                </div>
              </div>
            </div>
          </section>

          <!-- ── 右：编辑器（三个页签） ── -->
          <section :class="$style.editor">
            <div :class="$style.tabs">
              <button
                v-for="tab in tabs" :key="tab.key"
                :class="[$style.tab, tabKey === tab.key && $style.tabOn]"
                @click="tabKey = tab.key"
              >{{ tab.label }}</button>
            </div>

            <!-- ① 颜色 -->
            <div v-if="tabKey === 'colors'" :class="$style.pane">
              <p :class="$style.paneHint">背景定基调，主色是未唱的字，强调色做辉光。改完立即在左侧预览。</p>
              <div
                v-for="f in colorFields" :key="f.key"
                :class="$style.colorRow"
              >
                <div :class="$style.colorLabel">
                  <span :class="$style.colorDot" :style="{ background: draft[f.key] }"></span>
                  <div>
                    <div :class="$style.colorName">{{ f.label }}</div>
                    <div :class="$style.colorDesc">{{ f.desc }}</div>
                  </div>
                </div>
                <div :class="$style.colorCtrl">
                  <input
                    type="color" :value="draft[f.key]"
                    :class="$style.colorPicker"
                    @input="patch({ [f.key]: $event.target.value })"
                  >
                  <input
                    :value="draft[f.key]" :class="$style.colorHex" maxlength="7" spellcheck="false"
                    @change="patch({ [f.key]: normalizeHex($event.target.value, draft[f.key]) })"
                  >
                </div>
              </div>
              <div :class="$style.colorRow">
                <div :class="$style.colorLabel">
                  <span :class="$style.colorDot" :style="{ background: bgTintCss }"></span>
                  <div>
                    <div :class="$style.colorName">背景亮度</div>
                    <div :class="$style.colorDesc">背景深浅（背景色往黑压多少）</div>
                  </div>
                </div>
                <input
                  type="range" min="0" max="100" :value="draft.bgDepth"
                  :class="$style.range" @input="patch({ bgDepth: +$event.target.value })"
                >
              </div>
            </div>

            <!-- ② 详情 -->
            <div v-else-if="tabKey === 'details'" :class="$style.pane">
              <label :class="$style.field">
                <span :class="$style.fieldLabel">主题名称</span>
                <input
                  :value="draft.name" :class="$style.fieldInput" maxlength="32"
                  placeholder="给我的主题起个名字" @input="patch({ name: $event.target.value })"
                >
                <span :class="$style.fieldCount">{{ (draft.name || '').length }}/32</span>
              </label>
              <label :class="$style.field">
                <span :class="$style.fieldLabel">描述</span>
                <textarea
                  :value="draft.description" :class="$style.fieldArea" maxlength="120" rows="3"
                  placeholder="一句话描述这个主题的感觉" @input="patch({ description: $event.target.value })"
                ></textarea>
                <span :class="$style.fieldCount">{{ (draft.description || '').length }}/120</span>
              </label>
            </div>

            <!-- ③ 内容 -->
            <div v-else :class="$style.pane">
              <div :class="$style.field">
                <span :class="$style.fieldLabel">歌词字号 <b>{{ Math.round(draft.fontScale * 100) }}%</b></span>
                <input
                  type="range" min="70" max="160" :value="Math.round(draft.fontScale * 100)"
                  :class="$style.range" @input="patch({ fontScale: +$event.target.value / 100 })"
                >
              </div>
              <div :class="$style.field">
                <span :class="$style.fieldLabel">歌词字重 <b>{{ draft.fontWeight }}</b></span>
                <div :class="$style.segRow">
                  <button
                    v-for="w in [400, 500, 600, 700, 800]" :key="w"
                    :class="[$style.segBtn, draft.fontWeight === w && $style.segOn]"
                    @click="patch({ fontWeight: w })"
                  >{{ w }}</button>
                </div>
              </div>
              <div :class="$style.field">
                <span :class="$style.fieldLabel">预览样式</span>
                <div :class="$style.segRow">
                  <button
                    v-for="st in previewStyles" :key="st.key"
                    :class="[$style.segBtn, previewStyle === st.key && $style.segOn]"
                    @click="previewStyle = st.key"
                  >{{ st.label }}</button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script>
import { ref, computed, watch, onMounted, onBeforeUnmount } from '@common/utils/vueTools'
import CanvasLyrics from './CanvasLyrics.vue'

/**
 * 主题公园 —— 移植自 Folia src/components/modal/ThemePark.tsx
 *
 * Folia 的布局：左边实时可视化预览（ThemeParkPreview，带播放时钟），
 * 右边分页编辑器（ThemeParkColumn：colors / details / content / ai 四个页签）。
 *
 * 泛音版：
 *  · 预览直接挂 CanvasLyrics（同一个渲染器，所见即所得），
    用假歌词行 + 循环时钟驱动，扫光/辉光真实呈现
 *  · 颜色四件套对应 Folia 的 COLOR_FIELDS：backgroundColor / primaryColor /
    accentColor / secondaryColor（secondary 当前并入背景渐变）
 *  · 主题存 localStorage（lattice-themes），保存后通过 savedThemes 由父组件应用
 */
const LS_THEMES = 'lattice-themes'

const DEFAULT_DRAFT = {
  name: '',
  description: '',
  backgroundColor: '#141824',
  primaryColor: '#9aa8c8',
  accentColor: '#7c60dc',
  secondaryColor: '#3c3452',
  bgDepth: 55,
  fontScale: 1,
  fontWeight: 600,
}

// 假歌词：循环 14s，预览永远有事发生
const PREVIEW_LINES = [
  { time: 0, text: '夜色漫过窗台' },
  { time: 3500, text: 'Folia 主题公园' },
  { time: 7000, text: '让每句词都发光' },
  { time: 10500, text: '调出你的颜色' },
]

export default {
  name: 'ThemePark',
  components: { CanvasLyrics },
  props: {
    visible: Boolean,
    // 从当前 AI 主题/封面带入的初始颜色
    initial: { type: Object, default: null },
  },
  emits: ['close', 'apply'],
  setup(props, { emit }) {
    const draft = ref({ ...DEFAULT_DRAFT })
    const savedThemes = ref([])
    const activeSavedIndex = ref(-1)
    const tabKey = ref('colors')
    const previewStyle = ref('standard')
    let dirty = false

    const tabs = [
      { key: 'colors', label: '颜色' },
      { key: 'details', label: '详情' },
      { key: 'content', label: '内容' },
    ]
    const colorFields = [
      { key: 'backgroundColor', label: '背景色', desc: '沉浸式窗口的基调' },
      { key: 'primaryColor', label: '主色', desc: '未唱的字与背景渐变' },
      { key: 'accentColor', label: '强调色', desc: '辉光与高亮' },
      { key: 'secondaryColor', label: '次色', desc: '渐变的第二层' },
    ]
    const previewStyles = [
      { key: 'standard', label: '标准' },
      { key: 'flow', label: '流光' },
      { key: 'monet', label: '莫奈' },
    ]

    // ── 预览时钟：循环推进假播放进度 ──
    const previewNow = ref(0)
    const previewActive = computed(() => {
      const t = previewNow.value % 14000
      let idx = 0
      for (let i = 0; i < PREVIEW_LINES.length; i++) {
        if (t >= PREVIEW_LINES[i].time) idx = i
      }
      return idx
    })
    let clockRaf = 0
    let clockStart = 0
    const tickClock = () => {
      previewNow.value = performance.now() - clockStart
      clockRaf = requestAnimationFrame(tickClock)
    }

    watch(() => props.visible, v => {
      if (v) {
        clockStart = performance.now()
        if (!clockRaf) clockRaf = requestAnimationFrame(tickClock)
        if (props.initial) {
          draft.value = { ...DEFAULT_DRAFT, ...props.initial }
          dirty = true
        }
        try { savedThemes.value = JSON.parse(window.localStorage.getItem(LS_THEMES) ?? '[]') } catch (e) { savedThemes.value = [] }
      } else {
        cancelAnimationFrame(clockRaf)
        clockRaf = 0
      }
    }, { immediate: true })

    onMounted(() => { if (props.visible) { clockStart = performance.now(); clockRaf = requestAnimationFrame(tickClock) } })
    onBeforeUnmount(() => { cancelAnimationFrame(clockRaf) })

    const patch = p => {
      draft.value = { ...draft.value, ...p }
      dirty = true
    }
    const resetDraft = () => {
      draft.value = { ...DEFAULT_DRAFT }
      activeSavedIndex.value = -1
      dirty = false
    }

    // ── hex 工具 ──
    const normalizeHex = (v, fallback) => {
      const s = String(v).trim()
      if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase()
      if (/^#[0-9a-fA-F]{3}$/.test(s)) return '#' + s.slice(1).split('').map(c => c + c).join('').toLowerCase()
      return fallback
    }
    const hexToRgb = hex => {
      const n = parseInt(hex.slice(1), 16)
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
    }
    const rgba = (hex, a) => {
      const { r, g, b } = hexToRgb(hex)
      return `rgba(${r},${g},${b},${a})`
    }

    // 背景：主色/次色两层径向 + 背景色打底，深度压黑
    const bgTintCss = computed(() => {
      const d = draft.value.bgDepth / 100
      const bg = draft.value.backgroundColor
      return `linear-gradient(140deg, ${rgba(bg, 0.55 + d * 0.2)}, ${rgba(bg, Math.min(0.95, 0.75 + d * 0.2))})`
    })
    const previewBg = computed(() => ({
      background: `radial-gradient(80% 60% at 22% 18%, ${rgba(draft.value.primaryColor, 0.30)}, ${rgba(draft.value.primaryColor, 0)} 62%),` +
        `radial-gradient(70% 55% at 82% 78%, ${rgba(draft.value.secondaryColor, 0.26)}, ${rgba(draft.value.secondaryColor, 0)} 60%),` +
        `linear-gradient(140deg, ${rgba(draft.value.backgroundColor, 0.72)}, ${rgba(draft.value.backgroundColor, 0.9)})`,
    }))

    // 歌词颜色：主色提亮做未唱底、白做已唱、强调色做辉光
    const lighten = (hex, amount) => {
      const { r, g, b } = hexToRgb(hex)
      const f = c => Math.min(255, Math.round(c + (255 - c) * amount))
      return `rgb(${f(r)},${f(g)},${f(b)})`
    }
    const draftBase = computed(() => rgba(draft.value.primaryColor, 0.55))
    const draftWord = computed(() => lighten(draft.value.primaryColor, 0.7))
    const draftGlow = computed(() => draft.value.accentColor)

    const valid = computed(() => (draft.value.name || '').trim().length > 0)

    // ── 保存 / 列表 ──
    const save = () => {
      if (!valid.value) return
      const entry = {
        ...draft.value,
        swatch: `linear-gradient(135deg, ${draft.value.primaryColor}, ${draft.value.accentColor})`,
        savedAt: Date.now(),
      }
      const list = [...savedThemes.value]
      if (activeSavedIndex.value >= 0) list[activeSavedIndex.value] = entry
      else { list.push(entry); activeSavedIndex.value = list.length - 1 }
      savedThemes.value = list
      try { window.localStorage.setItem(LS_THEMES, JSON.stringify(list)) } catch (e) { /* 忽略 */ }
      dirty = false
      emit('apply', entry)
    }
    const loadTheme = i => {
      draft.value = { ...DEFAULT_DRAFT, ...savedThemes.value[i] }
      activeSavedIndex.value = i
      emit('apply', savedThemes.value[i])
    }
    const removeTheme = i => {
      const list = [...savedThemes.value]
      list.splice(i, 1)
      savedThemes.value = list
      if (activeSavedIndex.value === i) activeSavedIndex.value = -1
      else if (activeSavedIndex.value > i) activeSavedIndex.value--
      try { window.localStorage.setItem(LS_THEMES, JSON.stringify(list)) } catch (e) { /* 忽略 */ }
    }

    return {
      tabs,
      tabKey,
      colorFields,
      previewStyles,
      draft,
      patch,
      resetDraft,
      normalizeHex,
      previewBg,
      bgTintCss,
      draftBase,
      draftWord,
      draftGlow,
      previewLines: PREVIEW_LINES,
      previewNow,
      previewActive,
      previewStyle,
      valid,
      dirty,
      save,
      savedThemes,
      activeSavedIndex,
      loadTheme,
      removeTheme,
    }
  },
}
</script>

<style lang="less" module>
.mask {
  position: fixed;
  inset: 0;
  z-index: 10050;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(6, 8, 14, .62);
  backdrop-filter: blur(10px);
}

.window {
  width: min(960px, calc(100vw - 80px));
  height: min(620px, calc(100vh - 80px));
  display: flex;
  flex-flow: column nowrap;
  border-radius: 16px;
  overflow: hidden;
  background: rgba(20, 22, 32, .96);
  border: 1px solid rgba(255, 255, 255, .09);
  box-shadow: 0 32px 90px rgba(0, 0, 0, .6);
  color: #fff;
}

.header {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, .07);
}
.headerTitle { display: flex; align-items: baseline; gap: 10px; }
.headerName { font-size: 16px; font-weight: 700; letter-spacing: .5px; }
.headerSub { font-size: 11px; opacity: .4; letter-spacing: 1px; }
.headerActions { display: flex; align-items: center; gap: 8px; }
.headerBtn {
  padding: 7px 14px;
  border: 1px solid rgba(255, 255, 255, .16);
  border-radius: 9px;
  background: transparent;
  color: rgba(255, 255, 255, .8);
  font-size: 12px;
  cursor: pointer;
  transition: all .18s ease;
  &:hover { background: rgba(255, 255, 255, .1); }
  &:disabled { opacity: .35; cursor: not-allowed; }
}
.headerBtnPrimary {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #fff;
  font-weight: 600;
  &:hover:not(:disabled) { filter: brightness(1.12); }
}
.closeBtn {
  width: 30px; height: 30px;
  display: flex; align-items: center; justify-content: center;
  border: 0; border-radius: 8px;
  background: transparent; color: rgba(255,255,255,.7); cursor: pointer;
  &:hover { background: rgba(255,255,255,.14); color: #fff; }
}

.body {
  flex: auto;
  min-height: 0;
  display: flex;
}

// ── 左：预览 ──
.preview {
  flex: 1 1 52%;
  min-width: 0;
  display: flex;
  flex-flow: column nowrap;
  border-right: 1px solid rgba(255, 255, 255, .07);
}
.previewStage {
  position: relative;
  flex: auto;
  min-height: 0;
  overflow: hidden;
}
.previewCanvas { position: absolute; inset: 0; }
.previewTag {
  position: absolute;
  left: 14px;
  top: 12px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(0, 0, 0, .4);
  border: 1px solid rgba(255, 255, 255, .14);
  font-size: 11px;
  color: rgba(255, 255, 255, .75);
  pointer-events: none;
}

.themeList {
  flex: none;
  max-height: 180px;
  display: flex;
  flex-flow: column nowrap;
  border-top: 1px solid rgba(255, 255, 255, .07);
  padding: 10px 14px;
}
.listHead { font-size: 11px; opacity: .45; margin-bottom: 8px; letter-spacing: 1px; }
.listEmpty { font-size: 12px; opacity: .3; padding: 8px 0; }
.listScroll { overflow-y: auto; display: flex; flex-flow: column nowrap; gap: 4px; }
.listRow {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color .15s ease;
  &:hover { background: rgba(255, 255, 255, .08); }
}
.listRowOn { background: rgba(255, 255, 255, .12); }
.listSwatch { flex: none; width: 26px; height: 16px; border-radius: 4px; }
.listName { flex: auto; min-width: 0; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.listDel {
  flex: none; width: 22px; height: 22px;
  border: 0; border-radius: 6px;
  background: transparent; color: rgba(255,255,255,.4); font-size: 11px; cursor: pointer;
  &:hover { background: rgba(232, 17, 35, .5); color: #fff; }
}

// ── 右：编辑器 ──
.editor {
  flex: 1 1 48%;
  min-width: 0;
  display: flex;
  flex-flow: column nowrap;
}
.tabs {
  flex: none;
  display: flex;
  gap: 4px;
  padding: 12px 14px 0;
}
.tab {
  flex: 1 1 0;
  padding: 9px 0;
  border: 0;
  border-radius: 9px 9px 0 0;
  background: transparent;
  color: rgba(255, 255, 255, .5);
  font-size: 12.5px;
  cursor: pointer;
  transition: all .16s ease;
  &:hover { color: rgba(255, 255, 255, .8); }
}
.tabOn {
  color: #fff;
  background: rgba(255, 255, 255, .1);
  font-weight: 600;
}

.pane {
  flex: auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-flow: column nowrap;
  gap: 14px;
  padding: 16px 18px;
}
.paneHint { font-size: 11.5px; opacity: .45; line-height: 1.6; margin: 0; }

.colorRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, .045);
  border: 1px solid rgba(255, 255, 255, .06);
}
.colorLabel { display: flex; align-items: center; gap: 11px; min-width: 0; }
.colorDot {
  flex: none;
  width: 30px; height: 30px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, .25);
  box-shadow: 0 2px 10px rgba(0, 0, 0, .3);
}
.colorName { font-size: 13px; font-weight: 600; }
.colorDesc { font-size: 10.5px; opacity: .42; margin-top: 1px; }
.colorCtrl { display: flex; align-items: center; gap: 8px; flex: none; }
.colorPicker {
  width: 34px; height: 30px;
  padding: 0; border: 1px solid rgba(255,255,255,.2); border-radius: 8px;
  background: transparent; cursor: pointer;
  &::-webkit-color-swatch-wrapper { padding: 2px; }
  &::-webkit-color-swatch { border: 0; border-radius: 6px; }
}
.colorHex {
  width: 84px;
  padding: 6px 8px;
  border: 1px solid rgba(255,255,255,.14); border-radius: 8px;
  background: rgba(0,0,0,.3);
  color: #fff; font-size: 12px; font-family: monospace;
  outline: none;
  &:focus { border-color: var(--color-primary); }
}

.range {
  width: 150px;
  accent-color: var(--color-primary);
  cursor: pointer;
}

.field {
  display: flex;
  flex-flow: column nowrap;
  gap: 8px;
  position: relative;
}
.fieldLabel { font-size: 12px; opacity: .7; b { color: #fff; font-weight: 700; } }
.fieldInput, .fieldArea {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid rgba(255,255,255,.14);
  border-radius: 9px;
  background: rgba(0,0,0,.3);
  color: #fff; font-size: 13px;
  outline: none;
  resize: none;
  &:focus { border-color: var(--color-primary); }
}
.fieldCount { position: absolute; right: 2px; top: 0; font-size: 10px; opacity: .35; }

.segRow { display: flex; gap: 3px; padding: 3px; border-radius: 9px; background: rgba(255,255,255,.06); }
.segBtn {
  flex: 1 1 0;
  padding: 7px 0;
  border: 0; border-radius: 7px;
  background: transparent; color: rgba(255,255,255,.55);
  font-size: 12px; cursor: pointer;
  transition: all .15s ease;
  &:hover { color: #fff; }
}
.segOn { background: rgba(255,255,255,.2); color: #fff; font-weight: 600; }
</style>
