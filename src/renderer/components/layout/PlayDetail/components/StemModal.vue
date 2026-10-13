<template>
  <!--
    teleport 必须是 #root 而不是 #view。
    这个对话框是由歌词菜单（LyricMenu，自身 teleport 到 #root）打开的，
    而播放详情层盖在 #view 之上 —— 挂到 #view 会被整个盖住，DOM 里有、屏幕上没有。
  -->
  <material-modal :show="modelValue" teleport="#root" width="80%" height="80%" @close="close">
    <main :class="$style.main">
      <h2>{{ $t('stem__title') }}</h2>

      <div :class="[$style.body, 'scroll']">
        <div v-if="!loaded" :class="$style.hint">{{ $t('stem__checking') }}</div>

        <template v-else>
          <div :class="$style.hint">{{ $t('stem__desc') }}</div>

          <!-- 平台没有运行时构建：说清楚，而不是画一个点了不会动的下载按钮 -->
          <div v-if="!supported" :class="[$style.hint, $style.error]">{{ $t('stem__unsupported') }}</div>

          <!-- 模型目录要一直显示：下面那段「放到模型目录里」的话如果不说清是哪个目录，
               用户在镜像全挂的时候就只能猜 -->
          <div :class="$style.row">
            <span :class="$style.label">{{ $t('stem__models_dir') }}</span>
            <span :class="[$style.value, $style.ellipsis]">{{ modelsDir }}</span>
          </div>

          <!-- 模型与运行时是两次独立下载，所以两行分开报 -->
          <template v-if="supported">
            <div v-for="item in models" :key="item.name" :class="$style.modelRow">
              <span :class="$style.modelName">
                {{ item.name === 'runtime' ? $t('stem__model_runtime') : $t('stem__model_htdemucs') }}
              </span>
              <span :class="$style.modelSize">{{ formatBytes(item.bytes) }}</span>

              <template v-if="progressOf(item.name)">
                <span :class="$style.modelState">
                  {{ $t('stem__downloading', { percent: percentOf(item.name) }) }}
                </span>
                <base-btn min @click="cancelDownload(item.name)">{{ $t('stem__cancel') }}</base-btn>
              </template>
              <template v-else-if="item.path">
                <span :class="[$style.modelState, $style.ok]">{{ $t('stem__installed') }}</span>
              </template>
              <template v-else>
                <base-btn min :disabled="busy" @click="downloadModel(item.name)">{{ $t('stem__download') }}</base-btn>
              </template>
            </div>

            <!-- 镜像全挂了才展示网盘。空链接比没有链接更糟，所以后端没配就不显示这段 -->
            <template v-if="manualLinks.length && !ready">
              <div :class="$style.hint">{{ $t('stem__manual') }}</div>
              <div v-for="link in manualLinks" :key="link.url" :class="[$style.hint, $style.link]">
                {{ link.label }}：{{ link.url }}{{ link.code ? `（${$t('stem__manual_code')} ${link.code}）` : '' }}
              </div>
            </template>
          </template>

          <!-- 分离 -->
          <template v-if="ready">
            <div :class="$style.row">
              <span :class="$style.label">{{ $t('stem__song') }}</span>
              <span :class="$style.value">{{ songTitle || $t('stem__no_song') }}</span>
            </div>
            <div v-if="durationSec" :class="$style.row">
              <span :class="$style.label">{{ $t('stem__duration') }}</span>
              <span :class="$style.value">{{ formatDuration(durationSec) }}</span>
            </div>
            <div :class="$style.row">
              <span :class="$style.label">{{ $t('stem__output_dir') }}</span>
              <span :class="[$style.value, $style.ellipsis]">{{ outputDir }}</span>
            </div>

            <div :class="$style.row">
              <base-btn min :disabled="busy || !songTitle" @click="start">
                {{ phase === 'decoding' ? $t('stem__decoding') : $t('stem__start') }}
              </base-btn>
              <base-btn v-if="busy" min @click="abort">{{ $t('stem__abort') }}</base-btn>
              <span :class="$style.hint">{{ runningText }}</span>
            </div>

            <!-- 进度条：模型加载期间是 0，所以另外给一句说明，免得看起来像卡死 -->
            <div v-if="phase === 'separating'" :class="$style.bar">
              <div :class="$style.barInner" :style="{ width: `${Math.max(2, Math.round(jobProgress * 100))}%` }" />
            </div>
          </template>

          <!-- 结果 -->
          <template v-if="result">
            <div :class="$style.done">{{ $t('stem__done') }}</div>
            <div :class="$style.row">
              <span :class="$style.label">{{ $t('stem__vocals') }}</span>
              <span :class="[$style.value, $style.ellipsis]">{{ result.vocals }}</span>
            </div>
            <div :class="$style.row">
              <span :class="$style.label">{{ $t('stem__accompaniment') }}</span>
              <span :class="[$style.value, $style.ellipsis]">{{ result.accompaniment }}</span>
            </div>
            <div v-if="result.message" :class="$style.hint">{{ result.message }}</div>
            <div :class="$style.row">
              <base-btn min @click="openOutputDir">{{ $t('stem__open_dir') }}</base-btn>
            </div>
          </template>

          <div :class="$style.hint">{{ $t('stem__tip') }}</div>
          <div v-if="ready" :class="$style.row">
            <base-btn min :disabled="busy" @click="removeModels">{{ $t('stem__remove') }}</base-btn>
          </div>
        </template>
      </div>

      <div :class="$style.footer">
        <div :class="[$style.hint, $style.grow, errorMessage ? $style.error : '']">{{ errorMessage }}</div>
        <base-btn min @click="close">{{ $t('stem__close') }}</base-btn>
      </div>
    </main>
  </material-modal>
