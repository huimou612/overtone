import { watch } from '@common/utils/vueTools'
import { isPersonalMode } from '@renderer/store'
import { musicInfo } from '@renderer/store/player/state'
import { setShowPlayerDetail } from '@renderer/store/player/action'

/**
 * 个性模式的启动行为：有当前歌曲就直接进播放详情页
 *
 * 用 watch + 一次性标志，而不是在 initPlayer() 之后直接判断当前歌曲：
 * 歌曲是被 initPlayer() 异步恢复回来的，写在那后面就得自己猜它什么时候到；
 * watch 无论数据先到还是后到都能接住。
 *
 * 标志位保证只自动进一次 —— 用户手动把播放页关掉之后再切歌，不该被反复弹回来。
 */
export default () => {
  let restored = false

  watch(musicInfo, info => {
    if (restored || !isPersonalMode.value || !info.id) return
    restored = true
    setShowPlayerDetail(true)
  }, { immediate: true })
}
