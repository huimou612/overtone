<template>
  <material-search-input v-model="searchText" :list="tipList" :visible-list="visibleList" @event="handleEvent" />
</template>

<script>
import music from '@renderer/utils/musicSdk'
import { debounce } from '@common/utils'
import {
  ref,
  watch,
  nextTick,
} from '@common/utils/vueTools'
import { useRouter, useRoute } from '@common/utils/vueRouter'
import { appSetting } from '@renderer/store/setting'
import { searchText as _searchText, historyList } from '@renderer/store/search/state'
import { setSearchText, getHistoryList } from '@renderer/store/search/action'
import { getSearchSetting } from '@renderer/utils/data'
import { getList as getHotSearchList, sourceList as hotSourceList } from '@renderer/store/hotSearch'

// ── 搜索联想（记忆词库 + 在线词库）──────────────────────────────────
// 之前的实现有两个致命问题，导致联想下拉彻底不出现：
//  ① `prevTempSearchSource ||= temp_source` 把第一次读到的值永久缓存。盘上的
//     `searchSetting.temp_source` 常是空串（见 OvertoneData/data.json），于是
//     `music['']` 是 undefined，`.tipSearch.search()` 直接抛 TypeError，被
//     debounce 的 async 吞成 unhandled rejection，界面一点提示都没有；
//  ② 联想只问「当前搜索源」，而 wy 源把 tipSearch 注释掉了（只用空壳返回 []），
//     所以哪怕 temp_source 正常，用户用网易搜也永远看不到联想词。
// 现在的策略：本地词库（搜索历史 + 热搜词缓存）立刻给出结果，不依赖网络；
// 在线联想再并发问几个真正实现了 tipSearch 的源做补充，失败一律静默降级。
const MAX_TIPS = 12
const TIP_SOURCE_ORDER = ['kw', 'kg', 'tx', 'mg', 'bd', 'wy']

const normalize = word => String(word ?? '').trim()
const unique = list => {
  const seen = new Set()
  const out = []
  for (const word of list) {
    const value = normalize(word)
    if (!value || seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

export default {
  setup() {
    const searchText = ref('')
    const visibleList = ref(false)
    const tipList = ref([])
    const localWords = ref([])
    let isFocused = false
    let corpusLoaded = false
    let hotLoaded = false
    let tipSeq = 0

    const route = useRoute()
    const router = useRouter()

    watch(() => route.name, (newValue, oldValue) => {
      if (oldValue == 'Search' && newValue != 'SongListDetail') {
        setTimeout(() => {
          if (appSetting['odc.isAutoClearSearchInput'] && searchText.value) searchText.value = ''
          if (appSetting['odc.isAutoClearSearchList']) setSearchText('')
        })
      }
    })

    watch(_searchText, (newValue) => {
      searchText.value = newValue
      if (newValue !== searchText.value) searchText.value = newValue
    })
    watch(searchText, () => {
      handleTipSearch()
    })

    /** 本地词库：搜索历史（联想记忆）+ 已缓存的热搜词。 */
    const collectLocalWords = async() => {
      try { await getHistoryList() } catch (_) { /* 读盘失败不阻断联想 */ }
      const words = [...historyList]
      for (const key of Object.keys(hotSourceList)) {
        const list = hotSourceList[key]
        if (Array.isArray(list)) words.push(...list)
      }
      localWords.value = unique(words)
    }

    /** 后台补一次「大词库」：各平台热搜词合流。只拉一次，不阻塞输入。 */
    const refreshHotWords = async() => {
      if (hotLoaded) return
      hotLoaded = true
      try {
        await getHotSearchList('all')
        await collectLocalWords()
      } catch (_) { /* 热搜接口不通就只用历史记忆 */ }
    }

    const matchLocal = text => {
      const query = normalize(text).toLowerCase()
      const pool = localWords.value
      // 空输入时把搜索记忆直接摊开，等同于「一聚焦就想起搜过什么」
      if (!query) return pool.slice(0, MAX_TIPS)
      const starts = []
      const contains = []
      for (const word of pool) {
        const lower = word.toLowerCase()
        if (lower === query) continue
        if (lower.startsWith(query)) starts.push(word)
        else if (lower.includes(query)) contains.push(word)
      }
      return [...starts, ...contains].slice(0, MAX_TIPS)
    }

    const tipSearch = debounce(async() => {
      const text = normalize(searchText.value)
      const seq = ++tipSeq

      // ① 本地联想先落地，保证每次输入都有即时反馈
      tipList.value = matchLocal(text)
      if (!text) return

      // ② 在线联想补充：优先当前源，再问其它实现了 tipSearch 的源
      try {
        const setting = await getSearchSetting()
        const preferred = normalize(setting.temp_source) || normalize(setting.source)
        const order = unique([preferred, ...TIP_SOURCE_ORDER]).slice(0, 4)
        const tasks = order.map(async source => {
          const impl = music[source]?.tipSearch
          if (!impl) return []
          try {
            const list = await impl.search(text)
            return Array.isArray(list) ? list.map(normalize).filter(Boolean) : []
          } catch (_) { return [] }
        })
        const remote = unique((await Promise.all(tasks)).flat())
        // 输入已经变了 / 又触发了一轮，就丢弃这次结果，避免旧词盖掉新词
        if (seq !== tipSeq || normalize(searchText.value) !== text) return
        tipList.value = unique([...tipList.value, ...remote]).slice(0, MAX_TIPS)
      } catch (_) { /* 在线词库全挂也不影响本地联想 */ }
    }, 160)

    const handleTipSearch = () => {
      if (!visibleList.value && isFocused) visibleList.value = true
      tipSearch()
    }

    const handleSearch = () => {
      visibleList.value &&= false
      if (!searchText.value && route.path != '/search') {
        setSearchText('')
        return
      }
      setTimeout(() => {
        router.push({
          path: '/search',
          query: {
            text: searchText.value,
          },
        }).catch(_ => _)
      }, searchText.value ? 200 : 0)
    }

    const handleEvent = ({ action, data }) => {
      switch (action) {
        case 'focus':
          isFocused = true
          visibleList.value ||= true
          if (!corpusLoaded) {
            corpusLoaded = true
            void collectLocalWords().then(() => { if (isFocused) tipSearch() })
          }
          void refreshHotWords()
          // 空输入也要显示搜索记忆
          handleTipSearch()
          break
        case 'blur':
          isFocused = false
          setTimeout(() => {
            visibleList.value &&= false
          }, 50)
          break
        case 'submit':
          handleSearch()
          break
        case 'listClick':
          searchText.value = tipList.value[data]
          void nextTick(handleSearch)
      }
    }

    return {
      searchText,
      visibleList,
      tipList,
      handleEvent,
    }
  },
}

</script>
