<template>
  <p v-if="line.words" :class="$style.words">
    <!-- 逐字：填充比例直接由真实时间算出（getWordFill），
         :style 里的自定义属性不带缓动，音乐停它就停 -->
    <span
      v-for="(word, wi) in line.words"
      :key="wi"
      :class="[$style.word, $style['word_' + getWordState(word, nowMs)], $style.fillText]"
      :data-word-state="getWordState(word, nowMs)"
      :style="{ '--ilus-fill': getWordFill(word, nowMs) }"
    >{{ word.text }}</span>
  </p>
  <p
    v-else
    :class="[$style.text, $style.fillText]"
    :style="{ '--ilus-fill': fill }"
  >{{ line.text }}</p>
  <p v-if="line.translation" :class="$style.translation">{{ line.translation }}</p>
</template>

<script>
import { getWordState } from '@renderer/core/immersiveLyric/timeline'
import { getWordFill } from '@renderer/core/immersiveLyric/fill'

/**
 * 一行歌词的内容渲染（L1 拆分自 index.vue）
 *
 * 只画「这一行长什么样」：逐字/整句两种形态、填充推进、翻译。
 * 行的容器（`.line` 与 active/prev/next 状态类、错位、进出场）留在 classic.vue ——
 * 那些规则与 `.leaveActive` 的 position 覆盖处在同一张样式表里，拆开会让层叠顺序变得不可证，
 * 而 L1 的第一优先级是零视觉回归。
 *
 * 时间只从 props 拿，不读 audio、不碰 rAF。
 */
export default {
  name: 'LyricLineView',
  props: {
    line: {
      type: Object,
      required: true,
    },
    nowMs: {
      type: Number,
      required: true,
    },
    /** 整句模式的填充比例（有逐字时间戳时由字级各自计算，这里不用） */
    fill: {
      type: Number,
      default: 0,
    },
  },
  setup() {
    return { getWordState, getWordFill }
  },
}
</script>

<style lang="less" module>
.text {
  margin: 0;
}

.words {
  margin: 0;
}

// ── 色块 / 填充推进（第三阶段核心）────────────────────────────────
// 做法：整条背景渐变铺满，断点位置由 --ilus-fill（0~1，真实播放时间算出）决定，
// 再用 background-clip: text 把渐变裁进字形 —— 「已唱/未唱」同时可见，
// 不需要复制一层文字节点，也不需要 CSS animation（那样暂停就不会停）。
.fillText {
  background-image: linear-gradient(
    90deg,
    #fff 0,
    #fff calc(var(--ilus-fill, 0) * 100%),
    rgba(255, 255, 255, .42) calc(var(--ilus-fill, 0) * 100%),
    rgba(255, 255, 255, .42) 100%
  );
  background-repeat: no-repeat;
  background-size: 100% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

// 万一碰到不支持 background-clip: text 的环境，透明字会直接看不见 —— 必须兜住，
// 宁可退化成第二阶段的「整段变色」，也不能出现空白。
@supports not ((-webkit-background-clip: text) or (background-clip: text)) {
  .fillText {
    background-image: none;
    -webkit-text-fill-color: currentColor;
    color: rgba(255, 255, 255, .85);
  }
}

.word {
  transition: opacity .18s ease;
}

// 文字颜色已经交给上面的渐变管了，这三个状态只留作状态钩子（测试与后续阶段要用）。
.word_done {
  opacity: 1;
}

.word_active {
  opacity: 1;
}

.word_todo {
  opacity: 1;
}

.translation {
  margin: 6px 0 0;
  font-size: 18px;
  font-weight: 400;
  opacity: .62;
}
</style>
