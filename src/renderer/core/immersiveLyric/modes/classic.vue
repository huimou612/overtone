<template>
  <div :class="$style.lyricColumn">
    <!-- 进出场交给 <TransitionGroup>：窗口滚动时新行淡入上浮、离场行淡出，
         时长刻意压到 0.22s / 0.18s —— 歌词不能滞后于音乐，宁可朴素也不能拖。
         ⚠️ 不用项目里常见的 'animated fadeIn' 那套全局类：animate.css 的关键帧里写了
         transform，会把按行状态设置的错位旋转覆盖掉，而且它的默认时长是 1s。 -->
    <TransitionGroup
      :enter-from-class="$style.enterFrom"
      :enter-active-class="$style.enterActive"
      :leave-active-class="$style.leaveActive"
      :leave-to-class="$style.leaveTo"
    >
      <div
        v-for="item in visibleLines"
        :key="`${keyPrefix}-${item.index}`"
        :class="[$style.line, $style['line_' + item.state]]"
        :data-state="item.state"
        :data-index="item.index"
        :style="{ '--ilus-shift': `${item.shift}px` }"
      >
        <lyric-line-view :line="item.line" :now-ms="nowMs" :fill="item.fill" />
      </div>
    </TransitionGroup>
  </div>
</template>

<script>
import { computed } from '@common/utils/vueTools'
import { getLineFill } from '@renderer/core/immersiveLyric/fill'
import LyricLineView from '@renderer/components/layout/ImmersiveLyric/stage/LyricLineView.vue'

/**
 * 经典模式（L1 唯一注册的视觉模式）
 *
 * 职责：决定「一次显示哪几行、每行是什么状态、错位多少、整句填充多少」，
 * 以及行容器的外观（字号/透明度/旋转/色块/进出场）。
 * 行的内部文字由 stage/LyricLineView.vue 画。
 *
 * 契约（L4 新增模式照这个来）：
 *   props: lines / activeIndex / nowMs / keyPrefix
 *   · 只消费 props 里的时间，**不读 audio、不自建 rAF**（时钟只有一个，在 index.vue）；
 *   · 根元素必须是 `.lyricColumn` 这一层（即 lyricArea 的直接子元素），以便各模式互换布局。
 */
export default {
  name: 'ClassicImmersiveMode',
  components: { LyricLineView },
  props: {
    /** ImmersiveLyricLine[]，已排序、时间已含 offset */
    lines: {
      type: Array,
      required: true,
    },
    /** 当前行索引，-1 表示还没唱到第一行（前奏） */
    activeIndex: {
      type: Number,
      required: true,
    },
    /** 当前播放时间（ms） */
    nowMs: {
      type: Number,
      required: true,
    },
    /** 这首歌的稳定前缀，用于切歌时强制重建行节点 */
    keyPrefix: {
      type: String,
      default: 'none',
    },
  },
  setup(props) {
    // 错位量表（px）：只跟**行自身的序号**挂钩，跟窗口位置无关 —— 窗口向下滑一格时，
    // 留下的那几行拿到的仍是自己那份错位，不会集体跳一下。
    const SHIFT_TABLE = [0, 10, 20, 6]

    const visibleLines = computed(() => {
      const lines = props.lines
      if (!lines.length) return []
      const base = props.activeIndex < 0 ? 0 : props.activeIndex
      const start = Math.max(0, base - 1)
      const end = Math.min(lines.length, start + 4)
      const list = []
      for (let index = start; index < end; index++) {
        const line = lines[index]
        list.push({
          index,
          line,
          state: index === props.activeIndex ? 'active' : (index < props.activeIndex ? 'prev' : 'next'),
          shift: SHIFT_TABLE[index % SHIFT_TABLE.length],
          // 整行填充只在**没有逐字时间戳**时才算；有逐字时逐个字算（见 LyricLineView）。
          // 这里是纯粹的时间函数，没有任何缓动，所以拖进度/暂停都能立刻到位。
          fill: line.words
            ? 0
            : getLineFill(line.time, lines[index + 1]?.time, props.nowMs),
        })
      }
      return list
    })

    return { visibleLines }
  },
}
</script>

