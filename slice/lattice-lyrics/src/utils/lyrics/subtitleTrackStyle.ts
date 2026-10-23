// src/utils/lyrics/subtitleTrackStyle.ts
//
//
// 本文件在阶段 8 的切片提取中被漏掉：monet/monetLyricsModel.ts 静态 import 了它，
// 缺它切片根本无法打包（依赖自洽检查当时未覆盖 monet 模型的这条边）。
// 内容与 Folia 上游（chthollyphile/folia-major）原文逐字一致，未做改动；
// 若日后重跑.git/slice-extract.js，请把本文件纳入提取清单，勿再丢失。

// Shared visual step between the rows of a dual subtitle stack (romanization + translation), so the
// shared bottom overlay and the modes that lay subtitles out inside their own lyric animation
// (Monet, Pendolo) read the same way.

// Second row of the 'both' stack is a step quieter than the first, so romanization (what you sing along to)
// leads and the translation reads as its gloss. Both rows keep the user's subtitle font, weight and scale;
// this only trims size and opacity relative to them.
export const SECONDARY_TRACK_SIZE_FACTOR = 0.88;
export const SECONDARY_TRACK_OPACITY = 0.82;
/** Fallback weight for the second row when the theme sets none; the first row falls back to 500. */
export const SECONDARY_TRACK_FONT_WEIGHT_FALLBACK = 400;
/** Gap above the second row, in em of that row's own font size. */
export const SECONDARY_TRACK_GAP_EM = 0.25;
