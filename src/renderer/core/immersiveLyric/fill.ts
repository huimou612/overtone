/**
 * 沉浸式歌词的「填充比例」计算（第三阶段：色块动画）。
 *
 * ⚠️ 为什么单独开一个文件：
 *   timeline.ts 是第二阶段验收过的**解析规则**，本阶段一个字都不能碰；
 *   而这里全是纯视觉换算，两者职责不同，混在一起迟早要改坏那边。
 *
 * ⚠️ 关键约束：这里没有任何「当前时间」的来源 —— 全部靠调用方把真实播放进度
 *   （nowMs，来自 player.getCurrentTime()）传进来。
 *   没有定时器、没有 performance.now()、没有 requestAnimationFrame、没有 CSS animation 时长：
 *   ① 暂停时调用方不再更新 nowMs → 填充自然冻结在正确位置，不用额外处理；
 *   ② 拖进度/切歌时 nowMs 一变，填充瞬间到位，不存在缓动追赶；
 *   ③ 动画永远不会跑在音乐前面或后面，因为它本身就是音乐时间的函数。
 */
import type { ImmersiveLyricWord } from './timeline'

/** 单个字（词）的演唱填充比例，0=还没唱，1=已唱完 */
export const getWordFill = (word: ImmersiveLyricWord, timeMs: number): number => {
  // 极少数音源会给出 duration=0（可选字段缺失被兜底成 0）：视作「到点即整段点亮」，
  // 不除零，也不假装它有渐变过程
  if (!word.duration) return timeMs >= word.start ? 1 : 0
  const progress = (timeMs - word.start) / word.duration
  if (progress <= 0) return 0
  if (progress >= 1) return 1
  return progress
}

/**
 * 整行的演唱填充比例。**只有这一行没有逐字时间戳时才用它** —— 有逐字就必须走逐字；
 * 反过来（没有逐字却按「字」去填充）就是在伪造逐字时间轴，那是明令禁止的。
 *
 * maxRateMs 是**视觉层面的速率上限**：两行之间隔了很长间奏时，如果老老实实按真实间隔铺，
 * 色块会在十来秒里几乎不动，看着像卡住了。超过这个上限的行按上限铺满。
 * ⚠️ 它只影响「色块铺多快」，不参与任何定位判定，也没有改动时间轴的任何数字。
 */
export const getLineFill = (
  lineTime: number,
  nextTime: number | null | undefined,
  timeMs: number,
  maxRateMs = 4000,
): number => {
  if (timeMs <= lineTime) return 0
  const duration = nextTime == null
    ? maxRateMs
    : Math.min(Math.max(nextTime - lineTime, 0) || maxRateMs, maxRateMs)
  if (!duration) return 1
  const progress = (timeMs - lineTime) / duration
  return progress >= 1 ? 1 : progress
}
