<template>
  <div data-view="workbench" :class="$style.workbench">
    <div :class="$style.header">
      <h1 :class="$style.title">{{ $t('workbench__title') }}</h1>
      <p :class="$style.subtitle">{{ $t('workbench__subtitle') }}</p>
    </div>

    <div :class="[$style.body, 'scroll']">
      <!-- ==================== 当前歌曲 ====================
           两张能力卡都是「对当前这首歌」操作，所以先把这首歌摆出来。
           没有歌时这里是一句提示，卡片也跟着禁用 —— 而不是让用户点进去才发现没歌。 -->
      <section :class="$style.section">
        <h3 :class="$style.sectionTitle">{{ $t('workbench__current') }}</h3>
        <div :class="[$style.songCard, { [$style.songCardEmpty]: !hasSong }]">
          <template v-if="hasSong">
            <img v-if="musicInfo.pic" :class="$style.cover" :src="musicInfo.pic" alt="">
            <div v-else :class="[$style.cover, $style.coverFallback]">
              <svg viewBox="0 0 425.2 425.2" width="42%" height="42%"><use xlink:href="#icon-album" /></svg>
            </div>
            <div :class="$style.songMeta">
              <div :class="$style.songName" :title="musicInfo.name">{{ musicInfo.name }}</div>
              <div :class="$style.songSinger" :title="songSub">{{ songSub }}</div>
            </div>
            <span :class="[$style.chip, hasLxlrc ? $style.chipOk : $style.chipMute]">
              {{ hasLxlrc ? $t('workbench__lyric_done') : $t('workbench__lyric_none') }}
            </span>
          </template>
          <div v-else :class="$style.songEmpty">{{ $t('workbench__no_song') }}</div>
        </div>
      </section>

      <!-- ==================== 能力 ==================== -->
      <section :class="$style.section">
        <h3 :class="$style.sectionTitle">{{ $t('workbench__tools') }}</h3>
        <div :class="$style.tools">
          <button
            :class="$style.tool"
            :disabled="!hasSong"
            @click="openAiLyric"
          >
            <div :class="[$style.toolIcon, $style.iconAi]">
              <svg viewBox="0 0 24 24" width="22" height="22"><use xlink:href="#icon-text" /></svg>
            </div>
            <div :class="$style.toolBody">
              <div :class="$style.toolName">{{ $t('workbench__ai_lyric') }}</div>
              <p :class="$style.toolDesc">{{ $t('workbench__ai_lyric_desc') }}</p>
              <div :class="$style.toolChips">
                <span :class="[$style.chip, aiReady ? $style.chipOk : $style.chipWarn]">
                  {{ aiReady ? $t('workbench__ai_ready') : $t('workbench__ai_unready') }}
                </span>
              </div>
            </div>
            <div :class="$style.toolGo">
              <svg viewBox="0 0 24 24" width="16" height="16"><use xlink:href="#icon-right" /></svg>
            </div>
          </button>

          <button
            :class="$style.tool"
            :disabled="!hasSong"
            @click="openStems"
          >
            <div :class="[$style.toolIcon, $style.iconStem]">
              <svg viewBox="0 0 24 24" width="22" height="22"><use xlink:href="#icon-audio-wave" /></svg>
            </div>
            <div :class="$style.toolBody">
              <div :class="$style.toolName">{{ $t('workbench__stem') }}</div>
              <p :class="$style.toolDesc">{{ $t('workbench__stem_desc') }}</p>
              <div :class="$style.toolChips">
                <span :class="[$style.chip, stemOk ? $style.chipOk : $style.chipWarn]">{{ stemChipText }}</span>
              </div>
            </div>
            <div :class="$style.toolGo">
              <svg viewBox="0 0 24 24" width="16" height="16"><use xlink:href="#icon-right" /></svg>
            </div>
          </button>
        </div>
      </section>

      <!-- ==================== 数据位置 ====================
           模型目录在「镜像全挂」的时候是唯一出路（下载不了就得自己放进去），
           所以把它摆在明面上，而不是埋进分离对话框里。 -->
      <section v-if="paths.length" :class="$style.section">
        <h3 :class="$style.sectionTitle">{{ $t('workbench__paths') }}</h3>
        <div :class="$style.rows">
          <div v-for="row in paths" :key="row.label" :class="$style.row">
            <span :class="$style.rowLabel">{{ row.label }}</span>
            <span :class="[$style.rowValue, $style.ellipsis]" :title="row.value">{{ row.value }}</span>
            <button :class="$style.rowBtn" :title="$t('workbench__open_dir')" @click="openDir(row.value)">
              <svg viewBox="0 0 24 24" width="16" height="16"><use xlink:href="#icon-folder-open" /></svg>
            </button>
          </div>
        </div>
      </section>
    </div>

    <!-- 对话框自己 teleport 到 #root，所以从 #view 里的这个页面打开没有任何遮挡问题 -->
    <AiLyricModal v-model="aiVisible" :music-info="playMusicInfo.musicInfo" @update-lyric="handleAiLyricSaved" />
    <StemModal v-model="stemVisible" />
  </div>
