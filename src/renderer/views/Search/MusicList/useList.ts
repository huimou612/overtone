import { LIST_IDS } from '@common/constants'
import { ref } from '@common/utils/vueTools'
import { playList } from '@renderer/core/player/action'
import { getListMusics, addListMusics } from '@renderer/store/list/action'
import { addHistoryWord } from '@renderer/store/search/action'
// import { useI18n } from '@renderer/plugins/i18n'
// import { } from '@renderer/store/search/state'
import { search as searchMusic, listInfos, type ListInfo } from '@renderer/store/search/music'
import { assertApiSupport } from '@renderer/store/utils'

export type SearchSource = LX.OnlineSource | 'all'

export default () => {
  const listRef = ref<any>(null)

  const listInfo = ref<ListInfo>({
    page: 1,
    maxPage: 0,
    limit: 30,
    total: 0,
    list: [],
    key: null,
    noItemLabel: '',
  })

  const search = (text: string, source: SearchSource, page: number) => {
    // 兜底：source 指向一个没有 state 的源时（内置源已删除，见 utils/musicSdk/index.js），
    // 直接赋值会给模板一个 undefined，造成 `listInfo.page` 抛 TypeError。
    listInfo.value = listInfos[source] ?? listInfos.all
    if (text.length) void addHistoryWord(text)
    void searchMusic(text, page, source).then((list: LX.Music.MusicInfo[]) => {
      if (list.length) {
        setTimeout(() => {
          if (listRef.value) listRef.value.scrollToTop()
        })
      }
    })
  }

  const handlePlayList = async(index: number) => {
    let targetSong = listInfo.value.list[index]

    if (!assertApiSupport(targetSong.source)) return

    const defaultListMusics = await getListMusics(LIST_IDS.DEFAULT)

    await addListMusics(LIST_IDS.DEFAULT, [targetSong])

    let targetIndex = defaultListMusics.findIndex(s => s.id === targetSong.id)
    if (targetIndex > -1) playList(LIST_IDS.DEFAULT, targetIndex)
  }

  return {
    listRef,
    listInfo,
    search,
    handlePlayList,
  }
}
