<template>
  <Teleport to="body">
    <div v-if="visible" :class="$style.mask" @click.self="$emit('close')">
      <div :class="$style.window" role="dialog" aria-label="歌词设置">
        <!-- ── 标题栏 ── -->
        <header :class="$style.header">
          <div :class="$style.headerTitle">
            <span :class="$style.headerName">歌词设置</span>
            <span :class="$style.headerSub">实时预览</span>
          </div>
          <div :class="$style.headerActions">
            <button v-if="dirty" :class="$style.headerBtn" @click="resetDraft">放弃更改</button>
            <button :class="[$style.headerBtn, $style.headerBtnPrimary]" @click="save">保存并应用</button>
            <button :class="$style.closeBtn" aria-label="关闭" @click="$emit('close')">
              <svg viewBox="0 0 24 24" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </header>

        <div :class="$style.body">
          <!-- ── 左：实时预览 ── -->
          <section :class="$style.preview">
            <div :class="$style.previewStage" :style="previewBg">
              <canvas-lyrics
                :lines="previewLines"
                :now-ms="previewNow"
                :active-index="previewActive"
                :style-name="draft.styleKey"
                :scale="draft.fontScale"
                :theme-base="draftBase"
                :theme-word="draftWord"
                :theme-glow="draftGlow"
                :subtitle-text="draft.subtitleOn ? previewSubtitle : ''"
                :subtitle-scale="draft.subtitleScale"
                :subtitle-color="draft.subtitleColor"
                :class="$style.previewCanvas"
              />
              <div :class="$style.previewTag">
                {{ styleLabel }} · {{ Math.round(draft.fontScale * 100) }}%
              </div>
              <div v-if="draft.modules.progress || draft.modules.time" :class="$style.miniBar">
                <span v-if="draft.modules.cover" :class="$style.miniCover"></span>
                <span v-if="draft.modules.progress" :class="$style.miniTrack">
                  <i :style="{ width: previewProgress + '%' }"></i>
                </span>
                <span v-if="draft.modules.time" :class="$style.miniTime">{{ previewTimeText }}</span>
              </div>
            </div>
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
                  <span :class="$style.listName">{{ t.name || '未命名' }}</span>
                  <button :class="$style.listDel" aria-label="删除" @click.stop="removeTheme(i)">✕</button>
                </div>
              </div>
            </div>
          </section>

          <!-- ── 右：侧栏 + 设置页 ── -->
          <section :class="$style.editor">
            <nav :class="$style.nav">
              <button
                v-for="s in sections" :key="s.key"
                :class="[$style.navItem, sectionKey === s.key && $style.navItemOn]"
                @click="sectionKey = s.key"
              >
                <span :class="$style.navDot"></span>
                <span>{{ s.label }}</span>
              </button>
            </nav>

            <div :class="$style.pane">
              <!-- ① 通用 -->
              <div v-if="sectionKey === 'general'" :class="$style.stack">
                <div :class="$style.groupTitle">排版</div>
                <div :class="$style.row">
                  <span :class="$style.rowLabel">字号 <b>{{ Math.round(draft.fontScale * 100) }}%</b></span>
                  <input type="range" min="70" max="160" :value="Math.round(draft.fontScale * 100)" :class="$style.range" @input="patch({ fontScale: +$event.target.value / 100 })">
                </div>
                <div :class="$style.row">
                  <span :class="$style.rowLabel">字重 <b>{{ draft.fontWeight }}</b></span>
                  <div :class="$style.seg">
                    <button v-for="w in [400, 500, 600, 700, 800]" :key="w" :class="[$style.segBtn, draft.fontWeight === w && $style.segOn]" @click="patch({ fontWeight: w })">{{ w }}</button>
                  </div>
                </div>
                <div :class="$style.row">
                  <span :class="$style.rowLabel">行距 <b>{{ draft.lineGap.toFixed(1) }}</b></span>
                  <input type="range" min="12" max="30" :value="Math.round(draft.lineGap * 10)" :class="$style.range" @input="patch({ lineGap: +$event.target.value / 10 })">
                </div>
              </div>

              <!-- ② 歌词样式 -->
              <div v-else-if="sectionKey === 'style'" :class="$style.stack">
                <div :class="$style.groupTitle">样式</div>
                <p :class="$style.hint">全部走 Canvas 渲染：字形纹理 + 逐字扫光 + 双层辉光。</p>
                <div :class="$style.styleGrid">
                  <button
                    v-for="st in lyricStyles" :key="st.key"
                    :class="[$style.styleCard, draft.styleKey === st.key && $style.styleCardOn]"
                    @click="patch({ styleKey: st.key })"
                  >
                    <span :class="$style.styleSample">Aa</span>
                    <span :class="$style.styleLabel">{{ st.label }}</span>
                    <span :class="$style.styleDesc">{{ st.desc }}</span>
                  </button>
                </div>
              </div>

              <!-- ③ 背景 -->
              <div v-else-if="sectionKey === 'bg'" :class="$style.stack">
                <div :class="$style.groupTitle">背景类型</div>
                <div :class="$style.seg">
                  <button v-for="t in bgTypes" :key="t.key" :class="[$style.segBtn, draft.bgType === t.key && $style.segOn]" @click="patch({ bgType: t.key })">{{ t.label }}</button>
                </div>

                <template v-if="draft.bgType === 'preset'">
                  <div :class="$style.groupTitle">预设</div>
                  <div :class="$style.presetGrid">
                    <button
                      v-for="p in bgPresets" :key="p.key"
                      :class="[$style.presetItem, draft.bgPreset === p.key && $style.presetOn]"
                      :style="{ background: p.swatch }"
                      @click="patch({ bgPreset: p.key })"
                    ><span :class="$style.presetName">{{ p.name }}</span></button>
                  </div>
                </template>

                <template v-else>
                  <div :class="$style.groupTitle">颜色</div>
                  <div v-for="f in colorFields" :key="f.key" :class="$style.colorRow">
                    <div :class="$style.colorLabel">
                      <span :class="$style.colorDot" :style="{ background: draft[f.key] }"></span>
                      <div>
                        <div :class="$style.colorName">{{ f.label }}</div>
                        <div :class="$style.colorDesc">{{ f.desc }}</div>
                      </div>
                    </div>
                    <div :class="$style.colorCtrl">
                      <input type="color" :value="draft[f.key]" :class="$style.colorPicker" @input="patch({ [f.key]: $event.target.value })">
                      <input :value="draft[f.key]" :class="$style.colorHex" maxlength="7" spellcheck="false" @change="patch({ [f.key]: normalizeHex($event.target.value, draft[f.key]) })">
                    </div>
                  </div>
                  <div :class="$style.row">
                    <span :class="$style.rowLabel">背景亮度</span>
                    <input type="range" min="0" max="100" :value="draft.bgDepth" :class="$style.range" @input="patch({ bgDepth: +$event.target.value })">
                  </div>
                </template>
              </div>

              <!-- ④ 字幕 -->
              <div v-else-if="sectionKey === 'subtitle'" :class="$style.stack">
                <div :class="$style.row">
                  <span :class="$style.rowLabel">显示字幕</span>
                  <button :class="[$style.switch, draft.subtitleOn && $style.switchOn]" @click="patch({ subtitleOn: !draft.subtitleOn })">
                    <i></i>
                  </button>
                </div>
                <template v-if="draft.subtitleOn">
                  <div :class="$style.groupTitle">内容</div>
                  <div :class="$style.seg">
                    <button v-for="m in subtitleModes" :key="m.key" :class="[$style.segBtn, draft.subtitleMode === m.key && $style.segOn]" @click="patch({ subtitleMode: m.key })">{{ m.label }}</button>
                  </div>
                  <div :class="$style.row">
                    <span :class="$style.rowLabel">字幕字号 <b>{{ Math.round(draft.subtitleScale * 100) }}%</b></span>
                    <input type="range" min="30" max="90" :value="Math.round(draft.subtitleScale * 100)" :class="$style.range" @input="patch({ subtitleScale: +$event.target.value / 100 })">
                  </div>
                  <div :class="$style.row">
                    <span :class="$style.rowLabel">字幕颜色</span>
                    <div :class="$style.colorCtrl">
                      <input type="color" :value="draft.subtitleColor" :class="$style.colorPicker" @input="patch({ subtitleColor: $event.target.value })">
                    </div>
                  </div>
                </template>
              </div>

              <!-- ⑤ 模块 -->
              <div v-else :class="$style.stack">
                <div :class="$style.groupTitle">显示的模块</div>
                <p :class="$style.hint">控制沉浸式窗口里出现哪些部件。</p>
                <div v-for="m in moduleList" :key="m.key" :class="$style.row">
                  <div :class="$style.rowLabelBlock">
                    <span :class="$style.rowLabel">{{ m.label }}</span>
                    <span :class="$style.rowDesc">{{ m.desc }}</span>
                  </div>
                  <button :class="[$style.switch, draft.modules[m.key] && $style.switchOn]" @click="toggleModule(m.key)">
                    <i></i>
                  </button>
                </div>
              </div>

              <div :class="$style.saveBox">
                <input :value="draft.name" :class="$style.nameInput" maxlength="32" placeholder="主题名称（保存用）" @input="patch({ name: $event.target.value })">
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
 * 歌词设置窗口 —— 布局对齐 Folia 设置弹窗（左实时预览 + 右侧栏分页）
 *
 * 五个分区：通用 / 歌词样式 / 背景 / 字幕 / 模块。
 * 预览挂的是真渲染器（CanvasLyrics），改任何一项立刻反映。
 */