</template>

<script>
// 音源分离对话框。
//
// 链路是三段，和主进程/渲染层的分工严格对应（见 src/renderer/core/analysis/stems.ts）：
//   1. getAnalysisStatus          → 模型与运行时装没装，能不能跑
//   2. prepareCurrentSong()       → 渲染层自己解码当前歌曲并写 mix.in（85MB 不上 IPC）
//   3. runAnalysisJob({...})      → 主进程起 Python sidecar，进度走 analysis_job_progress
//
// 本组件只负责界面与编排：解码在 @renderer/core/analysis/stems，推理在 Python，
// 落盘与文件名在主进程。
import { computed, onBeforeUnmount, ref, watch } from '@common/utils/vueTools'
import { useI18n } from '@renderer/plugins/i18n'
import {
  abortAnalysisJob,
  cancelAnalysisDownload,
  downloadAnalysisModel,
  getAnalysisStatus,
  onAnalysisDownloadProgress,
  onAnalysisJobProgress,
  openDirInExplorer,
  removeAnalysisModels,
  runAnalysisJob,
} from '@renderer/utils/ipc'
import { currentSong, currentSongTitle, prepareCurrentSong } from '@renderer/core/analysis/stems'

const describeError = error => (error instanceof Error ? error.message : String(error))

const formatBytes = bytes => {
  if (!bytes) return ''
  const mb = bytes / 1048576
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(0)} MB`
}

const formatDuration = seconds => {
  const total = Math.round(seconds)
  const minutes = Math.floor(total / 60)
  return `${minutes}:${String(total % 60).padStart(2, '0')}`
}

export default {
  name: 'StemModal',
  props: {
    modelValue: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const t = useI18n()

    const loaded = ref(false)
    const supported = ref(true)
    const ready = ref(false)
    const models = ref([])
    const manualLinks = ref([])
    const modelsDir = ref('')
    const outputDir = ref('')
    const busy = ref(false)
    // 'idle' | 'decoding' | 'separating'
    const phase = ref('idle')
    const jobProgress = ref(0)
    const jobChunk = ref(0)
    const durationSec = ref(0)
    const result = ref(null)
    const errorMessage = ref('')
    // model name -> DownloadProgress
    const downloads = ref({})

    // 实时跟随当前播放歌曲，而不是打开时快照一次。
    // `playMusicInfo` 是 shallowReactive，赋 `.musicInfo` 会触发，所以在 computed 里读它
    // 就跟得上切歌（快照写法会让「对话框开着时切了歌」显示上一首的歌名与文件名）。
    const songTitle = computed(() => currentSongTitle())
    const hasSong = computed(() => Boolean(currentSong()))
    const runningText = computed(() => {
      if (phase.value === 'decoding') return t('stem__decoding_hint')
      if (phase.value !== 'separating') return ''
      // 第一个分块之前模型还在加载（冷启动约十秒），这时说「加载中」比显示 0% 诚实
      return jobChunk.value === 0
        ? t('stem__loading_model')
        : t('stem__separating', { percent: Math.round(jobProgress.value * 100) })
    })

    const progressOf = name => downloads.value[name] ?? null
    const percentOf = name => {
      const item = progressOf(name)
      if (!item?.total) return 0
      return Math.min(99, Math.round((item.received / item.total) * 100))
    }

    /**
     * 去掉一个下载项。
     *
     * 用重建对象而不是 `delete next[name]`：动态 delete 在这个仓库的 lint 规则里是错误，
     * 而这里本来也不需要原地改一个响应式对象。
     */
    const prune = name => {
      const next = {}
      for (const [key, value] of Object.entries(downloads.value)) {
        if (key !== name) next[key] = value
      }
      downloads.value = next
    }

    const reset = () => {
      loaded.value = false
      supported.value = true
      ready.value = false
      models.value = []
      manualLinks.value = []
      modelsDir.value = ''
      outputDir.value = ''
      busy.value = false
      phase.value = 'idle'
      jobProgress.value = 0
      jobChunk.value = 0
      durationSec.value = 0
      result.value = null
      errorMessage.value = ''
      downloads.value = {}
    }

    const load = async() => {
      try {
        const status = await getAnalysisStatus()
        models.value = status.models
        manualLinks.value = status.manual?.links ?? []
        modelsDir.value = status.modelsDir
        outputDir.value = status.outputDir
        ready.value = status.ready
        supported.value = status.models.some(item => item.supported)
      } catch (error) {
        errorMessage.value = describeError(error)
      } finally {
        loaded.value = true
      }
    }

    const downloadModel = async(name) => {
      if (busy.value) return
      busy.value = true
      errorMessage.value = ''
      try {
        const outcome = await downloadAnalysisModel(name)
        if (!outcome.ok) {
          errorMessage.value = t('stem__download_failed', { reasons: (outcome.skipped ?? []).join('；') })
        }
        await load()
      } catch (error) {
        errorMessage.value = describeError(error)
      } finally {
        busy.value = false
        prune(name)
      }
    }

    const cancelDownload = async(name) => {
      await cancelAnalysisDownload(name).catch(() => {})
    }

    const removeModels = async() => {
      if (busy.value) return
      busy.value = true
      try {
        const outcome = await removeAnalysisModels()
        errorMessage.value = t('stem__removed', { size: formatBytes(outcome.freed) })
        result.value = null
        await load()
      } catch (error) {
        errorMessage.value = describeError(error)
      } finally {
        busy.value = false
      }
    }

    /**
     * 当前作业的 id。
     *
     * 放在 setup 作用域而不是 start() 的闭包里，因为「中止」按钮在 start() 外面：
     * jobId 只在 start 的 await 期间有效，中止要能拿到它。
     */
    const currentJobId = ref('')

    const start = async() => {
      if (busy.value || !hasSong.value) return
      busy.value = true
      errorMessage.value = ''
      result.value = null
      jobProgress.value = 0
      jobChunk.value = 0
      phase.value = 'decoding'
      try {
        // 解码 + 写 mix.in 都在渲染层，几百毫秒到几秒（取决于歌长）
        const prepared = await prepareCurrentSong()
        currentJobId.value = prepared.jobId
        durationSec.value = prepared.durationSec
        phase.value = 'separating'
        const outcome = await runAnalysisJob({
          jobId: prepared.jobId,
          total: prepared.total,
          name: songTitle.value,
        })
        result.value = outcome
      } catch (error) {
        errorMessage.value = describeError(error)
        // 作业开出来了但没跑完时，主进程不会清临时目录（它只在 run_job 的 finally 里清），
        // 这一步得由这里收尾
        if (currentJobId.value) await abortAnalysisJob(currentJobId.value).catch(() => {})
      } finally {
        currentJobId.value = ''
        busy.value = false
        phase.value = 'idle'
      }
    }

    const abort = async() => {
      if (!currentJobId.value) return
      await abortAnalysisJob(currentJobId.value).catch(() => {})
    }

    const openOutputDir = () => {
      const target = result.value?.vocals ?? outputDir.value
      if (target) void openDirInExplorer(target)
    }

    const close = () => {
      emit('update:modelValue', false)
    }

    // 下载进度（字节级）
    const unsubscribeDownload = onAnalysisDownloadProgress(({ params }) => {
      if (!props.modelValue) return
      if (params.status === 'downloading') {
        downloads.value = { ...downloads.value, [params.name]: params }
        return
      }
      prune(params.name)
    })

    // 分离进度（分块）
    const unsubscribeJob = onAnalysisJobProgress(({ params }) => {
      if (!props.modelValue) return
      jobProgress.value = params.progress ?? 0
      jobChunk.value = params.chunk ?? 0
    })

    watch(() => props.modelValue, visible => {
      reset()
      if (visible) void load()
    })

    onBeforeUnmount(() => {
      unsubscribeDownload()
      unsubscribeJob()
    })

    return {
      loaded,
      supported,
      ready,
      models,
      manualLinks,
      modelsDir,
      outputDir,
      busy,
      phase,
      jobProgress,
      durationSec,
      result,
      errorMessage,
      songTitle,
      runningText,
      progressOf,
      percentOf,
      downloadModel,
      cancelDownload,
      removeModels,
      start,
      abort,
      openOutputDir,
      close,
      formatBytes,
      formatDuration,
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
  flex: none;
  min-width: 5em;
  color: var(--color-font-label);
}
.value {
  flex: auto;
  min-width: 0;
  color: var(--color-font);
}
.ellipsis {
  .mixin-ellipsis-1();
}

.modelRow {
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
}
.modelName {
  flex: none;
  min-width: 9em;
  color: var(--color-font);
}
.modelSize {
  flex: none;
  min-width: 4.5em;
  color: var(--color-550);
  font-variant-numeric: tabular-nums;
}
.modelState {
  flex: auto;
  min-width: 0;
  color: var(--color-550);
}
.ok {
  color: var(--color-font-label);
}

.bar {
  height: 6px;
  margin: 6px 0;
  border-radius: 3px;
  overflow: hidden;
  background-color: var(--color-primary-light-200-alpha-900);
}
.barInner {
  height: 100%;
  border-radius: 3px;
  background-color: var(--color-primary);
  transition: width .2s linear;
}

.done {
  padding: 8px 0;
  font-size: 13px;
  color: var(--color-font-label);
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
.link {
  user-select: text;
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
