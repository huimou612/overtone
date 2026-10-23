// 桥缺席时（普通浏览器 / vite preview 打开）的内置演示歌曲。
// 用途：视觉冒烟测试 + 无宿主联调 —— 页面永远不该是一块黑屏。
// 歌词为占位文本（公有领域风格的自造行 + 逐字时间），不携带任何真实歌曲数据。

import type { FoliaPlayerData } from './bridge';

/** 构造 lxlyric 格式行：每个字一个 <startMs,durationMs> 段。 */
const lxLine = (timeTag: string, text: string, wordMs = 320): string => {
  let offset = 0;
  const segs = Array.from(text).map((ch) => {
    const seg = `<${offset},${wordMs}>${ch}`;
    offset += wordMs;
    return seg;
  }).join('');
  return `${timeTag}${segs}`;
};

const MOCK_LYRIC = [
  lxLine('[00:01.00]', '夜色把城市轻轻点亮'),
  lxLine('[00:05.20]', '霓虹在窗上流淌'),
  lxLine('[00:09.40]', '我们沿着河岸慢慢走'),
  lxLine('[00:13.60]', '风把故事吹向远方'),
  lxLine('[00:17.80]', '星光落进你的眼里'),
  lxLine('[00:22.00]', '时间在此刻停靠'),
  lxLine('[00:26.20]', '啦啦啦 唱给夜晚听'),
  lxLine('[00:30.40]', '啦啦啦 唱给梦乡听'),
].join('\n');

const MOCK_TLYRIC = [
  '[00:01.00]Night softly lights the city',
  '[00:05.20]Neon flows across the window',
  '[00:09.40]We walk slowly by the river',
  '[00:13.60]Wind carries stories afar',
  '[00:17.80]Starlight falls into your eyes',
  '[00:22.00]Time anchors in this moment',
  '[00:26.20]La la la, sing to the night',
  '[00:30.40]La la la, sing to the dreams',
].join('\n');

export const MOCK_SNAPSHOT: FoliaPlayerData = {
  status: 'playing',
  name: '夜色漫步（演示）',
  singer: 'Folia Viewer Mock',
  album: 'Smoke Test',
  pic: '',
  progress: 0,
  duration: 35,
  playbackRate: 1,
  lyric: MOCK_LYRIC,
  tlyric: MOCK_TLYRIC,
  lxlyric: MOCK_LYRIC,
};

/** mock 模式进度回绕间隔（毫秒）：播完后从 0 重来，方便持续观察动画。 */
export const MOCK_LOOP_MS = 35_000;
