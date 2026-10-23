<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="dom_root"
      :class="$style.root"
      :data-lyric-style="lyricStyle"
      :data-bg="bgPresetKey"
      tabindex="-1"
      data-view="lattice-stage"
    >
      <!-- ── 背景：封面模糊铺底 + 会变色的色调层 + canvas 2D 粒子 + 暗角 ── -->
      <div
        v-if="musicInfo.pic"
        :class="$style.bgCover"
        :style="{ backgroundImage: `url('${musicInfo.pic}')` }"
        aria-hidden="true"
      ></div>
      <div :class="$style.bgTint" :style="bgTintStyle" aria-hidden="true"></div>
      <canvas ref="canvas_ref" :class="$style.particles" aria-hidden="true"></canvas>
      <div :class="$style.vignette" aria-hidden="true"></div>

      <!-- 右上角窗口控制：默认隐藏，鼠标靠近右上角才淡入（歌词界面盖住了原生标题栏） -->
      <div
        :class="[$style.winZone, winCtrlOn && $style.winZoneOn]"
        @pointerenter="showWinCtrl"
        @pointerleave="hideWinCtrl"
      >
        <button :class="$style.winBtn" :aria-label="$t('min')" :title="$t('min')" @click="minWindow">
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" height="14px" viewBox="0 0 24 24" space="preserve">
            <use xlink:href="#icon-window-minimize" />
          </svg>
        </button>
        <button :class="$style.winBtn" :aria-label="$t('maximize')" :title="$t('maximize')" @click="maxWindowToggle">
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" height="14px" viewBox="0 0 24 24" space="preserve">
            <use xlink:href="#icon-window-maximize-2" />
          </svg>
        </button>
        <button :class="[$style.winBtn, $style.winClose]" :aria-label="$t('close')" :title="$t('close')" @click="closeWindow">
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" height="14px" viewBox="0 0 24 24" space="preserve">
            <use xlink:href="#icon-window-close" />
          </svg>
        </button>
      </div>

      <!-- 顶栏：返回 + 当前歌曲（拖动区） -->
      <header :class="$style.top">
        <button
          :class="$style.backBtn"
          :aria-label="$t('back')"
          :title="$t('back')"
          @click="handleClose"
          @pointerdown="handleBackPointerDown"
        >
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 0 24 24" space="preserve">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <!-- 只有这一块是窗口拖动区：整条顶栏若都设成 drag，右上角的按钮区会被系统拖动区吞掉鼠标事件（hover 不触发） -->
        <div :class="$style.dragArea">
          <div :class="$style.meta">
            <strong>{{ musicInfo.name || 'Lattice' }}</strong>
            <small v-if="musicInfo.singer">{{ musicInfo.singer }}</small>
          </div>
        </div>
      </header>

      <!-- 主区：居中歌词 + 右侧常驻面板 -->
      <div :class="$style.mainArea">
        <div :class="$style.lyricArea">
          <canvas-lyrics
            v-if="canvasMode && lyricLines.length"
            :lines="lyricLines"
            :now-ms="effectiveNowMs"
            :active-index="activeIndex"
            :style-name="lyricStyle"
            :scale="lyricScale"
            :theme-base="themeBaseNow"
            :theme-word="themeWordNow"
            :theme-glow="themeGlowNow"
            :subtitle-text="subtitleTextNow"
            :subtitle-scale="subtitleScale"
            :subtitle-color="subtitleColor"
            :class="$style.canvasLyrics"
          />
          <TransitionGroup
            v-else-if="visibleLines.length"
            tag="div"
            :enter-from-class="$style.enterFrom"
            :enter-active-class="$style.enterActive"
            :leave-active-class="$style.leaveActive"
            :leave-to-class="$style.leaveTo"
            :class="$style.lyricColumn"
            :style="{ '--lyric-scale': lyricScale }"
          >
            <div
              v-for="item in visibleLines"
              :key="`${keyPrefix}-${item.index}`"
              :class="[$style.line, $style['line_' + item.state]]"
              :data-state="item.state"
            >
              <lyric-line-view :line="item.line" :now-ms="effectiveNowMs" :fill="item.fill" />
            </div>
          </TransitionGroup>
          <div v-else :class="$style.empty">
            <div :class="$style.emptyTitle">{{ musicInfo.name || 'Lattice' }}</div>
            <div>{{ hasRawLyric ? '歌词解析失败' : $t('immersive_lyric__no_lyric') }}</div>
          </div>
        </div>

        <!-- ── 右侧常驻面板：封面 / 音效 / 播放列表 / 时间线 四个页签 ── -->
        <aside v-if="panelOpen" :class="$style.sidePanel" data-immersive-panel="open">
          <div :class="$style.posterCard">
            <img v-if="musicInfo.pic" :class="$style.posterImg" :src="musicInfo.pic" alt="" draggable="false">
            <div v-else :class="$style.posterFallback">{{ (musicInfo.name || '?').slice(0, 1) }}</div>
            <div :class="$style.posterName">{{ musicInfo.name }}</div>
          </div>

          <div :class="$style.iconRow">
            <button
              :class="[$style.tabBtn, { [$style.tabActive]: panelSection === 'cover' }]"
              aria-label="封面" title="封面"
              @click="panelSection = 'cover'"
            >
              <svg viewBox="0 0 24 24" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="4" />
                <circle cx="12" cy="12" r="3.2" />
              </svg>
            </button>
            <button
              :class="[$style.tabBtn, { [$style.tabActive]: panelSection === 'bg' }]"
              aria-label="背景" title="背景"
              @click="panelSection = 'bg'"
            >
              <svg viewBox="0 0 24 24" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="16" rx="3" />
                <path d="M3 15l5-5 4 4 3-3 6 6" />
                <circle cx="9" cy="9" r="1.4" />
              </svg>
            </button>
            <button
              :class="[$style.tabBtn, { [$style.tabActive]: panelSection === 'style' }]"
              aria-label="歌词样式" title="歌词样式"
              @click="panelSection = 'style'"
            >
              <svg viewBox="0 0 24 24" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                <path d="M5 6h14M5 12h9M5 18h12" />
              </svg>
            </button>
            <button
              :class="[$style.tabBtn, { [$style.tabActive]: panelSection === 'fx' }]"
              aria-label="音效" title="音效"
              @click="panelSection = 'fx'"
            >
              <svg viewBox="0 0 24 24" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                <path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" />
              </svg>
            </button>
            <button
              :class="[$style.tabBtn, { [$style.tabActive]: panelSection === 'queue' }]"
              aria-label="播放列表" title="播放列表"
              @click="panelSection = 'queue'"
            >
              <svg viewBox="0 0 24 24" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                <path d="M4 7h16M4 12h16M4 17h10" />
              </svg>
            </button>
          </div>

          <div :class="$style.panelBody">
            <!-- ① 封面：歌名 / 作者 / 专辑 -->
            <div v-if="panelSection === 'cover'" :class="$style.coverInfo">
              <div :class="$style.coverName">{{ musicInfo.name }}</div>
              <div :class="$style.coverArtist">{{ musicInfo.singer }}</div>
              <div v-if="musicInfo.album" :class="$style.coverAlbum">{{ musicInfo.album }}</div>
            </div>

            <!-- ①-B 背景类型：默认 / AI 主题 / 自定义 + 预设 -->
            <div v-if="panelSection === 'bg'" :class="$style.bgBox">
              <div :class="$style.segRow">
                <button
                  v-for="t in bgTypes" :key="t.key"
                  :class="[$style.segBtn, bgType === t.key && $style.segActive]"
                  @click="setBgType(t.key)"
                >{{ t.label }}</button>
              </div>
              <div v-if="bgType === 'custom'" :class="$style.tpEntry">
                <button :class="$style.tpOpenBtn" @click="openThemePark">
                  <svg viewBox="0 0 24 24" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
                  </svg>
                  <span>{{ customTheme ? '编辑我的主题' : '创建我的主题' }}</span>
                </button>
                <p v-if="customTheme" :class="$style.tpNow">当前：{{ customTheme.name }}</p>
                <p v-else :class="$style.tpNow">打开主题公园，调色并实时预览</p>
              </div>
              <div v-if="bgType !== 'custom'" :class="$style.presetHead">
                <span>{{ bgPresetName }}</span>
                <button
                  v-if="bgType === 'ai'"
                  :class="$style.shuffleBtn" aria-label="重新生成" title="重新生成"
                  @click="generateAiTheme"
                >{{ aiThemeLoading ? '…' : '⤨' }}</button>
                <button v-else :class="$style.shuffleBtn" aria-label="换一个" title="换一个" @click="shuffleBg">⤨</button>
              </div>
              <div :class="$style.presetGrid">
                <button
                  v-for="p in bgPresets" :key="p.key"
                  :class="[$style.presetItem, bgPresetKey === p.key && $style.presetActive]"
                  :style="{ background: p.swatch }"
                  :title="p.name"
                  @click="setBgPreset(p.key)"
                >
                  <span :class="$style.presetName">{{ p.name }}</span>
                </button>
              </div>
            </div>

            <!-- ①-C 歌词样式 -->
            <div v-else-if="panelSection === 'style'" :class="$style.styleBox">
              <div :class="$style.styleGrid">
                <button
                  v-for="st in lyricStyles" :key="st.key"
                  :class="[$style.styleItem, lyricStyle === st.key && $style.styleActive]"
                  @click="setLyricStyle(st.key)"
                >
                  <span :class="$style.styleSample" :data-sample="st.key">Aa</span>
                  <span :class="$style.styleName">{{ st.label }}</span>
                </button>
              </div>
              <div :class="$style.infoRow">
                <span :class="$style.infoLabel">字号</span>
                <div :class="$style.offsetCtrl">
                  <button :class="$style.offsetBtn" @click="nudgeScale(-1)">A−</button>
                  <button :class="$style.offsetValue">{{ Math.round(lyricScale * 100) }}%</button>
                  <button :class="$style.offsetBtn" @click="nudgeScale(1)">A+</button>
                </div>
              </div>
              <button :class="[$style.segBtn, canvasMode && $style.segActive]" @click="toggleCanvas">
                Canvas 渲染 {{ canvasMode ? '开' : '关' }}
              </button>
              <p :class="$style.styleHint">当前：{{ currentStyleLabel }}{{ canvasMode ? '（Canvas 管线）' : '（DOM 渲染）' }}</p>
            </div>

            <!-- ② 音效设置：直接调用播放器里的音效弹窗 + 音量 -->
            <div v-else-if="panelSection === 'fx'" :class="$style.fxBox">
              <button :class="$style.fxOpenBtn" @click="fxOpen = true">
                <svg viewBox="0 0 24 24" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                  <path d="M4 8h9M17 8h3M4 16h3M11 16h9" />
                  <circle cx="15" cy="8" r="2" />
                  <circle cx="9" cy="16" r="2" />
                </svg>
                <span>音效设置</span>
              </button>
              <p :class="$style.fxHint">环境混响 / 均衡器 / 音调升降 / 3D 环绕</p>
              <panel-volume />
              <div :class="$style.infoRow">
                <span :class="$style.infoLabel">歌词</span>
                <span :class="$style.infoValue">{{ lyricKindLabel }}</span>
              </div>
              <div :class="$style.offsetRow">
                <span :class="$style.infoLabel">时间轴偏移</span>
                <div :class="$style.offsetCtrl">
                  <button :class="$style.offsetBtn" aria-label="-100ms" @click="nudgeOffset(-100)">◀</button>
                  <button :class="$style.offsetValue" title="点击归零" @click="lyricOffset = 0">{{ lyricOffset }}ms</button>
                  <button :class="$style.offsetBtn" aria-label="+100ms" @click="nudgeOffset(100)">▶</button>
                </div>
              </div>
            </div>

            <!-- ③ 播放队列：标题 + 简洁行（歌名 / 歌手），当前曲高亮 -->
            <div v-else-if="panelSection === 'queue'" :class="$style.qWrap">
              <div :class="$style.qHead">
                <span :class="$style.qTitle">播放队列 <span :class="$style.qCount">({{ queueView.rows.length }})</span></span>
              </div>
              <div :class="$style.qList">
                <div v-if="queueView.isEmpty" :class="$style.qEmpty">当前列表还没有歌曲</div>
                <button
                  v-for="row in queueView.rows"
                  v-else
                  :key="row.rowKey"
                  :class="[$style.qRow, row.isCurrent && $style.qRowActive]"
                  @click="playQueueRow(row.index)"
                >
                  <span :class="$style.qName">{{ row.music.name }}</span>
                  <span :class="$style.qSinger">{{ row.music.singer }}</span>
                </button>
              </div>
            </div>

            <!-- ④ 时间线 -->
          </div>

          <!-- ✕ 只收起面板，不退出歌词界面 -->
          <button :class="$style.closeFab" :aria-label="$t('immersive_lyric__panel_close')" @click="panelOpen = false">✕</button>
        </aside>
      </div>

      <!-- 面板收起后，右下角常驻一个圆形按钮用来重新打开（否则找不到入口） -->
      <button v-if="!panelOpen" :class="$style.panelFab" :aria-label="$t('immersive_lyric__panel_open')" :title="$t('immersive_lyric__panel_open')" @click="panelOpen = true">
        <svg viewBox="0 0 24 24" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
          <path d="M4 8h9M17 8h3M4 16h3M11 16h9" />
          <circle cx="15" cy="8" r="2.1" />
          <circle cx="9" cy="16" r="2.1" />
        </svg>
      </button>

      <!-- ── 底部控制条：始终可见，默认缩小，鼠标移上去展开 ── -->
      <footer
        :class="[$style.bar, barExpanded ? $style.barOpen : $style.barClosed]"
        @pointerenter="handleBarEnter"
        @pointerleave="handleBarLeave"
      >
        <button :class="$style.iconBtn" :aria-label="$t('player__prev')" @click="playPrev()">
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 0 1024 1024" space="preserve">
            <use xlink:href="#icon-prevMusic" />
          </svg>
        </button>
        <button :class="[$style.iconBtn, $style.playBtn]" :aria-label="isPlay ? $t('player__pause') : $t('player__play')" @click="togglePlay">
          <svg v-if="isPlay" version="1.1" xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 0 1024 1024" space="preserve">
            <use xlink:href="#icon-pause" />
          </svg>
          <svg v-else version="1.1" xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 0 1024 1024" space="preserve">
            <use xlink:href="#icon-play" />
          </svg>
        </button>
        <button :class="$style.iconBtn" :aria-label="$t('player__next')" @click="playNext()">
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 0 1024 1024" space="preserve">
            <use xlink:href="#icon-nextMusic" />
          </svg>
        </button>

        <!-- 收起态：只留歌名 -->
        <span v-if="!barExpanded" :class="$style.barTitle">{{ musicInfo.name }}</span>

        <!-- 展开态：进度 + 时间 + 面板 + 打开播放器 -->
        <template v-else>
          <div :class="$style.seek">
            <common-progress-bar
              :class-name="$style.seekBar"
              on-dark
              :progress="progress"
              :handle-transition-end="handleTransitionEnd"
              :is-active-transition="isActiveTransition"
            />
          </div>
          <span :class="$style.time">{{ nowPlayTimeStr }} / {{ maxPlayTimeStr }}</span>
          <button
            :class="[$style.iconBtn, timelineOpen && $style.iconBtnOn]"
            :aria-label="$t('timeline.title')" :title="$t('timeline.title')"
            @click="toggleTimeline"
          >
            <svg viewBox="0 0 24 24" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
              <path d="M12 3.5v17" />
              <circle cx="12" cy="8" r="1.9" />
              <circle cx="12" cy="16" r="1.9" />
            </svg>
          </button>
          <button :class="$style.openBtn" @click="openPlayer">打开播放器</button>
        </template>
      </footer>

      <!-- ── 主题公园 ── -->
      <theme-park
        :visible="themeParkOpen"
        :initial="customTheme"
        :style-key="lyricStyle"
        :bg-presets="bgPresets"
        :bg-preset-key="bgPresetKey"
        :bg-type="bgType"
        @close="themeParkOpen = false"
        @apply="applyCustomTheme"
      />

      <!-- ── 音效设置窗口 ── -->
      <div v-if="fxOpen" :class="$style.fxMask" @click.self="fxOpen = false">
        <div :class="$style.fxPanel" role="dialog" aria-label="音效设置">
          <header :class="$style.fxHeader">
            <div :class="$style.fxHeaderText">
              <strong>音效设置</strong>
              <small>环境混响 / 均衡器 / 音调升降 / 3D 环绕</small>
            </div>
            <button :class="$style.fxClose" :aria-label="$t('close')" @click="fxOpen = false">
              <svg version="1.1" xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 0 24 24" space="preserve">
                <use xlink:href="#icon-close" />
              </svg>
            </button>
          </header>
          <div :class="$style.fxGrid">
            <section :class="$style.fxCard"><audio-convolution /></section>
            <section :class="$style.fxCard"><biquad-filter /></section>
            <section :class="$style.fxCard"><pitch-shifter /></section>
            <section :class="$style.fxCard"><audio-panner /></section>
          </div>
        </div>
      </div>

      <!-- ── 时间线（Folia LyricsTimelineModal 的复刻） -->
      <div v-if="timelineOpen" :class="$style.tlMask" @click.self="timelineOpen = false">
        <div :class="$style.tlPanel" role="dialog" :aria-label="$t('timeline.title')">
          <div :class="$style.tlHeader">
            <span :class="$style.tlTitle">{{ $t('timeline.title') }}</span>
            <button :class="$style.tlClose" :aria-label="$t('close')" @click="timelineOpen = false">
              <svg version="1.1" xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 0 24 24" space="preserve">
                <use xlink:href="#icon-close" />
              </svg>
            </button>
          </div>
          <div ref="tl_scroll_ref" :class="$style.tlScroll" @scroll.passive="handleTimelineScroll" @wheel.passive="handleTimelineScroll" @touchmove.passive="handleTimelineScroll">
            <div :class="$style.tlInner">
              <div :class="$style.tlLine" aria-hidden="true"></div>
              <div
                v-for="(row, index) in timelineRows"
                :key="`${keyPrefix}-tl-${index}`"
                :ref="el => { if (index === activeIndex) tl_active_ref = el }"
                :class="[$style.tlRow, index === activeIndex && $style.tlRowActive]"
                :data-tl-index="index"
                @click="seekTo(row.time)"
              >
                <div :class="$style.tlSideLeft">
                  <div v-if="index % 2 === 0" :class="$style.tlCard">
                    <p :class="$style.tlText">{{ row.text }}</p>
                    <p v-if="row.translation" :class="$style.tlTranslation">{{ row.translation }}</p>
                    <span :class="$style.tlTime">{{ row.timeText }}</span>
                  </div>
                </div>
                <span :class="$style.tlDot" aria-hidden="true"></span>
                <div :class="$style.tlSideRight">
                  <div v-if="index % 2 === 1" :class="$style.tlCard">
                    <p :class="$style.tlText">{{ row.text }}</p>
                    <p v-if="row.translation" :class="$style.tlTranslation">{{ row.translation }}</p>
                    <span :class="$style.tlTime">{{ row.timeText }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script>
import { ref, computed, watch, onMounted, onBeforeUnmount } from '@common/utils/vueTools'
import { musicInfo, isPlay, playInfo, playMusicInfo } from '@renderer/store/player/state'
import { togglePlay, playNext, playPrev, playList } from '@renderer/core/player'
import { setShowPlayerDetail, getList } from '@renderer/store/player/action'
import usePlayProgress from '@renderer/utils/compositions/usePlayProgress'
import useImmersiveClock from '@renderer/components/layout/ImmersiveLyric/stage/useImmersiveClock'
import { buildLyricTimeline, findActiveLineIndex } from '@renderer/core/immersiveLyric/timeline'
import { getLineFill } from '@renderer/core/immersiveLyric/fill'
import LyricLineView from '@renderer/components/layout/ImmersiveLyric/stage/LyricLineView.vue'
import PanelVolume from '@renderer/components/layout/ImmersiveLyric/panel/PanelVolume.vue'
import AudioConvolution from '@renderer/components/common/SoundEffectBtn/AudioConvolution.vue'
import BiquadFilter from '@renderer/components/common/SoundEffectBtn/BiquadFilter.vue'
import PitchShifter from '@renderer/components/common/SoundEffectBtn/PitchShifter.vue'
import AudioPanner from '@renderer/components/common/SoundEffectBtn/AudioPanner.vue'
import CanvasLyrics from './CanvasLyrics.vue'
import { generateThemeFromCover } from './builtinTheme.js'
import ThemePark from './ThemePark.vue'
import { getListMusics } from '@renderer/store/list/action'
import { resolveQueueView } from '@renderer/core/immersiveLyric/panel/queue'
import { minWindow, maxWindowToggle, closeWindow } from '@renderer/utils/ipc'

/**
 * 泛音统一歌词界面（Lattice）——沉浸式歌词与 Folia 舞台合并后的唯一入口
 *
 * 布局对齐 Folia（参考 chthollyphile/folia-major）：
 *   · 歌词居中大字，逐字填充 + 行内时间线
 *   · 右侧常驻面板：封面卡 → 图标行（列表/模式/音量/时间线）→ 内容区 → 歌词信息 → 时间轴偏移 → ✕
 *   · 底部播放条：默认是左下角小卡片，鼠标移上去展开成完整控制条
 *   · 时间线弹窗：中间竖线 + 左右交错卡片，点卡片跳转
 *
 * 数据全部复用现有引擎（useImmersiveClock / buildLyricTimeline / getLineFill / Panel*），
 * 不另造时间源；「时间轴偏移」只在本界面内生效（毫秒，正数=歌词提前）。
 */
// 时间轴偏移在会话内保留（关掉再开不丢），默认 0
const lyricOffset = ref(0)

export default {
  name: 'LatticeLyric',
  components: { LyricLineView, PanelVolume, AudioConvolution, BiquadFilter, PitchShifter, AudioPanner, CanvasLyrics, ThemePark },
  props: {
    visible: Boolean,
  },
  emits: ['close'],
  setup(props, { emit }) {
    const dom_root = ref(null)
    const canvas_ref = ref(null)
    const panelOpen = ref(true)
    const panelSection = ref('cover')

    // ── 歌词样式 / 背景类型（Folia 的「右侧控制面板」核心两项）──────────
    // 存 localStorage：换歌、重开窗口都保持
    const LS_KEY = 'lattice-panel-prefs'
    const readPrefs = () => {
      try { return JSON.parse(window.localStorage.getItem(LS_KEY) ?? '{}') } catch (e) { return {} }
    }
    const savedPrefs = readPrefs()

    const lyricStyles = [
      { key: 'standard', label: '标准' },
      { key: 'flow', label: '流光' },
      { key: 'fade', label: '隐现' },
      { key: 'cloud', label: '云阶' },
      { key: 'chorus', label: '群唱' },
      { key: 'monet', label: '莫奈' },
      { key: 'particle', label: '粒子' },
    ]
    const bgTypes = [
      { key: 'default', label: '默认' },
      { key: 'ai', label: 'AI主题' },
      { key: 'custom', label: '自定义' },
    ]
    // 预设：name + 两层径向渐变（tint）+ 底色，直接喂给 .bgTint
    const bgPresets = [
      { key: 'tide', name: '潮汐深潭', swatch: 'linear-gradient(135deg,#0b1a33,#2b5f8a)', tint: 'radial-gradient(80% 60% at 20% 20%, rgba(58,120,190,.55), rgba(58,120,190,0) 62%), radial-gradient(70% 55% at 82% 78%, rgba(20,60,110,.5), rgba(20,60,110,0) 60%), linear-gradient(140deg, rgba(8,18,36,.62), rgba(4,8,16,.72))' },
      { key: 'monet', name: '莫奈花园', swatch: 'linear-gradient(135deg,#3c2a52,#7a5c8f)', tint: 'radial-gradient(75% 60% at 25% 25%, rgba(168,120,190,.5), rgba(168,120,190,0) 60%), radial-gradient(70% 55% at 80% 75%, rgba(120,150,210,.42), rgba(120,150,210,0) 62%), linear-gradient(140deg, rgba(40,26,56,.6), rgba(16,12,24,.7))' },
      { key: 'ember', name: '余烬', swatch: 'linear-gradient(135deg,#3a1414,#8a3b2a)', tint: 'radial-gradient(80% 60% at 22% 20%, rgba(210,90,60,.48), rgba(210,90,60,0) 62%), radial-gradient(70% 55% at 80% 78%, rgba(120,40,40,.45), rgba(120,40,40,0) 60%), linear-gradient(140deg, rgba(34,12,12,.62), rgba(14,8,8,.74))' },
      { key: 'aurora', name: '极光', swatch: 'linear-gradient(135deg,#062a2a,#2f8f7f)', tint: 'radial-gradient(80% 60% at 18% 22%, rgba(60,200,170,.42), rgba(60,200,170,0) 62%), radial-gradient(70% 55% at 84% 76%, rgba(80,120,220,.4), rgba(80,120,220,0) 60%), linear-gradient(140deg, rgba(6,26,26,.62), rgba(4,10,12,.74))' },
      { key: 'dusk', name: '暮色', swatch: 'linear-gradient(135deg,#2a1a2e,#b06a5a)', tint: 'radial-gradient(80% 60% at 20% 18%, rgba(190,110,90,.45), rgba(190,110,90,0) 62%), radial-gradient(70% 55% at 82% 78%, rgba(120,80,150,.42), rgba(120,80,150,0) 60%), linear-gradient(140deg, rgba(30,16,28,.6), rgba(12,8,14,.72))' },
      { key: 'ink', name: '水墨', swatch: 'linear-gradient(135deg,#101216,#4a4f57)', tint: 'radial-gradient(80% 60% at 22% 20%, rgba(150,155,165,.24), rgba(150,155,165,0) 62%), radial-gradient(70% 55% at 80% 78%, rgba(90,95,105,.28), rgba(90,95,105,0) 60%), linear-gradient(140deg, rgba(16,17,20,.7), rgba(8,9,12,.78))' },
    ]

    const lyricStyle = ref(savedPrefs.lyricStyle ?? 'standard')
    // Canvas 渲染管线（对齐 Folia：字形纹理 + 扫光；另加粒子聚合一档）
    const canvasMode = ref(savedPrefs.canvasMode ?? false)
    const bgType = ref(savedPrefs.bgType ?? 'default')
    const bgPresetKey = ref(savedPrefs.bgPreset ?? 'tide')
    const lyricScale = ref(savedPrefs.lyricScale ?? 1)

    const savePrefs = () => {
      try {
        window.localStorage.setItem(LS_KEY, JSON.stringify({
          lyricStyle: lyricStyle.value,
          bgType: bgType.value,
          bgPreset: bgPresetKey.value,
          lyricScale: lyricScale.value,
        }))
      } catch (e) { /* 隐私模式等，忽略 */ }
    }
    const setLyricStyle = key => { lyricStyle.value = key; savePrefs() }
    const toggleCanvas = () => { canvasMode.value = !canvasMode.value; savePrefs() }

    // ── 主题公园（自定义主题编辑器，移植自 Folia ThemePark）─────────────
    const themeParkOpen = ref(false)
    const customTheme = ref(savedPrefs.customTheme ?? null)
    const openThemePark = () => { themeParkOpen.value = true }
    const applyCustomTheme = t => {
      customTheme.value = t
      bgType.value = 'custom'
      // 设置窗口里的其它项一并应用（样式/字号/字幕/模块）
      if (t.styleKey) lyricStyle.value = t.styleKey
      if (t.fontScale) lyricScale.value = t.fontScale
      if (typeof t.subtitleOn === 'boolean') subtitleOn.value = t.subtitleOn
      if (t.subtitleMode) subtitleMode.value = t.subtitleMode
      if (t.subtitleScale) subtitleScale.value = t.subtitleScale
      if (t.subtitleColor) subtitleColor.value = t.subtitleColor
      if (t.modules) uiModules.value = { ...uiModules.value, ...t.modules }
      savePrefs()
    }

    // 字幕（对应 Folia 的 subtitle / translation 开关）
    const subtitleOn = ref(savedPrefs.subtitleOn ?? true)
    const subtitleMode = ref(savedPrefs.subtitleMode ?? 'translation')
    const subtitleScale = ref(savedPrefs.subtitleScale ?? 0.5)
    const subtitleColor = ref(savedPrefs.subtitleColor ?? 'rgba(255,255,255,0.62)')
    // 模块开关：底栏/面板显示哪些部件
    const uiModules = ref(savedPrefs.uiModules ?? { cover: true, progress: true, time: true, queue: true, volume: true })
    const subtitleTextNow = computed(() => {
      if (!subtitleOn.value) return ''
      const line = timeline.value.lines[activeIndex.value]
      if (!line) return ''
      if (subtitleMode.value === 'romanization') return line.romanization ?? ''
      return line.translation ?? ''
    })
    // 应用优先级：自定义主题 > AI 主题 > 预设
    const activeBgTintOverride = computed(() => {
      if (customTheme.value) {
        return {
          background: 'radial-gradient(80% 60% at 22% 18%, rgba(255,255,255,.05), rgba(255,255,255,0) 62%),' +
            `linear-gradient(140deg, ${customTheme.value.backgroundColor}cc, ${customTheme.value.backgroundColor}f2)`,
        }
      }
      return null
    })
    const setBgType = key => { bgType.value = key; savePrefs() }
    const setBgPreset = key => { bgPresetKey.value = key; savePrefs() }
    const shuffleBg = () => {
      const idx = bgPresets.findIndex(p => p.key === bgPresetKey.value)
      bgPresetKey.value = bgPresets[(idx + 1) % bgPresets.length].key
      savePrefs()
    }
    const nudgeScale = step => {
      lyricScale.value = Math.min(1.6, Math.max(0.7, Math.round((lyricScale.value + step * 0.05) * 100) / 100))
      savePrefs()
    }
    // ── AI 主题（无 Key 时的内置生成器，移植自 Folia builtinTheme/）──────
    // 从当前封面取色 → HSL 谐和配色 → 中文命名（潮汐/绯色 + 子夜/破晓 + Built-in）
    const aiTheme = ref(null)
    const aiThemeLoading = ref(false)
    const aiThemeName = computed(() => aiTheme.value ? aiTheme.value.name : '点击生成')
    const generateAiTheme = async() => {
      if (aiThemeLoading.value) return
      aiThemeLoading.value = true
      try {
        aiTheme.value = await generateThemeFromCover(musicInfo.pic)
      } catch (e) { /* 封面取色失败就走默认 */ }
      aiThemeLoading.value = false
    }
    watch([() => musicInfo.pic, bgType], ([pic, type]) => {
      if (type === 'ai' && !aiTheme.value) void generateAiTheme()
    }, { immediate: true })

    // 应用到背景与歌词颜色：AI 主题优先，其次预设
    const activeBgTint = computed(() => {
      if (bgType.value === 'custom' && activeBgTintOverride.value) return activeBgTintOverride.value
      if (bgType.value === 'ai' && aiTheme.value) return { background: aiTheme.value.bg.tint }
      const p = bgPresets.find(x => x.key === bgPresetKey.value) ?? bgPresets[0]
      return { background: p.tint }
    })
    const bgPresetName = computed(() => {
      if (bgType.value === 'ai') return aiTheme.value ? aiTheme.value.name : 'AI 主题（未生成）'
      return (bgPresets.find(p => p.key === bgPresetKey.value) ?? bgPresets[0]).name
    })
    const currentStyleLabel = computed(() => (lyricStyles.find(s => s.key === lyricStyle.value) ?? lyricStyles[0]).label)
    // 当前生效的歌词颜色（自定义主题 > AI 主题 > 默认）
    const themeBaseNow = computed(() => {
      if (bgType.value === 'custom' && customTheme.value) return customTheme.value.primaryColor + '8c'
      if (bgType.value === 'ai' && aiTheme.value) return aiTheme.value.baseColor
      return ''
    })
    const themeWordNow = computed(() => {
      if (bgType.value === 'custom' && customTheme.value) return '#ffffff'
      if (bgType.value === 'ai' && aiTheme.value) return aiTheme.value.wordColor
      return ''
    })
    const themeGlowNow = computed(() => {
      if (bgType.value === 'custom' && customTheme.value) return customTheme.value.accentColor
      if (bgType.value === 'ai' && aiTheme.value) return aiTheme.value.glowColor
      return ''
    })

    const bgTintStyle = activeBgTint
    const barExpanded = ref(false)
    const timelineOpen = ref(false)
    // 音效设置窗口（自己做，不用 SoundEffectBtn 的弹窗：它 teleport 到 #root，会被歌词界面盖住）
    const fxOpen = ref(false)
    // 播放队列（复用沉浸面板的数据链路，但用 Folia 那种简洁行样式）
    const queueList = ref([])
    let queueToken = 0
    // 右上角窗口控制：靠近才显示
    const winCtrlOn = ref(false)
    let winCtrlTimer = null
    const showWinCtrl = () => {
      if (winCtrlTimer) { window.clearTimeout(winCtrlTimer); winCtrlTimer = null }
      winCtrlOn.value = true
    }
    const hideWinCtrl = () => {
      if (winCtrlTimer) window.clearTimeout(winCtrlTimer)
      winCtrlTimer = window.setTimeout(() => { winCtrlOn.value = false }, 260)
    }
    const tl_scroll_ref = ref(null)
    const tl_active_ref = ref(null)
    // 面板内时间线（窄版）的滚动引用
    const tp_scroll_ref = ref(null)
    const tp_active_ref = ref(null)
    let userScrollTimer = null
    let autoScrollLocked = false
    let barLeaveTimer = null

    const visibleRef = computed(() => props.visible)
    const { nowMs } = useImmersiveClock(visibleRef)
    const {
      progress,
      nowPlayTimeStr,
      maxPlayTimeStr,
      isActiveTransition,
      handleTransitionEnd,
    } = usePlayProgress()

    // 应用时间轴偏移后的时间（正数=歌词提前）
    const effectiveNowMs = computed(() => Math.max(0, nowMs.value - lyricOffset.value))

    const timeline = computed(() => buildLyricTimeline({
      lrc: musicInfo.lrc,
      lxlrc: musicInfo.lxlrc,
      tlrc: musicInfo.tlrc,
    }))
    const activeIndex = computed(() => findActiveLineIndex(timeline.value.lines, effectiveNowMs.value))
    const keyPrefix = computed(() => musicInfo.id ?? 'none')
    const hasRawLyric = computed(() => Boolean(musicInfo.lrc) || Boolean(musicInfo.lxlrc))
    const lyricKindLabel = computed(() => {
      if (musicInfo.lxlrc) return '逐字歌词'
      if (musicInfo.lrc) return 'LRC'
      return '无歌词'
    })

    // 给 canvas 渲染器用的纯行数组（timeline 本身没暴露到模板）
    const lyricLines = computed(() => timeline.value.lines)

    const visibleLines = computed(() => {
      const lines = timeline.value.lines
      if (!lines.length) return []
      const base = activeIndex.value < 0 ? 0 : activeIndex.value
      const start = Math.max(0, base - 1)
      const end = Math.min(lines.length, base + 3)
      const list = []
      for (let index = start; index < end; index++) {
        const line = lines[index]
        list.push({
          index,
          line,
          state: index === activeIndex.value ? 'active' : (index < activeIndex.value ? 'prev' : 'next'),
          fill: line.words ? 0 : getLineFill(line.time, lines[index + 1]?.time, effectiveNowMs.value),
        })
      }
      return list
    })


    // ── 时间线 ─────────────────────────────────────────────────────
    const formatTime = ms => {
      const total = Math.max(0, Math.round(ms / 1000))
      const m = Math.floor(total / 60)
      const sec = total % 60
      return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    }
    const timelineRows = computed(() => timeline.value.lines.map(line => ({
      time: line.time,
      timeText: formatTime(line.time),
      text: line.text,
      translation: line.translation ?? '',
    })))

    const scrollToActive = (instant = false) => {
      const container = tl_scroll_ref.value
      const el = tl_active_ref.value
      if (!container || !el) return
      const top = el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2
      container.scrollTo({ top: Math.max(0, top), behavior: instant ? 'auto' : 'smooth' })
    }
    const openTimeline = () => {
      timelineOpen.value = true
      autoScrollLocked = false
      window.setTimeout(() => { scrollToActive(true) }, 80)
    }
    // 播放栏那颗按钮：开着就收起，关着就打开
    const toggleTimeline = () => {
      if (timelineOpen.value) timelineOpen.value = false
      else openTimeline()
    }
    const seekTo = time => { window.app_event.setProgress(time / 1000) }
    const handleTimelineScroll = () => {
      autoScrollLocked = true
      if (userScrollTimer) window.clearTimeout(userScrollTimer)
      userScrollTimer = window.setTimeout(() => { autoScrollLocked = false }, 2600)
    }
    const scrollPanelTimelineToActive = () => {
      const container = tp_scroll_ref.value
      const el = tp_active_ref.value
      if (!container || !el) return
      const top = el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2
      container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
    }
    watch(activeIndex, () => {
      if (timelineOpen.value && !autoScrollLocked) scrollToActive(false)
      if (panelSection.value === 'timeline' && panelOpen.value) scrollPanelTimelineToActive()
    })
    watch([() => props.visible, panelSection, panelOpen], ([v, section, open]) => {
      if (v && open && section === 'queue') void refreshQueue()
    })

    const queueView = computed(() => resolveQueueView(
      queueList.value,
      playInfo.playerListId,
      playMusicInfo.musicInfo?.id ?? null,
      playInfo.playIndex,
      playMusicInfo.isTempPlay,
    ))

    const refreshQueue = async() => {
      const id = playInfo.playerListId
      const token = ++queueToken
      if (!id) { queueList.value = []; return }
      let list = getList(id)
      if (!list) list = await getListMusics(id)
      if (token !== queueToken) return
      queueList.value = list ?? []
    }
    const playQueueRow = index => {
      if (!playInfo.playerListId) return
      playList(playInfo.playerListId, index)
    }
    const handleQueueUpdate = ids => {
      if (!playInfo.playerListId || !ids.includes(playInfo.playerListId)) return
      void refreshQueue()
    }

    const nudgeOffset = delta => {
      lyricOffset.value = Math.max(-5000, Math.min(5000, lyricOffset.value + delta))
    }

    const handleClose = () => { emit('close') }
    const handleBackPointerDown = e => { if (e.button === 0) handleClose() }
    const openPlayer = () => {
      emit('close')
      setShowPlayerDetail(true)
    }

    // 底部播放条：悬停展开（离开留 180ms 缓冲，避免抖动）
    const handleBarEnter = () => {
      if (barLeaveTimer) { window.clearTimeout(barLeaveTimer); barLeaveTimer = null }
      barExpanded.value = true
    }
    const handleBarLeave = () => {
      if (barLeaveTimer) window.clearTimeout(barLeaveTimer)
      barLeaveTimer = window.setTimeout(() => { barExpanded.value = false }, 180)
    }

    // ── 粒子层（canvas 2D）────────────────────────────────────────
    let rafId = null
    let particles = []
    let dpr = 1
    let lastTs = 0
    const initParticles = () => {
      const canvas = canvas_ref.value
      if (!canvas) return
      dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      const count = Math.max(28, Math.round(w * h / 26000))
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.6 + Math.random() * 1.8,
        vy: 0.12 + Math.random() * 0.35,
        vx: (Math.random() - 0.5) * 0.12,
        phase: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 1.4,
      }))
    }
    const drawParticles = ts => {
      const canvas = canvas_ref.value
      if (!canvas) { rafId = null; return }
      const ctx = canvas.getContext('2d')
      const w = canvas.width / dpr
      const h = canvas.height / dpr
      const dt = Math.min(48, ts - lastTs || 16)
      lastTs = ts
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      for (const p of particles) {
        p.y -= p.vy * dt / 16
        p.x += p.vx * dt / 16
        if (p.y < -6) { p.y = h + 6; p.x = Math.random() * w }
        if (p.x < -6) p.x = w + 6
        if (p.x > w + 6) p.x = -6
        p.phase += 0.02 * p.speed * dt / 16
        const alpha = 0.18 + 0.32 * (0.5 + 0.5 * Math.sin(p.phase))
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(214, 202, 255, ${alpha.toFixed(3)})`
        ctx.fill()
      }
      rafId = window.requestAnimationFrame(drawParticles)
    }
    const startParticles = () => {
      initParticles()
      if (rafId == null) {
        lastTs = 0
        rafId = window.requestAnimationFrame(drawParticles)
      }
    }
    const stopParticles = () => {
      if (rafId != null) {
        window.cancelAnimationFrame(rafId)
        rafId = null
      }
    }
    const handleResize = () => { if (props.visible) initParticles() }

    watch(() => props.visible, v => {
      if (v) {
        panelOpen.value = true
        timelineOpen.value = false
        barExpanded.value = false
        void Promise.resolve().then(() => {
          dom_root.value?.focus()
          startParticles()
        })
      } else {
        stopParticles()
      }
    })

    const handleGlobalEsc = e => {
      if (e.key === 'p' || e.key === 'P') {
        if (!props.visible) return
        panelOpen.value = !panelOpen.value
        return
      }
      if (e.key !== 'Escape') return
      if (timelineOpen.value) timelineOpen.value = false
      else if (panelOpen.value) panelOpen.value = false
      else handleClose()
    }
    onMounted(() => {
      window.addEventListener('keydown', handleGlobalEsc)
      window.addEventListener('resize', handleResize)
      window.app_event.on('myListUpdate', handleQueueUpdate)
      window.app_event.on('downloadListUpdate', handleQueueUpdate)
    })
    onBeforeUnmount(() => {
      window.removeEventListener('keydown', handleGlobalEsc)
      window.removeEventListener('resize', handleResize)
      window.app_event.off('myListUpdate', handleQueueUpdate)
      window.app_event.off('downloadListUpdate', handleQueueUpdate)
      stopParticles()
      if (barLeaveTimer) window.clearTimeout(barLeaveTimer)
      if (userScrollTimer) window.clearTimeout(userScrollTimer)
      if (winCtrlTimer) window.clearTimeout(winCtrlTimer)
    })

    return {
      dom_root,
      canvas_ref,
      nowMs,
      effectiveNowMs,
      musicInfo,
      isPlay,
      togglePlay,
      playNext,
      playPrev,
      openPlayer,
      progress,
      nowPlayTimeStr,
      maxPlayTimeStr,
      isActiveTransition,
      handleTransitionEnd,
      visibleLines,
      activeIndex,
      keyPrefix,
      hasRawLyric,
      lyricKindLabel,
      lyricOffset,
      nudgeOffset,
      panelOpen,
      panelSection,
      lyricStyles,
      lyricStyle,
      setLyricStyle,
      currentStyleLabel,
      bgTypes,
      bgType,
      setBgType,
      bgPresets,
      bgPresetKey,
      bgPresetName,
      setBgPreset,
      shuffleBg,
      bgTintStyle,
      aiThemeName,
      generateAiTheme,
      aiThemeLoading,
      themeParkOpen,
      openThemePark,
      customTheme,
      applyCustomTheme,
      themeBaseNow,
      themeWordNow,
      themeGlowNow,
      subtitleTextNow,
      subtitleScale,
      subtitleColor,
      uiModules,
      lyricScale,
      nudgeScale,
      canvasMode,
      toggleCanvas,
      lyricLines,
      barExpanded,
      handleBarEnter,
      handleBarLeave,
      timelineOpen,
      fxOpen,
      winCtrlOn,
      showWinCtrl,
      hideWinCtrl,
      minWindow,
      maxWindowToggle,
      closeWindow,
      queueView,
      playQueueRow,
      timelineRows,
      tl_scroll_ref,
      tl_active_ref,
      tp_scroll_ref,
      tp_active_ref,
      openTimeline,
      toggleTimeline,
      seekTo,
      handleTimelineScroll,
      handleClose,
      handleBackPointerDown,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.root {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 460;
  overflow: hidden;
  display: flex;
  flex-flow: column nowrap;
  outline: none;
  user-select: none;
  color: #fff;
  background: #0b0a12;
  -webkit-app-region: no-drag;
}

// ── 背景 ───────────────────────────────────────────────────────────
.bgCover {
  position: absolute;
  inset: -60px;
  background-size: cover;
  background-position: center;
  filter: blur(64px) saturate(1.15) brightness(.42);
  transform: scale(1.08);
  pointer-events: none;
}
.bgTint {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(80% 60% at 22% 18%, rgba(124, 96, 220, .5), rgba(124, 96, 220, 0) 62%),
    radial-gradient(70% 55% at 82% 78%, rgba(88, 132, 208, .4), rgba(88, 132, 208, 0) 60%),
    linear-gradient(140deg, rgba(24, 20, 40, .5), rgba(10, 10, 18, .62));
  animation: tintShift 36s linear infinite;
}
@keyframes tintShift {
  0% { filter: hue-rotate(0deg); }
  50% { filter: hue-rotate(38deg); }
  100% { filter: hue-rotate(0deg); }
}
.particles {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.vignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(120% 90% at 50% 45%, rgba(0, 0, 0, 0) 42%, rgba(6, 5, 12, .7) 100%),
    linear-gradient(180deg, rgba(6, 5, 12, .5), rgba(6, 5, 12, 0) 26%, rgba(6, 5, 12, 0) 68%, rgba(6, 5, 12, .6));
}

// ── 右上角窗口控制（靠近才出现）─────────────────────────────────
.winZone {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 2px;
  // 热区比按钮大一圈：鼠标靠近右上角就触发，不用精准对准
  padding: 10px 12px 16px 28px;
  -webkit-app-region: no-drag;
  opacity: 0;
  transform: translateY(-6px);
  transition: opacity .22s ease, transform .22s ease;
  pointer-events: auto;
}
.winZoneOn {
  opacity: 1;
  transform: translateY(0);
}
.winBtn {
  width: 30px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: rgba(255, 255, 255, .7);
  cursor: pointer;
  transition: background-color .16s ease, color .16s ease;
  &:hover {
    background: rgba(255, 255, 255, .14);
    color: #fff;
  }
}
.winClose:hover {
  background: #e81123;
  color: #fff;
}

// ── 顶栏 ───────────────────────────────────────────────────────────
.top {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px 26px 8px;
  // ⚠️ 整条顶栏**不能**是 drag：拖动区在系统层吞鼠标事件，右上角窗口按钮的 hover 就永远不触发
  -webkit-app-region: no-drag;
}
.dragArea {
  flex: auto;
  min-width: 0;
  // ⚠️ 必须留出右侧空间：拖动区会一路铺到窗口右边缘的话，右上角的窗口按钮
  // 就落在系统拖动区里 —— 真实鼠标事件会被系统吞掉（hover/点击都不触发）。
  max-width: calc(100% - 180px);
  align-self: stretch;
  display: flex;
  align-items: center;
  -webkit-app-region: drag;
}
.backBtn {
  flex: none;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background-color: rgba(255, 255, 255, .12);
  color: #fff;
  cursor: pointer;
  transition: background-color .2s ease;
  &:hover { background-color: rgba(255, 255, 255, .24); }
}
.meta {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
  strong {
    font-size: 15px;
    font-weight: 700;
    color: rgba(255, 255, 255, .82);
    .mixin-ellipsis-1();
  }
  small {
    font-size: 12.5px;
    color: rgba(255, 255, 255, .45);
    .mixin-ellipsis-1();
  }
}

// ── 主区：歌词 + 右侧面板 ─────────────────────────────────────────
.mainArea {
  position: relative;
  flex: auto;
  min-height: 0;
  display: flex;
  overflow: hidden;
}
.canvasLyrics {
  position: absolute;
  inset: 0;
}

.lyricArea {
  position: relative;
  flex: auto;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 clamp(28px, 5vw, 72px);
  overflow: hidden;
}
.lyricColumn {
  width: 100%;
  display: flex;
  flex-flow: column nowrap;
  align-items: center;
  text-align: center;
  gap: clamp(14px, 2.2vh, 26px);
}

.line {
  position: relative;
  max-width: 100%;
  line-height: 1.3;
  transition: opacity .32s ease, transform .32s ease, font-size .32s ease;
}
.line_active {
  font-size: clamp(30px, 4.6vw, 58px);
  font-weight: 700;
  letter-spacing: .01em;
  color: rgba(255, 255, 255, .96);
  text-shadow: 0 6px 40px rgba(120, 96, 220, .35);
  padding-bottom: 12px;

  :global(.fillText),
  :deep(.fillText) {
    background-image: linear-gradient(
      90deg,
      #f3edff 0,
      #f3edff calc(var(--ilus-fill, 0) * 100%),
      rgba(255, 255, 255, .34) calc(var(--ilus-fill, 0) * 100%),
      rgba(255, 255, 255, .34) 100%
    );
  }
}
.line_prev,
.line_next {
  font-size: clamp(15px, 1.7vw, 22px);
  font-weight: 500;
  color: rgba(255, 255, 255, .34);
  :global(.fillText),
  :deep(.fillText) {
    background-image: none;
    -webkit-text-fill-color: currentColor;
  }
}
.line_prev { opacity: .45; }

.enterFrom { opacity: 0; transform: translateY(14px); }
.enterActive { transition: opacity .34s ease, transform .34s ease; }
.leaveActive { transition: opacity .26s ease, transform .26s ease; position: absolute; }
.leaveTo { opacity: 0; transform: translateY(-12px); }

.empty {
  width: 100%;
  display: flex;
  flex-flow: column nowrap;
  align-items: center;
  gap: 10px;
  color: rgba(255, 255, 255, .45);
  font-size: 14px;
}
.emptyTitle {
  font-size: clamp(24px, 3vw, 34px);
  font-weight: 700;
  color: rgba(255, 255, 255, .8);
}

// ── 右侧常驻面板（复刻 Folia）────────────────────────────────────
.sidePanel {
  position: relative;
  flex: none;
  width: 300px;
  margin: 0 22px 18px 8px;
  padding: 14px;
  display: flex;
  flex-flow: column nowrap;
  gap: 12px;
  border-radius: 20px;
  background: rgba(20, 17, 30, .5);
  border: 1px solid rgba(255, 255, 255, .1);
  backdrop-filter: blur(22px) saturate(1.3);
  box-shadow: 0 22px 60px rgba(0, 0, 0, .45);
  animation: sidePanelIn .28s cubic-bezier(.22, .61, .36, 1) both;
}
@keyframes sidePanelIn {
  from { opacity: 0; transform: translateX(16px); }
  to { opacity: 1; transform: translateX(0); }
}

.posterCard {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 14px;
  overflow: hidden;
  background: linear-gradient(135deg, #26304a, #3c2f55);
}
.posterImg {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.posterFallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 56px;
  font-weight: 700;
  color: rgba(255, 255, 255, .45);
}
.posterName {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 10px;
  font-size: 20px;
  font-weight: 800;
  letter-spacing: .5px;
  color: #fff;
  text-shadow: 0 2px 14px rgba(0, 0, 0, .7);
  .mixin-ellipsis-1();
}

.iconRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 0 2px;
}
.tabBtn {
  flex: 1;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 9px;
  background: rgba(255, 255, 255, .06);
  color: rgba(255, 255, 255, .7);
  cursor: pointer;
  transition: background-color .18s ease, color .18s ease;
  &:hover { background: rgba(255, 255, 255, .14); color: #fff; }
}
.tabActive {
  background: rgba(180, 155, 255, .22);
  color: #fff;
}

.panelBody {
  max-height: 220px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, .18) transparent;
  &::-webkit-scrollbar { width: 5px; }
  &::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, .18); border-radius: 999px; }
}

.infoRow,
.offsetRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 2px;
  font-size: 12px;
}
.infoLabel { color: rgba(255, 255, 255, .55); }
.infoValue { color: rgba(255, 255, 255, .85); }
.offsetCtrl {
  display: flex;
  align-items: center;
  gap: 4px;
}
.offsetBtn {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, .08);
  color: rgba(255, 255, 255, .8);
  font-size: 10px;
  cursor: pointer;
  &:hover { background: rgba(255, 255, 255, .18); }
}
.offsetValue {
  min-width: 58px;
  height: 22px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, .9);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.closeFab {
  position: absolute;
  right: -6px;
  bottom: -18px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: #fff;
  color: #1a1626;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 10px 26px rgba(0, 0, 0, .45);
  transition: transform .18s ease;
  &:hover { transform: scale(1.06); }
}

// ── 面板内容：封面信息 / 音效 / 时间线 ───────────────────────────
.coverInfo {
  display: flex;
  flex-flow: column nowrap;
  align-items: center;
  gap: 6px;
  padding: 10px 6px 6px;
  text-align: center;
}
.coverName {
  font-size: 20px;
  font-weight: 800;
  color: #fff;
  line-height: 1.25;
}
.coverArtist {
  font-size: 13px;
  color: rgba(255, 255, 255, .72);
}
.coverAlbum {
  font-size: 11.5px;
  color: rgba(255, 255, 255, .42);
}

.fxBox {
  display: flex;
  flex-flow: column nowrap;
  gap: 8px;
  padding: 4px 2px;
}
.fxRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.fxLabel {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, .9);
}
.fxHint {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: rgba(255, 255, 255, .45);
}

.tpWrap {
  display: flex;
  flex-flow: column nowrap;
  gap: 8px;
  height: 100%;
  min-height: 0;
}
.tpScroll {
  flex: auto;
  min-height: 0;
  max-height: 168px;
  overflow-y: auto;
  padding-right: 2px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, .18) transparent;
  &::-webkit-scrollbar { width: 5px; }
  &::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, .18); border-radius: 999px; }
}
.tpRow {
  width: 100%;
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 5px 6px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, .62);
  text-align: left;
  cursor: pointer;
  transition: background-color .16s ease, color .16s ease;
  &:hover { background: rgba(255, 255, 255, .08); color: #fff; }
}
.tpRowActive {
  background: rgba(180, 155, 255, .18);
  color: #fff;
}
.tpTime {
  flex: none;
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, .45);
}
.tpText {
  font-size: 12.5px;
  line-height: 1.35;
  .mixin-ellipsis-1();
}
.tpExpand {
  flex: none;
  padding: 6px 10px;
  border: 1px solid rgba(255, 255, 255, .16);
  border-radius: 8px;
  background: rgba(255, 255, 255, .06);
  color: rgba(255, 255, 255, .8);
  font-size: 11.5px;
  cursor: pointer;
  &:hover { background: rgba(255, 255, 255, .14); }
}

// ── 底部控制条：始终可见，默认缩小，悬停展开 ─────────────────────
.bar {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 auto 22px;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(18, 16, 28, .42);
  border: 1px solid rgba(255, 255, 255, .16);
  backdrop-filter: blur(22px) saturate(1.5);
  box-shadow: 0 18px 48px rgba(0, 0, 0, .45), inset 0 1px 0 rgba(255, 255, 255, .12);
  transition: width .34s cubic-bezier(.22, .61, .36, 1), padding .34s ease, gap .34s ease;
  overflow: hidden;
}
// 收起：只留播放三键 + 歌名
.barClosed {
  width: 320px;
}
// 展开：完整控制条
.barOpen {
  width: min(680px, calc(100% - 120px));
}
.barTitle {
  min-width: 0;
  flex: auto;
  font-size: 12.5px;
  font-weight: 600;
  color: rgba(255, 255, 255, .86);
  .mixin-ellipsis-1();
}
// 外圈描边（只画边，不填充）
.bar::before {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(120deg, rgba(255, 255, 255, .35), rgba(255, 255, 255, .04) 40%, rgba(180, 155, 255, .35));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}

.iconBtnOn {
  color: var(--color-primary);
  background-color: var(--color-primary-alpha-100);
}

.iconBtn {
  flex: none;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: rgba(255, 255, 255, .82);
  cursor: pointer;
  transition: background-color .18s ease, color .18s ease;
  &:hover {
    background: rgba(255, 255, 255, .12);
    color: #fff;
  }
}
.playBtn {
  width: 34px;
  height: 34px;
  background: rgba(255, 255, 255, .14);
  color: #fff;
  &:hover { background: rgba(255, 255, 255, .26); }
}
.seek {
  position: relative;
  flex: auto;
  height: 22px;
  display: flex;
  align-items: center;
  margin: 0 4px;
}
.seekBar { width: 100%; }
.time {
  flex: none;
  font-size: 11.5px;
  color: rgba(255, 255, 255, .55);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.openBtn {
  flex: none;
  padding: 6px 12px;
  border: 1px solid rgba(255, 255, 255, .16);
  border-radius: 999px;
  background: rgba(255, 255, 255, .06);
  color: rgba(255, 255, 255, .85);
  font-size: 12px;
  cursor: pointer;
  transition: background-color .18s ease, border-color .18s ease;
  &:hover {
    background: rgba(255, 255, 255, .14);
    border-color: rgba(255, 255, 255, .3);
  }
}


// ── 播放队列（Folia 风格：标题 + 歌名/歌手两行）─────────────────
.qWrap {
  display: flex;
  flex-flow: column nowrap;
  gap: 6px;
  min-height: 0;
}
.qHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 4px 4px;
}
.qTitle {
  font-size: 13px;
  font-weight: 700;
  color: rgba(255, 255, 255, .9);
}
.qCount {
  font-weight: 500;
  color: rgba(255, 255, 255, .45);
}
.qList {
  display: flex;
  flex-flow: column nowrap;
  max-height: 246px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, .18) transparent;
  &::-webkit-scrollbar { width: 5px; }
  &::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, .18); border-radius: 999px; }
}
.qEmpty {
  padding: 14px 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, .45);
}
.qRow {
  display: flex;
  flex-flow: column nowrap;
  gap: 2px;
  width: 100%;
  padding: 7px 8px;
  border: none;
  border-radius: 9px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  // 1000+ 行时跳过离屏行的布局与绘制
  content-visibility: auto;
  contain-intrinsic-size: 46px;
  transition: background-color .16s ease;
  &:hover { background: rgba(255, 255, 255, .08); }
}
.qRowActive {
  background: rgba(255, 255, 255, .12);
}
.qName {
  font-size: 13.5px;
  font-weight: 600;
  color: rgba(255, 255, 255, .92);
  .mixin-ellipsis-1();
}
.qSinger {
  font-size: 11.5px;
  color: rgba(255, 255, 255, .48);
  .mixin-ellipsis-1();
}

// ── 音效设置入口按钮 ─────────────────────────────────────────────
.fxOpenBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 9px 12px;
  border: 1px solid rgba(255, 255, 255, .16);
  border-radius: 10px;
  background: rgba(255, 255, 255, .08);
  color: rgba(255, 255, 255, .92);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color .18s ease, border-color .18s ease;
  &:hover {
    background: rgba(255, 255, 255, .16);
    border-color: rgba(255, 255, 255, .28);
  }
}

// ── 面板收起后的常驻打开按钮（右下角圆形）────────────────────────
.panelFab {
  position: absolute;
  right: 26px;
  bottom: 92px;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: rgba(28, 24, 38, .82);
  color: rgba(255, 255, 255, .92);
  cursor: pointer;
  backdrop-filter: blur(16px);
  box-shadow: 0 12px 30px rgba(0, 0, 0, .45);
  transition: transform .18s ease, background-color .18s ease;
  z-index: 3;
  &:hover {
    transform: scale(1.06);
    background: rgba(44, 38, 58, .92);
  }
}

// ── 音效设置窗口 ─────────────────────────────────────────────────
.fxMask {
  position: fixed;
  inset: 0;
  z-index: 540;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(6, 5, 12, .55);
  backdrop-filter: blur(8px);
  animation: tlFadeIn .18s ease both;
}
.fxPanel {
  width: min(860px, 88vw);
  max-height: 82vh;
  display: flex;
  flex-flow: column nowrap;
  border-radius: 20px;
  background: rgba(24, 20, 34, .72);
  border: 1px solid rgba(255, 255, 255, .12);
  backdrop-filter: blur(26px) saturate(1.3);
  box-shadow: 0 32px 90px rgba(0, 0, 0, .6);
  animation: tlPop .24s cubic-bezier(.22, .61, .36, 1) both;
  overflow: hidden;
}
.fxHeader {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, .08);
}
.fxHeaderText {
  display: flex;
  flex-flow: column nowrap;
  gap: 3px;
  strong {
    font-size: 16px;
    font-weight: 700;
  }
  small {
    font-size: 11.5px;
    color: rgba(255, 255, 255, .45);
  }
}
.fxClose {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, .08);
  color: #fff;
  cursor: pointer;
  &:hover { background: rgba(255, 255, 255, .18); }
}
.fxGrid {
  flex: auto;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  padding: 16px 20px 20px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, .18) transparent;
  &::-webkit-scrollbar { width: 6px; }
  &::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, .18); border-radius: 999px; }
}
.fxCard {
  display: flex;
  flex-flow: column nowrap;
  gap: 10px;
  padding: 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, .05);
  border: 1px solid rgba(255, 255, 255, .08);
  min-width: 0;
}
.fxCardTitle {
  margin: 0;
  font-size: 12.5px;
  font-weight: 700;
  color: rgba(255, 255, 255, .8);
  letter-spacing: .3px;
}

// ── 时间线弹窗 ─────────────────────────────────────────────────────
.tlMask {
  position: fixed;
  inset: 0;
  z-index: 520;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(6, 5, 12, .6);
  backdrop-filter: blur(10px);
  animation: tlFadeIn .2s ease both;
}
.tlPanel {
  width: min(900px, 90vw);
  height: min(80vh, 720px);
  display: flex;
  flex-flow: column nowrap;
  border-radius: 18px;
  background: rgba(16, 14, 24, .55);
  border: 1px solid rgba(255, 255, 255, .1);
  backdrop-filter: blur(24px) saturate(1.3);
  box-shadow: 0 30px 80px rgba(0, 0, 0, .55);
  animation: tlPop .26s cubic-bezier(.22, .61, .36, 1) both;
}
@keyframes tlFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes tlPop {
  from { opacity: 0; transform: scale(.94); }
  to { opacity: 1; transform: scale(1); }
}
.tlHeader {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px 10px;
}
.tlTitle {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: .3px;
}
.tlClose {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, .08);
  color: #fff;
  cursor: pointer;
  &:hover { background: rgba(255, 255, 255, .18); }
}
.tlScroll {
  position: relative;
  flex: auto;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 6px 26px 36px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, .18) transparent;
  &::-webkit-scrollbar { width: 6px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, .18);
    border-radius: 999px;
    &:hover { background: rgba(255, 255, 255, .3); }
  }
}
.tlInner {
  position: relative;
  padding: 24px 0;
}
.tlLine {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 2px;
  transform: translateX(-50%);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, .28), rgba(255, 255, 255, 0));
}
.tlRow {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 76px;
  margin-bottom: 30px;
  cursor: pointer;
}
.tlSideLeft {
  width: 50%;
  display: flex;
  justify-content: flex-end;
  padding-right: 34px;
  text-align: right;
}
.tlSideRight {
  width: 50%;
  display: flex;
  justify-content: flex-start;
  padding-left: 34px;
}
.tlDot {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  background: rgba(255, 255, 255, .35);
  box-shadow: 0 0 0 4px rgba(255, 255, 255, .06);
  transition: background-color .25s ease, box-shadow .25s ease;
}
.tlRowActive .tlDot {
  background: #c9b6ff;
  box-shadow: 0 0 0 5px rgba(180, 155, 255, .22), 0 0 18px rgba(180, 155, 255, .6);
}
.tlCard {
  max-width: 320px;
  padding: 11px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, .06);
  border: 1px solid rgba(255, 255, 255, .08);
  backdrop-filter: blur(10px);
  transition: background-color .25s ease, border-color .25s ease, transform .25s ease;
}
.tlRow:hover .tlCard { background: rgba(255, 255, 255, .12); }
.tlRowActive .tlCard {
  background: rgba(180, 155, 255, .16);
  border-color: rgba(180, 155, 255, .42);
  transform: scale(1.04);
}
.tlText {
  margin: 0;
  font-size: 14px;
  line-height: 1.45;
  color: rgba(255, 255, 255, .9);
}
.tlRowActive .tlText {
  font-size: 15px;
  font-weight: 600;
}
.tlTranslation {
  margin: 4px 0 0;
  font-size: 12px;
  color: rgba(255, 255, 255, .55);
  font-style: italic;
}
.tlTime {
  display: block;
  margin-top: 6px;
  font-size: 10.5px;
  color: rgba(255, 255, 255, .4);
  font-variant-numeric: tabular-nums;
}

/* ── 右侧控制面板：背景 / 歌词样式（对齐 Folia 的沉浸式设置）────────── */
.bgBox,
.styleBox {
  display: flex;
  flex-flow: column nowrap;
  gap: 12px;
}
.segRow {
  display: flex;
  flex-flow: row nowrap;
  gap: 3px;
  padding: 3px;
  border-radius: 10px;
  background: rgba(255, 255, 255, .07);
}
.segBtn {
  flex: 1 1 0;
  padding: 7px 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, .6);
  font-size: 12px;
  cursor: pointer;
  transition: background-color .18s ease, color .18s ease;

  &:hover { color: rgba(255, 255, 255, .85); }
}
.segActive {
  background: rgba(255, 255, 255, .2);
  color: #fff;
  font-weight: 600;
}
.presetHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: rgba(255, 255, 255, .78);
}
.shuffleBtn {
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 6px;
  background: rgba(255, 255, 255, .1);
  color: #fff;
  font-size: 13px;
  cursor: pointer;

  &:hover { background: rgba(255, 255, 255, .22); }
}
.tpEntry {
  display: flex;
  flex-flow: column nowrap;
  gap: 10px;
  align-items: stretch;
  padding: 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, .05);
  border: 1px dashed rgba(255, 255, 255, .18);
}
.tpOpenBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 11px 0;
  border: 0;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--color-primary), #9b6fe8);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: filter .18s ease;
  &:hover { filter: brightness(1.12); }
}
.tpNow {
  margin: 0;
  font-size: 11px;
  opacity: .55;
  text-align: center;
}

.presetGrid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.presetItem {
  position: relative;
  height: 54px;
  border: 1px solid transparent;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color .18s ease, transform .18s ease;

  &:hover { transform: translateY(-1px); }
}
.presetActive {
  border-color: rgba(255, 255, 255, .9);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, .9) inset;
}
.presetName {
  position: absolute;
  left: 6px;
  bottom: 4px;
  font-size: 10px;
  color: rgba(255, 255, 255, .92);
  text-shadow: 0 1px 3px rgba(0, 0, 0, .7);
}
.styleGrid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.styleItem {
  display: flex;
  flex-flow: column nowrap;
  align-items: center;
  gap: 5px;
  padding: 10px 4px;
  border: 1px solid rgba(255, 255, 255, .12);
  border-radius: 9px;
  background: rgba(255, 255, 255, .05);
  color: #fff;
  cursor: pointer;
  transition: border-color .18s ease, background-color .18s ease;

  &:hover { background: rgba(255, 255, 255, .1); }
}
.styleActive {
  border-color: var(--color-primary);
  background: rgba(255, 255, 255, .14);
}
.styleSample {
  font-size: 16px;
  font-weight: 700;
  line-height: 1;
}
.styleName {
  font-size: 11px;
  opacity: .75;
}
.styleHint {
  font-size: 11px;
  opacity: .5;
}

/* 字号缩放（只作用于歌词列，不缩放面板） */
.lyricColumn {
  --lyric-scale: 1;
}
.line_active {
  font-size: calc(clamp(30px, 4.6vw, 58px) * var(--lyric-scale, 1));
}

/* ── 歌词样式变体 ───────────────────────────────────────────── */
/* 流光：活动行有扫光 + 更强辉光 */
.root[data-lyric-style="flow"] {
  .line_active {
    text-shadow: 0 0 32px rgba(160, 130, 255, .55), 0 8px 48px rgba(120, 96, 220, .45);

    :global(.fillText),
    :deep(.fillText) {
      background-image: linear-gradient(
        100deg,
        #fff 0%,
        #d9ccff 38%,
        #fff 50%,
        #d9ccff 62%,
        #fff 100%
      );
      background-size: 220% 100%;
      animation: flowSheen 3.4s linear infinite;
      -webkit-background-clip: text;
    }
  }
}
@keyframes flowSheen {
  0% { background-position: 120% 0; }
  100% { background-position: -120% 0; }
}

/* 隐现：非活动行几乎隐去 */
.root[data-lyric-style="fade"] {
  .line_prev,
  .line_next {
    opacity: .16;
    filter: blur(.4px);
  }
  .line_active {
    text-shadow: 0 10px 60px rgba(0, 0, 0, .55);
  }
}

/* 云阶：行左右错开，形成阶梯 */
.root[data-lyric-style="cloud"] {
  .lyricColumn { align-items: flex-start; padding-left: 8%; }
  .line:nth-child(odd) { transform: translateX(6%); }
  .line:nth-child(even) { transform: translateX(-2%); }
  .line_active { transform: translateX(0); }
}

/* 群唱：活动行更大、字距拉开，其余行也偏大 */
.root[data-lyric-style="chorus"] {
  .line_active {
    font-size: calc(clamp(34px, 5.4vw, 68px) * var(--lyric-scale, 1));
    letter-spacing: .06em;
  }
  .line_prev,
  .line_next {
    font-size: clamp(18px, 2.1vw, 26px);
    letter-spacing: .04em;
  }
}

/* 莫奈：非活动行柔焦，整体像油画 */
.root[data-lyric-style="monet"] {
  .line_prev,
  .line_next {
    filter: blur(1.6px) saturate(1.2);
    opacity: .3;
  }
  .line_active {
    filter: saturate(1.15);
    text-shadow: 0 0 40px rgba(200, 180, 255, .5), 0 10px 50px rgba(0, 0, 0, .5);
  }
}

</style>
