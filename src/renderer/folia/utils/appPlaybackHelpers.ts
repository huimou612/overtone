import type { LyricData } from '../types';

// Lab-trimmed copy of folia's src/utils/appPlaybackHelpers.ts — the two pure
// helpers the wall and the chrome actually import.

export const findLatestActiveLineIndex = (lines: LyricData['lines'], time: number) => {
  let fallback = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line || time < line.startTime) {
      continue;
    }
    // 最近一个已经开始的行。歌词间隙（间奏、行尾过渡、长前奏后的空档）里
    // 原先直接返回 -1，云阶 / 绘光 / 花火 等没有内部兜底的样式会整屏不画字，
    // 而时计 / 静止自带 sticky 兜底仍显示上一句 —— 观感就是「有些效果有用有些没用」。
    if (fallback === -1) fallback = index;
    if (time <= (line.renderHints?.renderEndTime ?? line.endTime)) {
      return index;
    }
  }
  // 前奏（还没到第一句）：把第一句作为待唱行，避免样式整屏空着。
  return fallback === -1 && lines.length > 0 ? 0 : fallback;
};

export const formatTime = (time: number) => {
  if (isNaN(time)) return '00:00';
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};
