import { reactive, markRaw } from '@common/utils/vueTools'
import music from '@renderer/utils/musicSdk'

// import { deduplicationList } from '@common/utils/renderer'

export declare interface ListInfo {
  list: LX.Music.MusicInfo[]
  total: number
  page: number
  maxPage: number
  limit: number
  key: string | null
  noItemLabel: string
}

interface ListInfos extends Partial<Record<LX.OnlineSource, ListInfo>> {
  'all': ListInfo
}

/**
 * 搜索页可选的源列表（最后一个永远是聚合视图 'all'）。
 *
 * ⚠️ 这里原来是 `markRaw([])`，改成 `reactive` 是**必须的**：自定义源是异步注册的
 * （主进程把脚本跑起来、回传它声明了哪些能力之后，`userApi.apis` 才就绪），而
 * `markRaw` 的数组 push 不会触发任何重渲染 —— 搜索页的 Tab 会一直停在
 * 「聚合搜索 + 开放曲库」两栏，用户导入的源永远不会出现。
 *
 * ⚠️ 也必须原地改（`splice` 而不是重新赋值）：别的模块 import 的是这个引用。
 */
export const sources = reactive<Array<LX.OnlineSource | 'all'>>([])

export const listInfos: ListInfos = markRaw({
  all: reactive<ListInfo>({
    page: 1,
    maxPage: 0,
    limit: 30,
    total: 0,
    list: [],
    key: null,
    noItemLabel: '',
  }),
})
export const maxPages: Partial<Record<LX.OnlineSource, number>> = {}

/**
 * 重建源列表。可重复调用 —— 首次加载、以及每次切换自定义源都会调。
 *
 * 两个来源：
 *   - **内置源**：查 `music.sources`（现在只有开放曲库 `ov`，见 utils/musicSdk/ov）；
 *   - **自定义源**：由调用方 `core/useApp/useInitUserApi.ts` 传入，判据是
 *     「该源注册了 `musicSearch`」—— 这个判断只有它做得了，因为只有它看得到
 *     `userApi.apis`（脚本声明的能力汇总）。
 *
 * ⚠️ 别在这里用 `music[id]?.musicSearch` 当「用户源是否可搜」的判据：`musicSdk`
 * 是个 Proxy，取任何 key（包括 kw / kg）都会兜到空壳上，而**空壳也有**
 * `musicSearch`（返回空结果）。那样 kw / kg 这些源会无条件冒出来，变成
 * 「点进去什么都搜不到」的死 Tab。
 */
export const initSearchSources = (userApiSourceIds: LX.OnlineSource[] = []) => {
  const ids: LX.OnlineSource[] = []
  for (const source of music.sources) {
    // 开放曲库（ov / Openverse）不进搜索页：
    //  · 直连 api.openverse.org 会长时间挂住不返回（必须挂代理才能用），
    //    表现为一个永远「加载中」的死 Tab；
    //  · 它还会拖死聚合搜索 —— 聚合是 Promise.all，一个源不返回就永远等不到结果。
    // 曲库内容以英文为主，中文关键词本来就搜不到，所以直接不展示。
    if (source.id === 'ov') continue
    if (!music[source.id as LX.OnlineSource]?.musicSearch) continue
    ids.push(source.id as LX.OnlineSource)
  }
  for (const id of userApiSourceIds) {
    if (!ids.includes(id)) ids.push(id)
  }
  for (const id of ids) {
    // listInfo 必须比 Tab 先存在：`store/search/music/action.ts` 的 setList 会拿
    // 结果里的 source 去查 listInfos，缺了就是往 undefined 上写字段。
    if (!listInfos[id]) {
      listInfos[id] = reactive<ListInfo>({
        page: 1,
        maxPage: 0,
        limit: 30,
        total: 0,
        list: [],
        key: '',
        noItemLabel: '',
      })
    }
    if (maxPages[id] == null) maxPages[id] = 0
  }
  sources.splice(0, sources.length, ...ids, 'all')
}

initSearchSources()
