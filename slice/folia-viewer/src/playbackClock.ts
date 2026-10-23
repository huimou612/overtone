// 锚点 + 插值播放时钟（计划 P3 的 P1 实现）。
//
// 桥下发的 progress 是低频增量快照，直接驱动逐帧动画必然抖动/漂移。
// 这里每次收到消息打一个锚点 { progress, performance.now(), rate, playing }，
// 帧循环里以锚点 + 本地流逝 × 倍率推算当前进度；暂停时冻结。
// 新锚点到达且画面时间与锚点误差 >= 80ms（seek / 切歌）时直接跳齐，
// < 80ms 时不校正（避免无谓的一帧跳动；误差会被下一帧的新锚点继续收敛）。
//
// 时钟每帧把时间写进 framer-motion MotionValue —— 切片运行时正是订阅
// currentTime.on('change') 来唤醒帧循环的（见 createLatticeLyricRuntime）。

import { MotionValue } from 'framer-motion';
import type { FoliaPlayerData } from './bridge';

export interface ClockAnchor {
  /** 锚点处的播放进度（秒） */
  progressSec: number;
  /** 锚点时刻的 performance.now()（毫秒） */
  atMs: number;
  playbackRate: number;
  playing: boolean;
}

const SNAP_THRESHOLD_SEC = 0.08;

export class PlaybackClock {
  /** 喂给切片的当前时间（秒）。同一实例终身不变 —— 切片按对象身份缓存 runtime。 */
  readonly time = new MotionValue(0);
  private anchor: ClockAnchor = { progressSec: 0, atMs: 0, playbackRate: 1, playing: false };
  private raf = 0;
  private running = false;
  private destroyed = false;
  private visibilityHandler: (() => void) | null = null;

  /** 供 React 层读取的播放状态（粗粒度即可：paused 用于 context 的 paused 字段）。 */
  isPlaying = false;

  /** 收到一份（合并后的）播放状态时打锚点。 */
  applyState(state: FoliaPlayerData): void {
    const playing = state.status === 'playing';
    const now = performance.now();
    const predicted = this.predictAt(now);
    const incoming = Number.isFinite(state.progress) ? state.progress : 0;
    const drift = Math.abs(incoming - predicted);
    // 误差小且仍在播放同一首：保持旧锚点，避免每条增量消息都让画面顿一下。
    const keepAnchor = playing && this.anchor.playing && drift < SNAP_THRESHOLD_SEC;
    if (!keepAnchor) {
      this.anchor = {
        progressSec: incoming,
        atMs: now,
        playbackRate: state.playbackRate || 1,
        playing,
      };
    } else if ((state.playbackRate || 1) !== this.anchor.playbackRate) {
      // 倍率变化：以当前画面时间为新锚点换率，不能跳
      this.anchor = { progressSec: predicted, atMs: now, playbackRate: state.playbackRate || 1, playing };
    }
    this.isPlaying = playing;
    this.tick();
    if (playing) this.startLoop();
  }

  private predictAt(nowMs: number): number {
    const a = this.anchor;
    if (!a.playing) return a.progressSec;
    return a.progressSec + ((nowMs - a.atMs) / 1000) * a.playbackRate;
  }

  private tick = (): void => {
    this.time.set(this.predictAt(performance.now()));
  };

  private loop = (): void => {
    if (!this.running) return;
    this.tick();
    this.raf = requestAnimationFrame(this.loop);
  };

  private startLoop(): void {
    if (this.running || this.destroyed || document.hidden) return;
    this.running = true;
    this.raf = requestAnimationFrame(this.loop);
  }

  private stopLoop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** 页面可见性管理：隐藏时停 rAF（计划 P3），恢复时重新对齐锚点并续跑。 */
  bindVisibility(onVisibleAgain: () => void): void {
    this.visibilityHandler = () => {
      if (document.hidden) {
        this.stopLoop();
      } else if (!this.destroyed) {
        onVisibleAgain();
        this.tick();
        if (this.anchor.playing) this.startLoop();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  destroy(): void {
    this.destroyed = true;
    this.stopLoop();
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }
}
