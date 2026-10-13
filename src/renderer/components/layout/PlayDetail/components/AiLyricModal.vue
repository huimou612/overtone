<template>
  <!--
    teleport 必须是 #root 而不是 #view。
    这个对话框是由歌词菜单（LyricMenu，自身 teleport 到 #root）打开的，
    而播放详情层盖在 #view 之上 —— 挂到 #view 会被整个盖住，DOM 里有、屏幕上没有。
  -->
  <material-modal :show="modelValue" teleport="#root" width="80%" height="80%" @close="close">
    <main :class="$style.main">
      <h2>{{ $t('ai_lyric__title') }}</h2>

      <div :class="[$style.body, 'scroll']">
        <!-- 还没有歌词：直接说清楚，别让用户点半天 -->
        <div v-if="loaded && !lines.length" :class="$style.hint">{{ $t('ai_lyric__no_lyric') }}</div>

        <template v-else-if="loaded">
          <div :class="$style.hint">{{ $t('ai_lyric__lines', { count: lines.length }) }}</div>

          <div v-if="overLimit" :class="[$style.hint, $style.error]">
            {{ $t('ai_lyric__too_many_lines', { count: lines.length, max: maxLines }) }}
          </div>

          <template v-else>
            <!-- 处理方式 -->
            <div :class="$style.row">
              <span :class="$style.label">{{ $t('ai_lyric__mode') }}</span>
              <base-btn
                min
                :class="[$style.modeBtn, mode === 'auto' ? $style.modeActive : '']"
                @click="mode = 'auto'"
              >
                {{ $t('ai_lyric__mode_auto') }}
              </base-btn>
              <base-btn
                min
                :class="[$style.modeBtn, mode === 'manual' ? $style.modeActive : '']"
                @click="mode = 'manual'"
              >
                {{ $t('ai_lyric__mode_manual') }}
              </base-btn>
            </div>

            <!-- 自动：交给已配置的模型 -->
            <template v-if="mode === 'auto'">
              <div v-if="!hasCredential" :class="[$style.hint, $style.error]">
                {{ $t('ai_lyric__no_credential') }}
              </div>
              <div :class="$style.row">
                <base-btn min :disabled="busy || !hasCredential" @click="startAuto">{{ $t('ai_lyric__start') }}</base-btn>
                <span v-if="progressText" :class="$style.hint">{{ progressText }}</span>
              </div>
            </template>

            <!-- 手动：把提示词给用户，让他自己去问 -->
            <template v-else>
              <div :class="$style.hint">{{ $t('ai_lyric__manual_tip') }}</div>
              <textarea
                readonly
                :class="[$style.textarea, $style.textareaShort]"
                :value="manualPrompt"
              />
              <div :class="$style.row">
                <base-btn min :disabled="!manualPrompt" @click="copyPrompt">
                  {{ copied ? $t('ai_lyric__manual_copied') : $t('ai_lyric__manual_copy') }}
                </base-btn>
              </div>
              <div :class="$style.hint">{{ $t('ai_lyric__manual_input') }}</div>
              <textarea v-model="manualInput" :class="[$style.textarea, $style.textareaShort]" />
              <div :class="$style.row">
                <base-btn min :disabled="!manualInput.trim() || busy" @click="parseManual">
                  {{ $t('ai_lyric__manual_parse') }}
                </base-btn>
              </div>
            </template>

            <!-- 结果预览 -->
            <template v-if="boundaries">
              <div :class="$style.hint">{{ $t('ai_lyric__preview') }}</div>
              <div v-if="summary" :class="$style.hint">{{ summary }}</div>
              <div v-if="rejections.length" :class="[$style.hint, $style.error]">
                <div>{{ $t('ai_lyric__rejections') }}</div>
                <div v-for="(item, index) in rejections" :key="index">{{ item }}</div>
              </div>
              <div :class="[$style.preview, 'scroll']">
                <div v-for="(line, index) in previewLines" :key="index" :class="$style.previewLine">
                  <span :class="$style.previewIndex">{{ index + 1 }}</span>
                  <span :class="line.fromAi ? '' : $style.fallback">{{ line.display }}</span>
                </div>
              </div>
            </template>
          </template>
        </template>
      </div>

      <div :class="$style.footer">
        <div :class="[$style.hint, $style.grow, errorMessage ? $style.error : '']">{{ errorMessage }}</div>
        <base-btn min @click="close">{{ $t('ai_lyric__close') }}</base-btn>
        <base-btn min :disabled="!canApply" @click="apply">
          {{ busy ? $t('ai_lyric__applying') : $t('ai_lyric__apply') }}
        </base-btn>
      </div>
    </main>
  </material-modal>