<style lang="less" module>
// 歌词状态切换的节奏（行错位、旋转、色块淡入）。
// 只有「切换的那一瞬间」会动一下，跟播放帧率无关，也不参与任何定位判定。
@ilus-dur: .26s;
@ilus-ease: cubic-bezier(.22, .61, .36, 1);

.lyricColumn {
  width: 100%;
  display: flex;
  flex-flow: column nowrap;
  align-items: flex-start;
  gap: 20px;
}

.line {
  position: relative;
  max-width: 100%;
  line-height: 1.45;
  word-break: break-word;
  // 错位/旋转都以行状态的形式写在 transform 上，交给浏览器合成去做；
  // 只有行切换的那一瞬间才会触发一次重排（字号变化），不是每帧都在算布局。
  transform-origin: left center;
  transition: opacity @ilus-dur @ilus-ease, transform @ilus-dur @ilus-ease;
  // ⚠️ 关键：强制本行自成「层叠上下文」。
  // 当前行身下的色块（::before, z-index:-1）要落在「文字之下、背景暗幕之上」，
  // 前提是 .line 自己是个层叠上下文。正常模式下 translateX 顺带创造了这个上下文，
  // 但 reduced-motion 下 transform:none 会把上下文撤掉，色块就会沉到 .bgMask 之下被遮住
  // （实测截图 24 缺块即此因）。isolation:isolate 不依赖 transform，两种模式都兜住。
  isolation: isolate;
}

// 当前行是焦点，其余弱化但不隐藏：滚动/跟读都需要看到上下文。
// 错位量 --ilus-shift 跟「行自己的序号」绑定（见 SHIFT_TABLE），窗口滑动时不会整排跳。
.line_active {
  font-size: 42px;
  font-weight: 800;
  letter-spacing: .4px;
  opacity: 1;
  transform: translateX(var(--ilus-shift, 0));

  // 「色块」本体：当前行身下那块主色底。
  // 主色在暗幕上够醒目，但透明度压到很淡 —— 逐字推进的高亮是白色，两者叠着仍要读得清。
  &::before {
    content: '';
    position: absolute;
    top: -.14em;
    bottom: -.14em;
    left: -.5em;
    right: -.5em;
    z-index: -1;
    border-radius: 10px;
    background-color: var(--color-primary, #4facfe);
    opacity: .22;
    transition: opacity @ilus-dur @ilus-ease;
  }
}

.line_next {
  font-size: 26px;
  opacity: .46;
  transform: translateX(var(--ilus-shift, 0)) rotate(.55deg);
}

.line_prev {
  font-size: 26px;
  opacity: .3;
  transform: translateX(var(--ilus-shift, 0)) rotate(-.7deg);
}

// ── 进场 / 退场 ──────────────────────────────────────────────────
// ⚠️ 刻意只用 opacity + translate（独立位移属性），不碰 transform：
//    transform 上挂着按行状态的错位与旋转，关键帧里再写一次会把它整个覆盖掉，
//    动画结束的瞬间就会「啪」地跳回错位位置。translate 与 transform 是叠加关系。
// 时长压到 0.22s / 0.18s：歌词不能滞后于音乐，宁可朴素。
@keyframes immersiveLineIn {
  from {
    opacity: 0;
    translate: 0 14px;
  }

  to {
    opacity: 1;
    translate: 0 0;
  }
}

@keyframes immersiveLineOut {
  from {
    opacity: 1;
    translate: 0 0;
  }

  to {
    opacity: 0;
    translate: 0 -10px;
  }
}

.enterActive {
  animation: immersiveLineIn .22s @ilus-ease both;
}

// 退场行脱离文档流：否则它会在 0.18s 里继续占着位置，走完之后整列才猛地往上跳一下
.leaveActive {
  position: absolute;
  width: 100%;
  animation: immersiveLineOut .18s ease both;
}

// ── 减少动态效果 ─────────────────────────────────────────────────
// 系统开了「减少动态效果」就给静态版：去掉位移、旋转、错位和进出场，
// 但**保留状态本身**（当前行依然醒目、色块依然在）—— 那是阅读需要的信息，不是装饰。
@media (prefers-reduced-motion: reduce) {
  .line {
    transition: none;
  }

  .line_active,
  .line_prev,
  .line_next {
    transform: none;
  }

  .line_active::before {
    transition: none;
  }

  .enterActive,
  .leaveActive {
    animation: none;
  }
}
</style>
