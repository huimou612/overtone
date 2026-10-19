<template>
  <section :class="$style.section" data-panel-section="queue">
    <div :class="$style.head">
      <span :class="$style.title">{{ $t('immersive_lyric__queue_title') }}</span>
      <span v-if="!view.isEmpty" :class="$style.count" data-queue-count>{{ view.rows.length }}</span>
    </div>

    <!-- 只读视图的边界说明：列表顺序 ≠ 真实播放顺序 -->
    <p :class="$style.hint" data-queue-hint>{{ $t('immersive_lyric__queue_hint') }}</p>
    <p v-if="view.currentOutsideList" :class="$style.tempHint" data-queue-temp-hint>
      {{ $t('immersive_lyric__queue_temp') }}
    </p>

    <div v-if="view.isEmpty" :class="$style.empty" data-queue-empty>
      {{ $t('immersive_lyric__queue_empty') }}
    </div>
    <div v-else :class="$style.listWrap">
      <base-virtualized-list
        v-slot="{ item }"
        :list="view.rows"
        key-name="rowKey"
        :item-height="44"
        container-class="scroll"
        content-class="list"
      >
        <button
          type="button"
          :class="[$style.row, { [$style.current]: item.isCurrent }]"
          :aria-label="rowLabel(item)"
          :aria-current="item.isCurrent ? 'true' : 'false'"
          :data-queue-index="item.index"
          :data-current="item.isCurrent ? '1' : '0'"
          @click="play(item.index)"
        >
          <span :class="$style.num">{{ item.index + 1 }}</span>
          <span :class="$style.texts">
            <span :class="$style.name">{{ item.music.name }}</span>
            <span :class="$style.singer">{{ item.music.singer }}</span>
          </span>
        </button>
      </base-virtualized-list>
    </div>
  </section>
</template>

<script>
import { computed, onBeforeUnmount, onMounted, ref, watch } from '@common/utils/vueTools'
import { LIST_IDS } from '@common/constants'
import { playInfo, playMusicInfo } from '@renderer/store/player/state'
import { getList } from '@renderer/store/player/action'
import { getListMusics } from '@renderer/store/list/action'
import { playList } from '@renderer/core/player'
import { resolveQueueView } from '@renderer/core/immersiveLyric/panel/queue'

/**
 * 侧栏 · 当前列表（只读队列视图）
 *
 * 数据链路全部复用现有接口：
 *   · 当前列表 id  = playInfo.playerListId（播放器真正在用的那一份）
 *   · 同步读缓存   = store/player/action 的 getList() → getListMusicsFromCache()
 *   · 异步兜底     = store/list/action 的 getListMusics()（未加载时按需取）
 *   · 列表变更     = app_event 'myListUpdate' / 'downloadListUpdate'（**必须**）
 *   · 切歌         = core/player 的 playList(listId, index)
 *
 * ⚠️ `allMusicList` 是 `markRaw(new Map())`，**不是响应式**：不订阅 myListUpdate 的话
 * 增删歌曲后这个面板会一直显示旧数据（这与 views/List 里的做法一致，见 useListInfo.js）。
 *
 * ⚠️ 刻意不做的三件事：不排序（不假装知道真实播放顺序）、不拼接「稍后播放/已播放」、
 * 不改播放器语义。真实下一首的顺序可能不同，由提示文案向用户说明。
 */
export default {
  name: 'PanelQueue',
  setup() {
    const rawList = ref([])
    let refreshToken = 0

    const listId = computed(() => playInfo.playerListId)

    const view = computed(() => resolveQueueView(
      rawList.value,
      listId.value,
      playMusicInfo.musicInfo?.id ?? null,
      playInfo.playIndex,
      playMusicInfo.isTempPlay,
    ))

    const refresh = async() => {
      const id = playInfo.playerListId
      const token = ++refreshToken
      if (!id) {
        rawList.value = []
        return
      }
      // 先在缓存里同步取一次，避免面板打开瞬间闪空态
      let list = getList(id)
      if (!list.length) {
        try {
          list = await getListMusics(id)
        } catch (err) {
          // 列表未下载/读取失败：降级为空态，不把异常抛到面板外
          console.warn('[immersive/panel] 读取列表失败：', id, err)
          list = []
        }
      }
      if (token !== refreshToken) return
      rawList.value = Array.isArray(list) ? list.slice() : []
    }

    const handleListChange = ids => {
      if (!Array.isArray(ids) || !playInfo.playerListId) return
      if (!ids.includes(playInfo.playerListId)) return
      void refresh()
    }

    const handleDownloadListChange = () => {
      if (playInfo.playerListId !== LIST_IDS.DOWNLOAD) return
      void refresh()
    }

    const rowLabel = item => {
      const music = item.music || {}
      return music.singer ? `${music.name ?? ''} - ${music.singer}` : (music.name ?? '')
    }

    const play = index => {
      const id = listId.value
      if (!id) return
      if (!Number.isInteger(index) || index < 0 || index >= view.value.rows.length) return
      playList(id, index)
    }

    watch(listId, () => { void refresh() })

    onMounted(() => {
      void refresh()
      window.app_event.on('myListUpdate', handleListChange)
      window.app_event.on('downloadListUpdate', handleDownloadListChange)
    })

    onBeforeUnmount(() => {
      window.app_event.off('myListUpdate', handleListChange)
      window.app_event.off('downloadListUpdate', handleDownloadListChange)
    })

    return {
      view,
      rowLabel,
      play,
    }
  },
}
</script>

<style lang="less" module>
.section {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-flow: column nowrap;
  padding: 14px 0 0;
}

.head {
  flex: none;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: .2px;
  opacity: .9;
}

.count {
  font-size: 11px;
  opacity: .5;
  font-variant-numeric: tabular-nums;
}

.hint {
  flex: none;
  margin: 6px 0 8px;
  font-size: 11px;
  line-height: 1.55;
  opacity: .45;
}

.tempHint {
  flex: none;
  margin: 0 0 8px;
  font-size: 11px;
  line-height: 1.55;
  opacity: .72;
}

.empty {
  flex: none;
  padding: 18px 0;
  font-size: 12px;
  text-align: center;
  opacity: .45;
}

.listWrap {
  flex: 1 1 auto;
  min-height: 0;
  margin: 0 -8px;
}

.row {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: #fff;
  text-align: left;
  background-color: transparent;
  transition: background-color .15s ease;

  &:hover {
    background-color: rgba(255, 255, 255, .1);
  }
}

.current {
  background-color: var(--color-primary-alpha-100);
}

.num {
  flex: none;
  width: 20px;
  font-size: 11px;
  opacity: .45;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.texts {
  min-width: 0;
  display: flex;
  flex-flow: column nowrap;
  line-height: 1.3;
}

.name {
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.singer {
  font-size: 11px;
  opacity: .5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.current .num {
  opacity: .9;
}
</style>