</template>

<script>
// AI 逐字歌词对话框。
//
// 三步，与主进程的 IPC 契约严格对应：
//   1. ai_get_lyric_lines  → 拿到这首歌的行（含行首时间）
//   2. ai_segment_lyric    → 把行文本交给模型分词，进度走 ai_segment_progress
//      （没配密钥的用户走手动分支：ai_get_manual_prompt / ai_parse_manual_result）
//   3. ai_apply_lxlrc      → 构造成 lxlrc 写库，并把 lxlrc 带回来刷新播放器
//
// 本组件只负责界面与编排，构造与校验全在主进程（buildLxlrc 有自检）。
import { computed, onBeforeUnmount, ref, watch } from '@common/utils/vueTools'
import { clipboardWriteText } from '@common/utils/electron'
import { useI18n } from '@renderer/plugins/i18n'
import {
  applyAiLxlrc,
  getAiLyricLines,
  getAiManualPrompt,
  getAiStatus,
  onAiSegmentProgress,
  parseAiManualResult,
  segmentAiLyric,
} from '@renderer/utils/ipc'

const describeError = error => (error instanceof Error ? error.message : String(error))

export default {
  name: 'AiLyricModal',
  props: {
    modelValue: {
      type: Boolean,
      default: false,
    },
    musicInfo: {
      type: Object,
      default: null,
    },
  },
  emits: ['update:modelValue', 'updateLyric'],
  setup(props, { emit }) {
    const t = useI18n()

    const loaded = ref(false)
    const lines = ref([])
    const source = ref('none')
    const maxLines = ref(400)
    const mode = ref('auto')
    const busy = ref(false)
    const errorMessage = ref('')
    const progress = ref(null)
    const boundaries = ref(null)
    const stats = ref(null)
    const rejections = ref([])
    const manualPrompt = ref('')
    const manualInput = ref('')
    const copied = ref(false)
    // 默认当作已配置，避免首帧就把按钮灰掉；load() 拿到真实状态后覆盖
    const hasCredential = ref(true)

    const musicId = computed(() => props.musicInfo?.id ?? '')
    const texts = computed(() => lines.value.map(line => line.text))
    const overLimit = computed(() => lines.value.length > maxLines.value)
    const canApply = computed(() => Boolean(boundaries.value) && !busy.value && !overLimit.value)

    const progressText = computed(() => {
      const current = progress.value
      if (!current) return ''
      if (current.phase === 'batch-failed') return current.message ?? ''
      return t('ai_lyric__progress', {
        batch: current.batch ?? 0,
        batchCount: current.batchCount ?? 0,
        processed: current.processed ?? 0,
        total: current.total ?? texts.value.length,
      })
    })

    const summary = computed(() => {
      if (!stats.value) return ''
      const matched = stats.value.matched
      const total = stats.value.total
      return t('ai_lyric__done', { matched, total, fallback: Math.max(0, total - matched) })
    })

    /**
     * 预览。模型给不出边界的行（null）会走构建阶段的字数权重兜底，
     * 这里用浅色标出来 —— 让用户在写库之前就知道哪些行不是模型切的。
     */
    const previewLines = computed(() => {
      const rows = boundaries.value
      if (!Array.isArray(rows)) return []
      return lines.value.map((line, index) => {
        const words = rows[index]
        if (Array.isArray(words) && words.length) {
          return { display: words.join(' | '), fromAi: true }
        }
        return { display: line.text, fromAi: false }
      })
    })

    const reset = () => {
      loaded.value = false
      lines.value = []
      source.value = 'none'
      errorMessage.value = ''
      progress.value = null
      boundaries.value = null
      stats.value = null
      rejections.value = []
      manualPrompt.value = ''
      manualInput.value = ''
      copied.value = false
      hasCredential.value = true
    }

    const load = async() => {
      if (!musicId.value) {
        errorMessage.value = t('ai_lyric__no_lyric')
        loaded.value = true
        return
      }
      try {
        const result = await getAiLyricLines(musicId.value)
        lines.value = result.lines
        source.value = result.source
        maxLines.value = result.maxLines
        // 顺手看一眼密钥配没配：没配就别让用户白点一次「开始分词」
        const status = await getAiStatus()
        const credentialKey = status.provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY'
        hasCredential.value = Boolean(status.credentials[credentialKey])
      } catch (error) {
        errorMessage.value = describeError(error)
      } finally {
        loaded.value = true
      }
    }

    const loadManualPrompt = async() => {
      if (manualPrompt.value || !texts.value.length) return
      try {
        manualPrompt.value = await getAiManualPrompt(texts.value)
      } catch (error) {
        errorMessage.value = describeError(error)
      }
    }

    const startAuto = async() => {
      if (busy.value) return
      busy.value = true
      errorMessage.value = ''
      boundaries.value = null
      stats.value = null
      rejections.value = []
      progress.value = { phase: 'request', batch: 0, batchCount: 0, processed: 0, total: texts.value.length }
      try {
        const result = await segmentAiLyric(texts.value)
        boundaries.value = result.boundaries
        stats.value = result.stats
        rejections.value = result.rejections
      } catch (error) {
        errorMessage.value = describeError(error)
      } finally {
        busy.value = false
        progress.value = null
      }
    }

    const parseManual = async() => {
      if (busy.value) return
      busy.value = true
      errorMessage.value = ''
      try {
        const result = await parseAiManualResult(texts.value, manualInput.value)
        boundaries.value = result.boundaries
        rejections.value = result.rejections
        stats.value = null
      } catch (error) {
        errorMessage.value = describeError(error)
      } finally {
        busy.value = false
      }
    }

    const apply = async() => {
      if (!canApply.value) return
      busy.value = true
      errorMessage.value = ''
      try {
        const result = await applyAiLxlrc({
          musicId: musicId.value,
          lines: lines.value,
          boundaries: boundaries.value,
        })
        // 把新生成的 lxlrc 交给上层，播放器立刻就能出逐字效果
        emit('updateLyric', { lxlrc: result.lxlrc, message: result.message })
        close()
      } catch (error) {
        errorMessage.value = describeError(error)
      } finally {
        busy.value = false
      }
    }

    const copyPrompt = () => {
      if (!manualPrompt.value) return
      clipboardWriteText(manualPrompt.value)
      copied.value = true
    }

    const close = () => {
      emit('update:modelValue', false)
    }

    const unsubscribe = onAiSegmentProgress(({ params }) => {
      if (!props.modelValue) return
      progress.value = params
    })

    watch(() => props.modelValue, visible => {
      if (!visible) {
        reset()
        return
      }
      reset()
      void load()
    })

    watch([mode, lines], () => {
      if (mode.value !== 'manual') return
      void loadManualPrompt()
    })

    onBeforeUnmount(() => {
      unsubscribe()
    })

    return {
      loaded,
      lines,
      source,
      maxLines,
      mode,
      busy,
      errorMessage,
      progress,
      boundaries,
      stats,
      rejections,
      manualPrompt,
      manualInput,
      copied,
      hasCredential,
      overLimit,
      canApply,
      progressText,
      summary,
      previewLines,
      startAuto,
      parseManual,
      apply,
      copyPrompt,
      close,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.main {
  flex: auto;
  display: flex;
  flex-flow: column nowrap;
  min-height: 0;
  overflow: hidden;
}

h2 {
  flex: none;
  margin: 20px;
  font-size: 16px;
  color: var(--color-font);
  line-height: 1.3;
  text-align: center;
}

.body {
  flex: auto;
  min-height: 0;
  padding: 0 15px;
  overflow-y: auto;
}

.row {
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
}

.label {
  color: var(--color-font-label);
}

.modeBtn {
  min-width: 0;
}
// 选中态用主题自带的一对变量（浅底 + 深色主色字）。
// 别用 background-color: var(--color-primary) 配 --color-button-font-selected：
// 后者在浅色主题下就是主色系，绿底绿字等于文字消失。
.modeBtn.modeActive {
  background-color: var(--color-button-background-selected);
  color: var(--color-button-font-selected);
  cursor: default;
}

.hint {
  padding: 3px 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--color-550);
  white-space: pre-wrap;
}
.error {
  color: var(--color-font-label);
}

.textarea {
  width: 100%;
  border: none;
  outline: none;
  border-radius: 4px;
  padding: 6px;
  box-sizing: border-box;
  font-family: inherit;
  font-size: 12px;
  line-height: 1.4;
  resize: none;
  color: var(--color-font);
  background-color: var(--color-primary-light-200-alpha-900);
}
.textareaShort {
  height: 110px;
}

.preview {
  max-height: 220px;
  overflow-y: auto;
  border-radius: 4px;
  padding: 6px;
  background-color: var(--color-primary-light-200-alpha-900);
}
.previewLine {
  display: flex;
  flex-flow: row nowrap;
  gap: 8px;
  padding: 2px 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--color-font);
}
.previewIndex {
  flex: none;
  width: 2.4em;
  text-align: right;
  color: var(--color-550);
  font-variant-numeric: tabular-nums;
}
.fallback {
  opacity: .55;
}

.footer {
  flex: none;
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  gap: 10px;
  padding: 15px;
}
.grow {
  flex: auto;
  min-width: 0;
}
</style>