const LS_THEMES = 'lattice-themes'

const PREVIEW_LINES = [
  { time: 0, text: '夜色漫过窗台', translation: 'Night spills over the sill' },
  { time: 3200, text: '让每句词都发光', translation: 'Let every line glow' },
  { time: 6400, text: '调出你的颜色', translation: 'Mix in your own colours' },
  { time: 9600, text: '泛音 · 歌词舞台', translation: 'Overtone · lyric stage' },
]

const DEFAULT_DRAFT = {
  name: '',
  backgroundColor: '#141824',
  primaryColor: '#9aa8c8',
  secondaryColor: '#3c3452',
  accentColor: '#7c60dc',
  bgDepth: 55,
  fontScale: 1,
  fontWeight: 600,
  lineGap: 2,
  styleKey: 'standard',
  bgType: 'preset',
  bgPreset: 'tide',
  subtitleOn: true,
  subtitleMode: 'translation',
  subtitleScale: 0.5,
  subtitleColor: '#b9c2d6',
  modules: { cover: true, progress: true, time: true, queue: true, volume: true },
}

export default {
  name: 'ThemePark',
  components: { CanvasLyrics },
  props: {
    visible: Boolean,
    initial: { type: Object, default: null },
    styleKey: { type: String, default: 'standard' },
    bgPresets: { type: Array, default: () => [] },
    bgPresetKey: { type: String, default: 'tide' },
    bgType: { type: String, default: 'preset' },
  },
  emits: ['close', 'apply'],
  setup(props, { emit }) {
    const draft = ref({ ...DEFAULT_DRAFT })
    const savedThemes = ref([])
    const activeSavedIndex = ref(-1)
    const sectionKey = ref('general')
    const dirty = ref(false)

    const sections = [
      { key: 'general', label: '通用' },
      { key: 'style', label: '歌词样式' },
      { key: 'bg', label: '背景' },
      { key: 'subtitle', label: '字幕' },
      { key: 'modules', label: '模块' },
    ]
    const lyricStyles = [
      { key: 'standard', label: '标准', desc: '平整排布，逐字扫光' },
      { key: 'flow', label: '流光', desc: '前沿带一条亮带' },
      { key: 'fade', label: '隐现', desc: '邻行几乎隐去' },
      { key: 'cloud', label: '云阶', desc: '逐行错落抬升' },
      { key: 'chorus', label: '群唱', desc: '左右虚影，紫调' },
      { key: 'monet', label: '莫奈', desc: '多层叠色，柔焦' },
      { key: 'particle', label: '粒子', desc: '散点聚合成字' },
    ]
    const bgTypes = [
      { key: 'preset', label: '预设' },
      { key: 'ai', label: 'AI主题' },
      { key: 'custom', label: '自定义' },
    ]
    const subtitleModes = [
      { key: 'translation', label: '翻译' },
      { key: 'romanization', label: '罗马音' },
    ]
    const moduleList = [
      { key: 'cover', label: '封面', desc: '底栏左侧显示专辑封面' },
      { key: 'progress', label: '进度条', desc: '底栏显示可拖动的播放进度' },
      { key: 'time', label: '时间', desc: '底栏显示 当前 / 总时长' },
      { key: 'queue', label: '播放队列', desc: '右侧面板的队列页签' },
      { key: 'volume', label: '音量', desc: '音效页里的音量滑杆' },
    ]
    const colorFields = [
      { key: 'backgroundColor', label: '背景色', desc: '窗口基调' },
      { key: 'primaryColor', label: '主色', desc: '未唱的字' },
      { key: 'accentColor', label: '强调色', desc: '辉光与高亮' },
      { key: 'secondaryColor', label: '次色', desc: '渐变第二层' },
    ]

    // ── 预览时钟 ──
    const previewNow = ref(0)
    let clockRaf = 0
    let clockStart = 0
    const tick = () => {
      previewNow.value = performance.now() - clockStart
      clockRaf = requestAnimationFrame(tick)
    }
    const previewActive = computed(() => {
      const t = previewNow.value % 12800
      let idx = 0
      for (let i = 0; i < PREVIEW_LINES.length; i++) if (t >= PREVIEW_LINES[i].time) idx = i
      return idx
    })
    const previewSubtitle = computed(() => {
      const line = PREVIEW_LINES[previewActive.value]
      if (!line) return ''
      return draft.value.subtitleMode === 'romanization' ? 'ye se man guo chuang tai' : line.translation
    })
    const previewProgress = computed(() => Math.round((previewNow.value % 12800) / 128))
    const previewTimeText = computed(() => {
      const t = Math.floor((previewNow.value % 12800) / 1000)
      return `0${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')} / 03:12`
    })

    watch(() => props.visible, v => {
      if (v) {
        clockStart = performance.now()
        if (!clockRaf) clockRaf = requestAnimationFrame(tick)
        draft.value = {
          ...DEFAULT_DRAFT,
          ...(props.initial || {}),
          styleKey: props.styleKey || (props.initial?.styleKey) || 'standard',
          bgType: props.bgType || 'preset',
          bgPreset: props.bgPresetKey || 'tide',
        }
        dirty.value = false
        try { savedThemes.value = JSON.parse(window.localStorage.getItem(LS_THEMES) ?? '[]') } catch (e) { savedThemes.value = [] }
      } else {
        cancelAnimationFrame(clockRaf)
        clockRaf = 0
      }
    }, { immediate: true })

    onMounted(() => { if (props.visible) { clockStart = performance.now(); clockRaf = requestAnimationFrame(tick) } })
    onBeforeUnmount(() => { cancelAnimationFrame(clockRaf) })

    const patch = p => { draft.value = { ...draft.value, ...p }; dirty.value = true }
    const toggleModule = k => {
      draft.value = { ...draft.value, modules: { ...draft.value.modules, [k]: !draft.value.modules[k] } }
      dirty.value = true
    }
    const resetDraft = () => { draft.value = { ...DEFAULT_DRAFT }; dirty.value = false; activeSavedIndex.value = -1 }

    // ── 颜色工具 ──
    const normalizeHex = (v, fallback) => {
      const s = String(v).trim()
      if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase()
      if (/^#[0-9a-fA-F]{3}$/.test(s)) return '#' + s.slice(1).split('').map(c => c + c).join('').toLowerCase()
      return fallback
    }
    const hexToRgb = hex => {
      const n = parseInt(String(hex).slice(1), 16)
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
    }
    const rgba = (hex, a) => {
      const { r, g, b } = hexToRgb(hex)
      return `rgba(${r},${g},${b},${a})`
    }
    const lighten = (hex, amount) => {
      const { r, g, b } = hexToRgb(hex)
      const f = c => Math.min(255, Math.round(c + (255 - c) * amount))
      return `rgb(${f(r)},${f(g)},${f(b)})`
    }

    const previewBg = computed(() => {
      if (draft.value.bgType === 'preset') {
        const p = props.bgPresets.find(x => x.key === draft.value.bgPreset)
        if (p) return { background: p.tint }
      }
      const d = draft.value.bgDepth / 100
      return {
        background: `radial-gradient(80% 60% at 22% 18%, ${rgba(draft.value.primaryColor, 0.28)}, ${rgba(draft.value.primaryColor, 0)} 62%),` +
          `radial-gradient(70% 55% at 82% 78%, ${rgba(draft.value.secondaryColor, 0.24)}, ${rgba(draft.value.secondaryColor, 0)} 60%),` +
          `linear-gradient(140deg, ${rgba(draft.value.backgroundColor, 0.6 + d * 0.15)}, ${rgba(draft.value.backgroundColor, Math.min(0.95, 0.8 + d * 0.15))})`,
      }
    })
    const draftBase = computed(() => (draft.value.bgType === 'preset' ? '' : rgba(draft.value.primaryColor, 0.55)))
    const draftWord = computed(() => (draft.value.bgType === 'preset' ? '' : lighten(draft.value.primaryColor, 0.7)))
    const draftGlow = computed(() => (draft.value.bgType === 'preset' ? '' : draft.value.accentColor))
    const styleLabel = computed(() => (lyricStyles.find(s => s.key === draft.value.styleKey) ?? lyricStyles[0]).label)

    // ── 保存 ──
    const save = () => {
      const entry = {
        ...draft.value,
        name: (draft.value.name || '').trim() || '我的歌词主题',
        swatch: `linear-gradient(135deg, ${draft.value.primaryColor}, ${draft.value.accentColor})`,
        savedAt: Date.now(),
      }
      const list = [...savedThemes.value]
      if (activeSavedIndex.value >= 0) list[activeSavedIndex.value] = entry
      else { list.push(entry); activeSavedIndex.value = list.length - 1 }
      savedThemes.value = list
      try { window.localStorage.setItem(LS_THEMES, JSON.stringify(list)) } catch (e) { /* 忽略 */ }
      dirty.value = false
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
      sections,
      sectionKey,
      lyricStyles,
      bgTypes,
      subtitleModes,
      moduleList,
      colorFields,
      draft,
      patch,
      toggleModule,
      resetDraft,
      dirty,
      normalizeHex,
      previewLines: PREVIEW_LINES,
      previewNow,
      previewActive,
      previewSubtitle,
      previewProgress,
      previewTimeText,
      previewBg,
      styleLabel,
      draftBase,
      draftWord,
      draftGlow,
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
  background: rgba(6, 8, 14, .66);
  backdrop-filter: blur(12px);
}
.window {
  width: min(1000px, calc(100vw - 72px));
  height: min(640px, calc(100vh - 72px));
  display: flex;
  flex-flow: column nowrap;
  border-radius: 16px;
  overflow: hidden;
  background: rgba(19, 21, 30, .97);
  border: 1px solid rgba(255, 255, 255, .09);
  box-shadow: 0 36px 100px rgba(0, 0, 0, .62);
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
.headerSub { font-size: 11px; opacity: .4; }
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
}
.headerBtnPrimary {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #fff;
  font-weight: 600;
  &:hover { filter: brightness(1.12); }
}
.closeBtn {
  width: 30px; height: 30px;
  display: flex; align-items: center; justify-content: center;
  border: 0; border-radius: 8px;
  background: transparent; color: rgba(255,255,255,.7); cursor: pointer;
  &:hover { background: rgba(255,255,255,.14); color: #fff; }
}

.body { flex: auto; min-height: 0; display: flex; }

.preview { flex: 1 1 50%; min-width: 0; display: flex; flex-flow: column nowrap; border-right: 1px solid rgba(255,255,255,.07); }
.previewStage { position: relative; flex: auto; min-height: 0; overflow: hidden; }
.previewCanvas { position: absolute; inset: 0; }
.previewTag {
  position: absolute; left: 14px; top: 12px;
  padding: 4px 10px; border-radius: 999px;
  background: rgba(0,0,0,.42); border: 1px solid rgba(255,255,255,.14);
  font-size: 11px; color: rgba(255,255,255,.78); pointer-events: none;
}
.miniBar {
  position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%);
  display: flex; align-items: center; gap: 10px;
  padding: 8px 14px; border-radius: 999px;
  background: rgba(0,0,0,.42); border: 1px solid rgba(255,255,255,.1);
  backdrop-filter: blur(8px);
}
.miniCover { width: 22px; height: 22px; border-radius: 5px; background: linear-gradient(135deg, #6a7fb8, #2b3350); }
.miniTrack { display: block; width: 120px; height: 3px; border-radius: 2px; background: rgba(255,255,255,.2); overflow: hidden;
  i { display: block; height: 100%; background: var(--color-primary); transition: width .2s linear; }
}
.miniTime { font-size: 10px; color: rgba(255,255,255,.6); }

.themeList { flex: none; max-height: 172px; display: flex; flex-flow: column nowrap; border-top: 1px solid rgba(255,255,255,.07); padding: 10px 14px; }
.listHead { font-size: 11px; opacity: .45; margin-bottom: 8px; letter-spacing: 1px; }
.listEmpty { font-size: 12px; opacity: .3; padding: 6px 0; }
.listScroll { overflow-y: auto; display: flex; flex-flow: column nowrap; gap: 4px; }
.listRow {
  display: flex; align-items: center; gap: 10px;
  padding: 7px 10px; border-radius: 8px; cursor: pointer;
  transition: background-color .15s ease;
  &:hover { background: rgba(255,255,255,.08); }
}
.listRowOn { background: rgba(255,255,255,.12); }
.listSwatch { flex: none; width: 26px; height: 16px; border-radius: 4px; }
.listName { flex: auto; min-width: 0; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.listDel {
  flex: none; width: 22px; height: 22px; border: 0; border-radius: 6px;
  background: transparent; color: rgba(255,255,255,.4); font-size: 11px; cursor: pointer;
  &:hover { background: rgba(232,17,35,.5); color: #fff; }
}

.editor { flex: 1 1 50%; min-width: 0; display: flex; }
.nav {
  flex: none;
  width: 132px;
  display: flex; flex-flow: column nowrap; gap: 2px;
  padding: 12px 8px;
  border-right: 1px solid rgba(255,255,255,.07);
}
.navItem {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 10px; border: 0; border-radius: 8px;
  background: transparent; color: rgba(255,255,255,.55);
  font-size: 12.5px; text-align: left; cursor: pointer;
  transition: all .15s ease;
  &:hover { color: #fff; background: rgba(255,255,255,.06); }
}
.navItemOn { color: #fff; background: rgba(255,255,255,.12); font-weight: 600; }
.navDot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; opacity: .5; }

.pane { flex: auto; min-width: 0; overflow-y: auto; padding: 16px 18px 20px; }
.stack { display: flex; flex-flow: column nowrap; gap: 12px; }
.groupTitle { font-size: 11px; letter-spacing: 1px; opacity: .42; margin-top: 4px; }
.hint { font-size: 11.5px; opacity: .42; line-height: 1.6; margin: 0; }

.row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 0; }
.rowLabel { font-size: 12.5px; opacity: .82; b { color: #fff; } }
.rowDesc { display: block; font-size: 10.5px; opacity: .4; margin-top: 2px; }
.rowLabelBlock { min-width: 0; }
.range { width: 150px; accent-color: var(--color-primary); cursor: pointer; }

.seg { display: flex; gap: 3px; padding: 3px; border-radius: 9px; background: rgba(255,255,255,.06); }
.segBtn {
  flex: 1 1 0; padding: 7px 10px; border: 0; border-radius: 7px;
  background: transparent; color: rgba(255,255,255,.55); font-size: 12px; cursor: pointer;
  transition: all .15s ease;
  &:hover { color: #fff; }
}
.segOn { background: rgba(255,255,255,.2); color: #fff; font-weight: 600; }

.switch {
  flex: none; width: 40px; height: 22px; padding: 2px;
  border: 0; border-radius: 999px;
  background: rgba(255,255,255,.16); cursor: pointer;
  transition: background-color .18s ease;
  i { display: block; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform .18s ease; }
}
.switchOn { background: var(--color-primary); i { transform: translateX(18px); } }

.styleGrid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.styleCard {
  display: flex; flex-flow: column nowrap; gap: 3px;
  padding: 11px 12px; border-radius: 10px; text-align: left;
  border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.045);
  color: #fff; cursor: pointer; transition: all .16s ease;
  &:hover { background: rgba(255,255,255,.1); }
}
.styleCardOn { border-color: var(--color-primary); background: rgba(255,255,255,.13); }
.styleSample { font-size: 17px; font-weight: 700; line-height: 1; }
.styleLabel { font-size: 12.5px; font-weight: 600; margin-top: 3px; }
.styleDesc { font-size: 10.5px; opacity: .42; }

.presetGrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.presetItem { position: relative; height: 50px; border: 1px solid transparent; border-radius: 8px; overflow: hidden; cursor: pointer; }
.presetOn { border-color: #fff; box-shadow: 0 0 0 1px #fff inset; }
.presetName { position: absolute; left: 6px; bottom: 4px; font-size: 10px; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,.7); }

.colorRow { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 11px; border-radius: 10px; background: rgba(255,255,255,.045); border: 1px solid rgba(255,255,255,.06); }
.colorLabel { display: flex; align-items: center; gap: 10px; min-width: 0; }
.colorDot { flex: none; width: 28px; height: 28px; border-radius: 8px; border: 1px solid rgba(255,255,255,.25); }
.colorName { font-size: 12.5px; font-weight: 600; }
.colorDesc { font-size: 10.5px; opacity: .42; }
.colorCtrl { display: flex; align-items: center; gap: 8px; flex: none; }
.colorPicker {
  width: 32px; height: 28px; padding: 0; border: 1px solid rgba(255,255,255,.2); border-radius: 8px;
  background: transparent; cursor: pointer;
  &::-webkit-color-swatch-wrapper { padding: 2px; }
  &::-webkit-color-swatch { border: 0; border-radius: 6px; }
}
.colorHex { width: 80px; padding: 6px 8px; border: 1px solid rgba(255,255,255,.14); border-radius: 8px; background: rgba(0,0,0,.3); color: #fff; font-size: 12px; font-family: monospace; outline: none;
  &:focus { border-color: var(--color-primary); }
}

.saveBox { margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,.07); }
.nameInput {
  width: 100%; padding: 9px 12px;
  border: 1px solid rgba(255,255,255,.14); border-radius: 9px;
  background: rgba(0,0,0,.3); color: #fff; font-size: 13px; outline: none;
  &:focus { border-color: var(--color-primary); }
}
</style>
