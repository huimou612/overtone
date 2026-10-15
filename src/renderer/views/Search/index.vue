<template>
  <div :class="$style.container">
    <div :class="$style.header">
      <base-tab v-model="source" :list="sources" @change="handleSourceChange" />
      <base-tab v-model="searchType" :list="searchTypes" @change="handleTypeChange" />
    </div>
    <div :class="$style.main">
      <song-list-list v-if="searchType == 'songlist'" v-show="searchText" :page="page" :source-id="source" />
      <music-list v-else v-show="searchText" :page="page" :source-id="source" />
      <blank-view :visible="!searchText" :source="source" />
    </div>
  </div>
</template>

<script>
import { useRoute, useRouter } from '@common/utils/vueRouter'
import { searchText } from '@renderer/store/search/state'
import { getSearchSetting, setSearchSetting } from '@renderer/utils/data'
import { sources as _sources } from '@renderer/store/search/music'

import MusicList from './MusicList/index.vue'
import SongListList from './SongListList/index.vue'
import BlankView from './components/BlankView.vue'
import { computed, ref } from '@common/utils/vueTools'
import { sourceNames } from '@renderer/store'

// 内置源已全部移除（见 utils/musicSdk/index.js），可选的搜索源只剩聚合视图 'all'。
// 原来这里写的是 'kw' —— 那是"至少有个平台可用"时代的默认值。
const source = ref('all')
const searchType = ref(null)
const page = ref(1)

const verifyQueryParams = async(to, from, next) => {
  let _source = to.query.source
  let _type = to.query.type
  let _page = to.query.page

  if (_source == null || _type == null) {
    const setting = await getSearchSetting()
    _source ??= setting.source
    _type ??= setting.type

    next({
      path: to.path,
      query: { ...to.query, source: _source, type: _type, page: _page },
    })
    return
  }
  // 内置源删除后，持久化设置（getSearchSetting）与旧链接里存的 source
  // （kw / kg / tx / wy / mg）都没有对应的 listInfo 了，页面会在模板里对
  // undefined 取 .page 而抛错。这里统一回落到聚合视图 'all'（它始终存在）。
  //
  // ⚠️ `_sources` 现在**可能包含自定义源**（用户导入的脚本声明了 musicSearch 时，
  // 见 store/search/music/state.ts 的 initSearchSources）—— 所以这个守卫不是
  // 「把 kw 一律砍掉」，而是「只放行真的有实现的源」：自定义源就绪前 `_sources`
  // 里没有它，此时回落到 'all' 是正确行为。
  if (!_sources.includes(_source)) {
    void setSearchSetting({ source: 'all', type: _type })
    next({
      path: to.path,
      query: { ...to.query, source: 'all', page: 1 },
    })
    return
  }

  source.value = _source
  searchType.value = _type

  if (_page) page.value = parseInt(_page)

  if (to.query.text != null) {
    searchText.value = to.query.text
    if (!_page) page.value = 1
  }
  next()
  void setSearchSetting({ source: _source, type: _type })
}

export default {
  components: {
    MusicList,
    SongListList,
    BlankView,
  },
  beforeRouteEnter: verifyQueryParams,
  beforeRouteUpdate: verifyQueryParams,
  setup() {
    const route = useRoute()
    const router = useRouter()

    // ⚠️ 必须是 computed，不能是一次性 map —— 自定义源是**异步注册**的
    // （见 store/search/music/state.ts 的 initSearchSources），源列表会在运行时
    // 补齐；一次性 map 拿到的只是启动那一刻的快照，后加的自定义源不会出现在 Tab 里。
    const sources = computed(() => _sources.map(id => {
      return {
        id,
        label: sourceNames.value[id],
      }
    }))
    const handleSourceChange = (id) => {
      void router.replace({
        path: route.path,
        query: {
          ...route.query,
          source: id,
          page: 1,
        },
      })
    }

    const searchTypes = computed(() => {
      return [
        { label: window.i18n.t('search__type_music'), id: 'music' },
        { label: window.i18n.t('search__type_songlist'), id: 'songlist' },
      ]
    })
    const handleTypeChange = (type) => {
      void router.replace({
        path: route.path,
        query: {
          ...route.query,
          type,
          page: 1,
        },
      })
    }


    return {
      sources,
      source,
      handleSourceChange,
      searchTypes,
      searchType,
      handleTypeChange,
      page,
      searchText,
    }
  },
}


</script>

<style lang="less" module>
.container {
  display: flex;
  flex-flow: column nowrap;
}

.header {
  // padding: 5px 0;
  flex: none;
  display: flex;
  flex-flow: row nowrap;
  justify-content: space-between;
}

.main {
  position: relative;
  flex: auto;
  // min-height: 0;
}
</style>
