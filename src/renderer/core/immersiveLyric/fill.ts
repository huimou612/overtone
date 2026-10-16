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

/**
 * 「可用的渐变区间」判定：必须是**有限正数**。
 * duration 为 0 / 负数 / NaN / Infinity、或字段缺失时，都不足以构成一条可信的时间轴。
 */
const isUsableDuration = (value: number): boolean => Number.isFinite(value) && value > 0

/** 单个字（词）的演唱填充比例，0=还没唱，1=已唱完 */
export const getWordFill = (word: ImmersiveLyricWord, timeMs: number): number => {
  // duration 不可用（0 / 负数 / NaN / Infinity / 字段缺失）→ 没有任何可信的渐变区间：
  // 既不做除法（避免除零、负比例、NaN），也**绝不在起点之前给出任何正向填充**，
  // 统一退回「到点即整段点亮」。这正是原先只有 duration=0 才走的那条分支，
  // 现在把「负时长」也并进来 —— 负时长同样无法定义渐变，不该在起点前就有色块。
  if (!isUsableDuration(word.duration)) return timeMs >= word.start ? 1 : 0
  const progress = (timeMs - word.start) / word.duration
  // !(progress > 0) 同时覆盖 progress <= 0 与 progress 为 NaN（timeMs 异常时也不外泄 NaN）
  if (!(progress > 0)) return 0
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
 *
 * ── 无效时长的行为约定（第七阶段收紧）──────────────────────────────
 * 这里的「时长」有两处来源，都要求是**有限正数**才算可用：
 *   ① 本行到下一行的间隔（nextTime - lineTime）；
 *   ② 兜底上限 maxRateMs。
 * 不可用时（缺下一行、时间戳乱序/相等、NaN、0、负数）统一退回 maxRateMs；
 * 若 maxRateMs 本身也不可用，则视为「立即铺满」返回 1（沿用改动前 `!duration → 1` 的语义），
 * 换算过程绝不产生除零、负比例或 NaN。合法正时长的结果与改动前**完全一致**。
 */
export const getLineFill = (
  lineTime: number,
  nextTime: number | null | undefined,
  timeMs: number,
  maxRateMs = 4000,
): number => {
  // !(timeMs > lineTime) 同时覆盖 timeMs <= lineTime 与 timeMs 为 NaN 的情况
  if (!(timeMs > lineTime)) return 0

  // 下一行的时间差才是这一行的真实演唱区间；差值为 0 / 负数 / 非有限都不可用，退回 maxRateMs
  const gap = nextTime == null ? NaN : nextTime - lineTime
  const duration = isUsableDuration(gap) ? Math.min(gap, maxRateMs) : maxRateMs

  // maxRateMs 自身不可用（0 / 负数 / 非有限）→ 没有可信区间，视为「立即铺满」
  if (!isUsableDuration(duration)) return 1

  const progress = (timeMs - lineTime) / duration
  return progress >= 1 ? 1 : progress
}