</template>

<script>
import { computed, onMounted, ref } from '@common/utils/vueTools'
import { useI18n } from '@root/lang'
import { musicInfo, playMusicInfo } from '@renderer/store/player/state'
import { setMusicInfo } from '@renderer/store/player/action'
import { getAiStatus, getAnalysisStatus, openDirInExplorer } from '@renderer/utils/ipc'
import AiLyricModal from '@renderer/components/layout/PlayDetail/components/AiLyricModal.vue'
import StemModal from '@renderer/components/layout/PlayDetail/components/StemModal.vue'

export default {
  name: 'Workbench',
  components: {
    AiLyricModal,
    StemModal,
  },
  setup() {
    const t = useI18n()

    const aiVisible = ref(false)
    const stemVisible = ref(false)

    // 两个能力各有自己的前置条件（一个要 API Key，一个要模型权重），
    // 在卡片上先说清楚「点了会发生什么」，比让用户点进去看一屏红字好。
    const aiReady = ref(false)
    const stemReady = ref(false)
    const stemSupported = ref(true)
    const modelsDir = ref('')
    const outputDir = ref('')

    const hasSong = computed(() => Boolean(musicInfo.id))
    // 逐字歌词写在哪、读就写在这个字段上（applyAiLxlrc 只替换 lxlyric），
    // 所以「有没有」直接看它。
    const hasLxlrc = computed(() => Boolean(musicInfo.lxlrc))
    const songSub = computed(() => {
      const album = String(musicInfo.album ?? '').trim()
      return album ? `${musicInfo.singer} · ${album}` : musicInfo.singer
    })

    const stemOk = computed(() => stemSupported.value && stemReady.value)
    const stemChipText = computed(() => {
      if (!stemSupported.value) return t('workbench__stem_unsupported')
      return stemReady.value ? t('workbench__stem_ready') : t('workbench__stem_unready')
    })

    const paths = computed(() => {
      const rows = []
      if (modelsDir.value) rows.push({ label: t('workbench__models_dir'), value: modelsDir.value })
      if (outputDir.value) rows.push({ label: t('workbench__output_dir'), value: outputDir.value })
      return rows
    })

    // 每次进这个页面都重读一次状态：用户完全可能是「刚在设置里填完 Key / 刚在
    // 分离对话框里下完模型」然后切过来的，缓存住旧状态就等于骗人。
    const load = async() => {
      try {
        const status = await getAiStatus()
        const credentialKey = status.provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY'
        aiReady.value = Boolean(status.credentials[credentialKey])
      } catch (error) {
        aiReady.value = false
      }
      try {
        const status = await getAnalysisStatus()
        stemReady.value = status.ready
        stemSupported.value = status.models.some(item => item.supported)
        modelsDir.value = status.modelsDir ?? ''
        outputDir.value = status.outputDir ?? ''
      } catch (error) {
        // 主进程还没就绪时静默 —— 这不是用户需要知道的事
      }
    }

    const openAiLyric = () => {
      if (!hasSong.value) return
      aiVisible.value = true
    }
    const openStems = () => {
      if (!hasSong.value) return
      stemVisible.value = true
    }

    /**
     * 分词结果要让播放器立刻生效，而不是等下一次从库里读。
     *
     * 主进程写完库把 lxlrc 一并带回来（见 modules/ai 的 apply_lxlrc），这里
     * 把它灌进播放状态再广播 lyricUpdated —— LyricPlayer 正是监听这个事件重读
     * 歌词的。和歌曲切换时刷新歌词走的是同一条路。
     */
    const handleAiLyricSaved = ({ lxlrc }) => {
      if (!lxlrc) return
      setMusicInfo({ lxlrc })
      window.app_event.lyricUpdated()
    }

    const openDir = path => {
      if (path) void openDirInExplorer(path)
    }

    onMounted(load)

    return {
      musicInfo,
      playMusicInfo,
      aiVisible,
      stemVisible,
      aiReady,
      stemReady,
      stemSupported,
      stemOk,
      stemChipText,
      hasSong,
      hasLxlrc,
      songSub,
      paths,
      openAiLyric,
      openStems,
      handleAiLyricSaved,
      openDir,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.workbench {
  display: flex;
  flex-flow: column nowrap;
  height: 100%;
  box-sizing: border-box;
  padding: 22px 26px 0;
}

.header {
  flex: none;
  padding-bottom: 16px;
}
.title {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 600;
  color: var(--color-font);
}
.subtitle {
  margin: 0;
  font-size: 12px;
  color: var(--color-font-label);
}

.body {
  flex: auto;
  min-height: 0;
  padding-bottom: 26px;
}

.section {
  margin-bottom: 22px;
}
.sectionTitle {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: .06em;
  color: var(--color-font-label);
}

// ==================== 当前歌曲 ====================

.songCard {
  display: flex;
  align-items: center;
  padding: 12px 14px;
  border-radius: @radius-border + 2;
  background-color: var(--color-content-background);

  &.songCardEmpty {
    justify-content: center;
    padding: 26px 14px;
  }
}
.cover {
  flex: none;
  width: 56px;
  height: 56px;
  border-radius: @radius-border;
  object-fit: cover;
  background-color: rgba(0, 0, 0, .06);
}
.coverFallback {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-font-label);
}
.songMeta {
  flex: auto;
  min-width: 0;
  padding: 0 14px;
}
.songName {
  font-size: 15px;
  color: var(--color-font);
  .mixin-ellipsis-1();
}
.songSinger {
  margin-top: 5px;
  font-size: 12px;
  color: var(--color-font-label);
  .mixin-ellipsis-1();
}
.songEmpty {
  font-size: 13px;
  color: var(--color-font-label);
}

// ==================== 能力卡 ====================

.tools {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
}
.tool {
  display: flex;
  align-items: flex-start;
  padding: 16px;
  border: none;
  border-radius: @radius-border + 2;
  // 按钮默认不继承字体，不写这行标题会掉回浏览器的衬线体
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  outline: none;
  background-color: var(--color-content-background);
  transition: @transition-fast;
  transition-property: background-color, transform;

  &:not([disabled]):hover {
    background-color: var(--color-primary-background-hover);

    .toolGo {
      opacity: 1;
      transform: translateX(0);
    }
  }
  &:not([disabled]):active {
    transform: scale(.985);
  }
  // 「没有正在播放的歌」时整张卡禁用：不是隐藏，是明确地不能点
  &[disabled] {
    cursor: default;
    opacity: .5;
  }
}
.toolIcon {
  flex: none;
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 11px;
  color: #fff;
}
// 两个标识色写死不跟主题走：它们是「能力」的记号，换了主题也该还是这两块颜色
.iconAi {
  background-image: linear-gradient(135deg, #4F46E5, #8B7BF7);
}
.iconStem {
  background-image: linear-gradient(135deg, #0E9F9F, #22B8A6);
}
.toolBody {
  flex: auto;
  min-width: 0;
  padding-left: 13px;
}
.toolName {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-font);
}
.toolDesc {
  margin: 6px 0 10px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-font-label);
}
.toolChips {
  display: flex;
  flex-flow: row wrap;
  gap: 6px;
}
.toolGo {
  flex: none;
  align-self: center;
  padding-left: 8px;
  color: var(--color-primary);
  opacity: .35;
  transform: translateX(-3px);
  transition: @transition-fast;
  transition-property: opacity, transform;
}

// ==================== 徽章 ====================

.chip {
  display: inline-flex;
  align-items: center;
  height: 21px;
  padding: 0 9px;
  border-radius: 11px;
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
}
.chipOk {
  color: var(--color-primary);
  background-color: var(--color-primary-light-100-alpha-700);
}
.chipWarn {
  color: var(--color-font);
  background-color: var(--color-primary-light-400-alpha-200);
}
.chipMute {
  color: var(--color-font-label);
  background-color: rgba(0, 0, 0, .06);
}

// ==================== 数据位置 ====================

.rows {
  padding: 2px 12px;
  border-radius: @radius-border + 2;
  background-color: var(--color-content-background);
}
.row {
  display: flex;
  align-items: center;
  height: 40px;

  & + .row {
    border-top: 1px solid var(--color-list-header-border-bottom);
  }
}
.rowLabel {
  flex: none;
  width: 76px;
  font-size: 12px;
  color: var(--color-font-label);
}
.rowValue {
  flex: auto;
  min-width: 0;
  font-size: 12px;
  color: var(--color-font);
}
.rowBtn {
  flex: none;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 7px;
  outline: none;
  cursor: pointer;
  color: var(--color-font-label);
  background: none;
  transition: @transition-fast;
  transition-property: background-color, color;

  &:hover {
    color: var(--color-primary);
    background-color: var(--color-primary-background-hover);
  }
}
</style>
