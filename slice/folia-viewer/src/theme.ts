// 切片 Theme 的宿主供给（P1 版）。
//
// P1 先用一份与 Folia 深色舞台同气质的内置深色主题；歌曲封面到达后，
// 用离屏 canvas 采样主色替换 accent/primary（照 Folia「从封面派生主题」
// 的方向，但只做一次平均色调制，完整的 AI/内置主题生成在后续阶段）。
// 采样失败（跨域/无图）时静默保留默认主题。

import type { Theme } from '../../lattice-lyrics/src/types';

export const DEFAULT_THEME: Theme = {
  name: 'Folia Dark',
  backgroundColor: '#0c0e13',
  primaryColor: '#e8e6f0',
  accentColor: '#8f7ff5',
  secondaryColor: '#5b5670',
  fontStyle: 'sans',
  fontWeight: 600,
  animationIntensity: 'normal',
};

/** 从封面图采样一个主色，返回 hsl 字符串；失败返回 null。 */
export const sampleCoverColor = (picUrl: string): Promise<string | null> => {
  return new Promise((resolve) => {
    if (!picUrl) { resolve(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 24;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) {
          // 跳过过暗/过亮像素，取“有颜色”的中坚部分
          const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
          if (lum < 24 || lum > 235) continue;
          r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
        }
        if (!n) { resolve(null); return; }
        resolve(`rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`);
      } catch {
        resolve(null); // 跨域污染 canvas 等情况：静默回退
      }
    };
    img.onerror = () => resolve(null);
    img.src = picUrl;
  });
};
