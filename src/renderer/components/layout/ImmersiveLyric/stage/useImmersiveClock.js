import { ref, watch, onMounted, onBeforeUnmount } from '@common/utils/vueTools'
import { isPlay } from '@renderer/store/player/state'
import {
  getCurrentTime,
  onPlaying,
  onPause,
  onEnded,
  onEmptied,
  onTimeupdate,
  isEmpty,
} from '@renderer/plugins/player'

/**
 * 沉浸式歌词的时钟（L1 从 index.vue 原样抽出，行为不变）
 *
 * 这段代码是从第三～七阶段真机验出来的，**逻辑一行都没改**，只是从组件的 setup
 * 搬进可复用函数，好让「舞台」和「视觉模式」共用同一个时间源：
 *   · 不另造时钟：每一帧都去读现有播放器里那枚 audio 元素的 currentTime；
 *   · 播放中才跑 rAF；暂停/停止/卸载立即停；
 *   · setProgress（拖动进度）与 musicToggled（切歌）到达时补一次同步。
 *
 * ⚠️ 必须在组件 setup 里调用：internal 用了 watch / onMounted / onBeforeUnmount，
 *    挂到当前组件实例上。调用点目前只有 components/layout/ImmersiveLyric/index.vue。
 *
 * @param {import('vue').Ref<boolean>|import('vue').ComputedRef<boolean>} isVisible 沉浸视图是否打开
 */
export default isVisible => {
  const nowMs = ref(0)

  const syncTime = () => {
    nowMs.value = getCurrentTime() * 1000
  }

  let rafId = null
  const tick = () => {
    syncTime()
    rafId = window.requestAnimationFrame(tick)
  }
  const startLoop = () => {
    if (rafId != null) return
    syncTime()
    rafId = window.requestAnimationFrame(tick)
  }
  const stopLoop = () => {
    if (rafId == null) return
    window.cancelAnimationFrame(rafId)
    rafId = null
    syncTime()
  }

  // ⚠️ 这里**只用**可见性，不看 store 里的 isPlay：
  //    isPlay 是应用自己的一份副本，播放失败/被接管时会被置回 false，
  //    而 audio 其实还在走 —— 拿它当开关会把刚启动的循环立刻停掉
  //    （实测症状：播放推进中歌词不动，一暂停反而跳到正确位置）。
  //    播放状态一律以 audio 元素的 playing / pause / ended / emptied 为准。
  watch(isVisible, isOpen => {
    if (isOpen) startLoop()
    else stopLoop()
  })

  // ── 事件订阅 ──────────────────────────────────────────────────────
  // 循环的开关挂在 **audio 元素自己的** playing / pause / ended / emptied 上。
  // 这是播放状态的唯一真相来源 —— store 里的 isPlay 是一条可能滞后的副本。
  const handleSetProgress = () => {
    syncTime()
  }
  const handleMusicToggled = () => {
    syncTime()
  }
  const handleLyricUpdated = () => {
    syncTime()
  }
  const handlePlaying = () => {
    startLoop()
  }
  const handleStopped = () => {
    stopLoop()
  }
  const handleEmptied = () => {
    // ⚠️ emptied 有两种来源，不能一律当成「播放器空了」：
    //    ① setResource 换资源时会顺带触发一次 emptied（此刻 src 其实已经换成新的）；
    //    ② 真的 setStop() 才把 src 清空。
    //    一律停循环的话，① 之后如果没有 playing 事件到达（实测在某些机器上
    //    play() 会先 error→emptied 再真正起播，playing 事件根本不来），歌词就卡死了。
    //    所以只有 isEmpty() 为真（src 真的没了）才收工，否则只补一次同步。
    if (isEmpty()) {
      stopLoop()
      nowMs.value = 0
    } else {
      syncTime()
    }
  }

  // ── 看门狗（1Hz）───────────────────────────────────────────────────
  // 光靠事件不够：上面那种「error→emptied→真正起播但没有 playing 事件」的时序
  // 会让循环停掉后再也拉不起来。所以挂一条低频心跳做兜底：
  //   · 只在「视图开着且循环没在跑」时才读一次 currentTime，别的时候不做任何事
  //     —— 不烧 CPU，也不跟 rAF 抢活；
  //   · 判据是「累计读到 2 次时间在前进」才把循环拉起来。
  //     真暂停时时间不动 → 累计永远是 0 → 永不误启；
  //     拖进度只造成一次跳变 → 只累计 1 次 → 也不会误启。
  //     ⚠️ 必须是**累计**而不是「连续两次」：实测本机音频时间是跳变式推进的
  //     （5s → 9s → 14s → 17s，中间隔一两次心跳完全不动），
  //     写成「连续」会因为中间那一次不动而清零，永远凑不满。
  //   · 它不另造时钟：时间仍然只有一个来源 —— getCurrentTime()。
  let heartbeatId = null
  let lastSeenTime = -1
  let advanceHits = 0
  const heartbeat = () => {
    if (!isVisible.value) { advanceHits = 0; lastSeenTime = -1; return }
    if (rafId != null) { lastSeenTime = getCurrentTime(); advanceHits = 0; return }
    const time = getCurrentTime()
    if (lastSeenTime >= 0 && time > lastSeenTime + 0.05) advanceHits++
    lastSeenTime = time
    if (advanceHits >= 2) {
      advanceHits = 0
      startLoop()
    }
  }

  let removePlaying = null
  let removePause = null
  let removeEnded = null
  let removeEmptied = null
  let removeTimeupdate = null

  onMounted(() => {
    window.app_event.on('setProgress', handleSetProgress)
    window.app_event.on('musicToggled', handleMusicToggled)
    window.app_event.on('lyricUpdated', handleLyricUpdated)

    removePlaying = onPlaying(handlePlaying)
    removePause = onPause(handleStopped)
    removeEnded = onEnded(handleStopped)
    removeEmptied = onEmptied(handleEmptied)
    // ⚠️ 补一条 timeupdate 兜底（约 4Hz）：窗口被盖住/停合成时 Chromium 不跑 rAF，
    //    而 media 的 timeupdate 照常触发。这样就算没有帧，歌词也不会停在原地。
    //    帧正常时 rAF 负责平滑，这条只当下限，不会和它打架（读到的是同一个 currentTime）。
    removeTimeupdate = onTimeupdate(syncTime)

    syncTime()
    if (isVisible.value && isPlay.value) startLoop()
    heartbeatId = window.setInterval(heartbeat, 1000)
  })

  onBeforeUnmount(() => {
    window.app_event.off('setProgress', handleSetProgress)
    window.app_event.off('musicToggled', handleMusicToggled)
    window.app_event.off('lyricUpdated', handleLyricUpdated)

    removePlaying?.()
    removePause?.()
    removeEnded?.()
    removeEmptied?.()
    removeTimeupdate?.()

    if (heartbeatId != null) {
      window.clearInterval(heartbeatId)
      heartbeatId = null
    }
    stopLoop()
    nowMs.value = 0
  })

  return { nowMs, syncTime }
}
