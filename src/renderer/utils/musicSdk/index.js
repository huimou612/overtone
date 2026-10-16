import kw from './kw/index'
import kg from './kg/index'
import tx from './tx/index'
import wy from './wy/index'
import mg from './mg/index'
import bd from './bd/index'
import xm from './xm'
import { supportQuality, getApiImpl } from './api-source'
import { versionChars } from './versionChars'
import ov from './ov'

/**
 * 内置平台接口 —— 按用户要求从 `a2d3eb2a^` 恢复。
 *
 * 背景：`a2d3eb2a`（阶段 5）曾按「不内置任何平台音源接口」这条红线，把这七个
 * 平台的实现（搜索、榜单、歌单、歌词、封面、热词……，含酷狗的签名算法
 * kg/vendors/infSign.min.js）整包删掉。后来用户明确要求还原 —— 因为这些实现是
 * **搜索能力的唯一提供者**：删掉之后搜索页只剩「开放曲库」，而用户导入的自定义源
 * 又不提供 musicSearch，界面于是看起来像「没有歌曲」。
 *
 * ⚠️ 这次恢复与 README / NOTICE 里那条「本项目本身不内置、不提供任何平台源」的
 * 补充协议**直接冲突** —— 两处文字已于 2026-10-16 同步改写（README 的「在线播放
 * 怎么用」「贡献」「红线 · 已知边界」与补充协议 1.1、NOTICE 的「音乐版权与接口
 * 说明」），现在文档与代码一致：内置搜索类接口，取音频链接仍走使用者的自定义源。
 *
 * 恢复后的真实能力边界（别当成「全都通了」）：
 *   - **搜索 / 榜单 / 歌单 / 热词 / 评论 / 歌词 / 封面：活的** —— 各平台的
 *     musicSearch.js、leaderboard.js 等都是自己发 HTTP 请求，不依赖下面那张注册表。
 *   - **取播放地址不依赖这里的实现**：各平台 `index.js` 写的是
 *     `apis('kw').getMusicUrl(...)`，而 `apis()`（见 ./api-source）在所选音源为
 *     `user_api*` 时**直接返回用户导入的自定义源实现**。所以「内置源负责搜索 +
 *     用户自己的源负责取流」这条链路是通的；反之，若所选音源是内置接口而
 *     `api-source-info.ts` 的注册表为空，就会抛 `Api is not found`。
 *
 * ⚠️ 别把 `apis()`（./api-source）当成取 URL 的主路径 —— 它只在**换源**时被调用。
 * 在线歌真正的主播放路径是 `musicSdk[musicInfo.source].getMusicUrl(...)`，也就是
 * **下面这个 Proxy**：先看 target（内置源，现在有值），取不到才落到
 * `getUserApiSource` 与空壳。
 *
 * searchMusic / findMusic 保留：它们是**通用骨架**（并发搜同名歌 + 按
 * 歌名/歌手/专辑/时长/版本字符排序），不含任何平台相关逻辑。
 */
const sources = {
  sources: [
    {
      name: '酷我音乐',
      id: 'kw',
    },
    {
      name: '酷狗音乐',
      id: 'kg',
    },
    {
      name: 'QQ音乐',
      id: 'tx',
    },
    {
      name: '网易音乐',
      id: 'wy',
    },
    {
      name: '咪咕音乐',
      id: 'mg',
    },
    {
      name: '虾米音乐',
      id: 'xm',
    },
    // {
    //   name: '百度音乐',
    //   id: 'bd',
    // },
    {
      name: '开放曲库',
      id: 'ov',
    },
  ],
}

/**
 * 空壳：所有 `musicSdk[source].xxx` 的取值都落到它身上。
 *
 * 为什么需要它 —— 调用点的写法是 `musicSdk[source].getMusicUrl(...)`、
 * `musicSdk[source]?.leaderboard.getList(...)` 这类，它们**默认拿到的一定是对象**。
 * `musicSdk['kw']` 之类的 key 在**内置源被删掉的那段时间**是取不到的，于是：
 *   - 有的地方 `.then` 直接挂在 undefined 上（`Object.defineProperty called on non-object`）
 *   - 有的地方把 `undefined` 当成查询结果传下去（`Cannot read properties of undefined (reading 'list')`）
 * 内置源恢复后这些 key 大多有值，但**用户导入的源、以及将来被移除的源**仍会走到这里
 * （`getUserApiSource` 返回 null 时），所以空壳必须继续存在。
 * 这些是**未捕获的 rejection**，不会让页面崩，但会在控制台刷错误，也会让
 * 「没有源」这个正常状态看起来像坏了。
 *
 * 返回策略按语义分两类：
 *   - **取音频 / 歌词 / 封面**：语义上就应该失败 → 返回必然 reject 的 promise，
 *     调用点接住后走它们本来就有的「换源失败」降级分支；
 *   - **查列表 / 歌单 / 榜单 / 热词 / 评论**：返回**结构对齐的空结果** →
 *     页面显示「暂无内容」，比报错合理。
 *
 * ⚠️ 它**不会**让界面冒出平台入口：渲染层那几处 store 遍历的是
 * `musicSdk.sources` 这个**数组**（现在含七个平台源与 `ov`），而不是 musicSdk 上的 key。
 *
 * ── 空壳契约表（改这里之前先照着右列去核对消费点）────────────────────────
 * 下面每一条的「形状」都是从**消费点实际读的字段**反推的，不是照抄平台旧实现。
 * 删源之前上游从没跑过「零源」，所以这些形状没有文档可依 —— 踩过的坑：
 * 把 `tipSearch.search` 写成 `{ list: [] }`（实际要裸数组）、把评论写成
 * `{ list }`（实际要 `comments`）、把标签写成 `[]`（实际要 `{ tags, hotTag }`），
 * 三处都会让 `v-for` 拿到 undefined 而抛未捕获异常。
 *
 * | 空壳方法                       | 消费点                                        | 消费点读的字段                |
 * |--------------------------------|-----------------------------------------------|-------------------------------|
 * | getMusicUrl / getLyric         | core/music/utils.ts（try/catch 兜住）         | `.promise`                    |
 * | getPic                         | core/music/utils.ts（try/catch 兜住）         | 直接 await                    |
 * | tipSearch.search               | components/layout/Toolbar/SearchInput.vue     | 裸数组（不是 {list}）         |
 * | musicSearch.search             | store/search/music/action.ts                  | list/total/limit/allPage/source |
 * | songList.search                | store/search/songlist/action.ts               | 同上                          |
 * | songList.getTags               | views/songList/List/components/TagList.vue    | tags / hotTag（不是数组）     |
 * | songList.getList               | store/songList/action.ts                      | list/total/limit/source       |
 * | songList.getListDetail         | store/songList/action.ts                      | 上述 + info                   |
 * | songList.sortList              | store/songList/state.ts                       | 数组（字段名不是 sortId）     |
 * | songList.getDetailPageUrl      | views/List/MyList/index.vue                   | await → 字符串                |
 * | leaderboard.getBoards          | store/leaderboard/action.ts                   | list / source                 |
 * | leaderboard.getList            | store/leaderboard/action.ts                   | list/total/limit/source       |
 * | leaderboard.getDetailPageUrl   | views/List/MyList/index.vue                   | 不 await → 字符串             |
 * | hotSearch.getList              | store/hotSearch.ts                            | list                          |
 * | comment.getComment / getHot…   | PlayDetail/…/MusicComment/index.vue           | total / maxPage / comments    |
 * ─────────────────────────────────────────────────────────────────────────
 */

/** 搜索结果（musicSearch.search / songList.search）。allPage 必须给，setList 会读。 */
const emptySearchResult = () => ({
  list: [],
  total: 0,
  limit: 30,
  allPage: 0,
  source: null,
})

/** 歌单 / 榜单列表（getList / getListDetail）。setList 会读 info，setListDetail 会读 desc。 */
const emptyListInfo = () => ({
  list: [],
  total: 0,
  page: 1,
  maxPage: 0,
  limit: 30,
  key: null,
  id: '',
  desc: null,
  source: null,
  info: {},
  noItemLabel: '',
})

/** 评论：消费点读的是 `comments`，**不是** `list`。 */
const emptyComments = () => ({ total: 0, maxPage: 0, comments: [] })

const noSourceImpl = () => Promise.reject(new Error('no source implementation'))

const noSource = {
  // ── 取音频 / 歌词 / 封面：必然失败 ──────────────────────────
  getMusicUrl: () => ({ promise: noSourceImpl() }),
  getLyric: () => ({ promise: noSourceImpl() }),
  getPic: noSourceImpl,
  // 平台 index.js 的标准接口之一，当前仓内无调用点，保留是为了维持形状
  getMusicInfo: noSourceImpl,
  getMusicDetailPageUrl: () => '',

  // ── 查列表类：返回形状对齐的空结果 ──────────────────────────
  tipSearch: {
    search: () => Promise.resolve([]),
    cancelTipSearch: () => {},
  },
  musicSearch: {
    search: () => Promise.resolve(emptySearchResult()),
  },
  songList: {
    tagInfo: {},
    sortList: [],
    source: null,
    getTags: () => Promise.resolve({ tags: [], hotTag: [], source: null }),
    search: () => Promise.resolve(emptySearchResult()),
    getList: () => Promise.resolve(emptyListInfo()),
    getListDetail: () => Promise.resolve(emptyListInfo()),
    getDetailPageUrl: () => Promise.resolve(''),
  },
  leaderboard: {
    getBoards: () => Promise.resolve({ list: [], source: null }),
    getList: () => Promise.resolve(emptyListInfo()),
    getDetailPageUrl: () => '',
  },
  hotSearch: {
    getList: () => Promise.resolve({ list: [] }),
  },
  comment: {
    getComment: () => Promise.resolve(emptyComments()),
    getHotComment: () => Promise.resolve(emptyComments()),
  },
}

/**
 * 随应用分发、不需要用户导入的**内置源**。
 *
 * - 七个商业平台源（kw / kg / tx / wy / mg / bd / xm）：按用户要求从
 *   `a2d3eb2a^` 恢复，见文件顶部说明；
 * - `ov`（开放曲库 / Openverse，见 ./ov）：收录的是 CC 授权与公有领域音频。
 *
 * ⚠️ 每个实现都要**与空壳合并**，不能直接放模块本身：消费点里有
 * `musicSdk[source]?.songList.getTags()` 这种「先取属性再取方法」的写法，
 * 只提供 musicSearch / getMusicUrl / getPic / getLyric 的模块会让 `.songList`
 * 变成 undefined 再炸一次。用户导入的自定义源走同样的合并（见 getUserApiSource）。
 *
 * ⚠️ 位置必须在 `noSource` 之后（要用到它），又在 `musicSdk` 之前（要被展开）。
 *
 * ⚠️ **唯一例外是 `xm`，它刻意不与空壳合并。** 上游的 `sources.sources` 里也有
 * `{ name: '虾米音乐', id: 'xm' }`，但那时 `musicSdk.xm` 是原始 `xm.js`（只导出
 * 必然失败的 getMusicUrl / getLyric / getPic 和 comment），**没有** musicSearch /
 * leaderboard / songList —— 于是三处列表构建器的能力守卫
 * （`store/search/music/state.ts` 的 `musicSearch`、`store/leaderboard/state.ts` 的
 * `leaderboard?.getBoards`、`store/songList/state.ts` 的 `songList`）会把它全部滤掉，
 * 虾米不会出现在任何 Tab 里（它 2021 年就已停服）。
 *
 * 如果给它合并空壳，守卫就会看到「有方法」而放行 → 搜索页 / 榜单页 / 歌单页各多出
 * 一个「点进去什么都没有」的虾米 Tab。保留在 `sources.sources` 里的意义只剩两条：
 * 历史数据里 `source: 'xm'` 的歌曲仍能显示正确的来源名（`store/index.ts` 的
 * sourceNames 靠遍历 `music.sources` 取值），以及 `searchMusic` 的 `excludeSource`。
 */
const builtinSources = {
  kw: { ...noSource, ...kw },
  kg: { ...noSource, ...kg },
  tx: { ...noSource, ...tx },
  wy: { ...noSource, ...wy },
  mg: { ...noSource, ...mg },
  bd: { ...noSource, ...bd },
  xm,
  ov: { ...noSource, ...ov },
}

Object.assign(sources, builtinSources)

const musicSdk = {
  ...sources,
  init() {
    const tasks = []
    for (const source of sources.sources) {
      const impl = sources[source.id]
      if (impl && impl.init) tasks.push(impl.init())
    }
    return Promise.all(tasks)
  },
  supportQuality,

  async searchMusic({ name, singer, source: s, limit = 25 }) {
    const trimStr = str => typeof str == 'string' ? str.trim() : str
    const musicName = trimStr(name)
    const tasks = []
    const excludeSource = ['xm']
    for (const source of sources.sources) {
      if (!sources[source.id]?.musicSearch || source.id == s || excludeSource.includes(source.id)) continue
      tasks.push(sources[source.id].musicSearch.search(`${musicName} ${singer || ''}`.trim(), 1, limit).catch(_ => null))
    }
    return (await Promise.all(tasks)).filter(s => s)
  },

  async findMusic({ name, singer, albumName, interval, source: s }) {
    const lists = await this.searchMusic({ name, singer, source: s, limit: 25 })

    const singersRxp = /、|&|;|；|\/|,|，|\|/
    const sortSingle = singer => singersRxp.test(singer)
      ? singer.split(singersRxp).sort((a, b) => a.localeCompare(b)).join('、')
      : (singer || '')
    const sortMusic = (arr, callback) => {
      const tempResult = []
      for (let i = arr.length - 1; i > -1; i--) {
        const item = arr[i]
        if (callback(item)) {
          delete item.fSinger
          delete item.fMusicName
          delete item.fAlbumName
          delete item.fInterval
          tempResult.push(item)
          arr.splice(i, 1)
        }
      }
      tempResult.reverse()
      return tempResult
    }
    const getIntv = (interval) => {
      if (!interval) return 0
      // if (musicInfo._interval) return musicInfo._interval
      let intvArr = interval.split(':')
      let intv = 0
      let unit = 1
      while (intvArr.length) {
        intv += parseInt(intvArr.pop()) * unit
        unit *= 60
      }
      return intv
    }
    const trimStr = str => typeof str == 'string' ? str.trim() : (str || '')
    const filterStr = str => typeof str == 'string' ? str.replace(/\s|'|\.|,|，|&|"|、|\(|\)|（|）|`|~|-|<|>|\||\/|\]|\[|!|！/g, '') : String(str || '')
    const fMusicName = filterStr(name).toLowerCase()
    const fSinger = filterStr(sortSingle(singer)).toLowerCase()
    const fAlbumName = filterStr(albumName).toLowerCase()
    const fInterval = getIntv(interval)
    const isEqualsInterval = (intv) => Math.abs((fInterval || intv) - (intv || fInterval)) <= 5
    const isEqualsVersionMusicNameChar = (name) => {
      for (const char of versionChars) {
        if (name.includes(char) != fMusicName.includes(char)) return false
      }
      return true
    }
    const isIncludesName = (name) => (fMusicName.includes(name) || name.includes(fMusicName)) && isEqualsVersionMusicNameChar(name)
    const isIncludesSinger = (singer) => fSinger ? (fSinger.includes(singer) || singer.includes(fSinger)) : true
    const isEqualsAlbum = (album) => fAlbumName ? fAlbumName == album : true

    const result = lists.map(source => {
      for (const item of source.list) {
        item.name = trimStr(item.name)
        item.singer = trimStr(item.singer)
        item.fSinger = filterStr(sortSingle(item.singer).toLowerCase())
        item.fMusicName = filterStr(String(item.name ?? '').toLowerCase())
        item.fAlbumName = filterStr(String(item.albumName ?? '').toLowerCase())
        item.fInterval = getIntv(item.interval)
        if (!isEqualsInterval(item.fInterval)) {
          item.name = null
          continue
        }
        if (item.fMusicName == fMusicName && isIncludesSinger(item.fSinger)) return item
      }
      for (const item of source.list) {
        if (item.name == null) continue
        if (item.fSinger == fSinger && isIncludesName(item.fMusicName)) return item
      }
      for (const item of source.list) {
        if (item.name == null) continue
        if (isEqualsAlbum(item.fAlbumName) && isIncludesSinger(item.fSinger) && isIncludesName(item.fMusicName)) return item
      }
      return null
    }).filter(s => s)
    const newResult = []
    if (result.length) {
      newResult.push(...sortMusic(result, item => item.fSinger == fSinger && item.fMusicName == fMusicName && item.interval == interval))
      newResult.push(...sortMusic(result, item => item.fMusicName == fMusicName && item.fSinger == fSinger && item.fAlbumName == fAlbumName))
      newResult.push(...sortMusic(result, item => item.fSinger == fSinger && item.fMusicName == fMusicName))
      newResult.push(...sortMusic(result, item => item.fMusicName == fMusicName && item.interval == interval))
      newResult.push(...sortMusic(result, item => item.fSinger == fSinger && item.interval == interval))
      newResult.push(...sortMusic(result, item => item.interval == interval))
      newResult.push(...sortMusic(result, item => item.fMusicName == fMusicName))
      newResult.push(...sortMusic(result, item => item.fSinger == fSinger))
      newResult.push(...sortMusic(result, item => item.fAlbumName == fAlbumName))
      for (const item of result) {
        delete item.fSinger
        delete item.fMusicName
        delete item.fAlbumName
        delete item.fInterval
      }
      newResult.push(...result)
    }
    return newResult
  },
}

/**
 * 某个 source 当前是否有可用实现。
 *
 * `sources.sources` 里是内置源（七个平台源 + 开放曲库）；用户导入的源不在这个数组里
 * （它们是按需注册到 `userApi.apis` 的，见 `getUserApiSource`）。界面用这个函数把
 * **持久化设置里存着的失效 source** 归一化掉 —— 存量用户的盘上可能还留着某个已被
 * 移除的 source，读取处见 `renderer/utils/data.ts` 的 `clearInvalidSourceField`；
 * `store/utils.ts` 的 `assertApiSupport` 也用它放行内置源的播放按钮。
 */
export const isValidSource = source => sources.sources.some(item => item.id === source)

/**
 * 用户导入的自定义源实现（按 source 合并后的对象）缓存。
 *
 * 键里带上实现对象的引用：`userApi.apis` 在切换自定义源时会被整体替换，
 * 引用变了缓存自然失效，不需要额外的失效逻辑。
 */
const userApiMergedCache = new Map()
const getUserApiSource = source => {
  const impl = getApiImpl(source)
  if (!impl || !Object.keys(impl).length) return null
  const cached = userApiMergedCache.get(source)
  if (cached && cached.impl === impl) return cached.merged
  // 与空壳合并，而不是直接返回 impl —— 自定义源只提供 musicUrl / lyric / pic，
  // 而消费点里还有 `musicSdk[source]?.songList.getTags()` 这种「先取属性再取方法」
  // 的写法，只给 3 个方法会让 `.songList` 变 undefined 再炸一次。
  const merged = { ...noSource, ...impl }
  userApiMergedCache.set(source, { impl, merged })
  return merged
}

/**
 * 用 Proxy 兜住「取不到的源」。
 *
 * 内置源（七个平台源 + 开放曲库）现在**直接写在 `musicSdk` 的 target 上**，所以
 * `'kw' in musicSdk` 为真。Proxy 只在 target 里**没有**这个 key 时兜底 —— 也就是
 * 「用户导入的源声明的、但泛音没有内置实现的 source」。
 *
 * ⚠️ 但空壳不能只是空壳 —— **在线歌的主播放路径走的就是这里**
 * （`core/music/utils.ts` 的 `musicSdk[musicInfo.source].getMusicUrl(...)`），
 * 而 `apis()` 那条只是「换源」。所以只留空壳的话，就算用户自己导入了自定义源，
 * 主路径也永远拿不到实现、永远失败（实测报 `no source implementation`）。
 *
 * 这里的顺序因此是：**内置源（已登记在 target 上）> 用户导入的源 > 空壳**。
 * 这里的顺序因此是：**内置源（已登记在 target 上）> 用户导入的源 > 空壳**。
 * 内置的七个平台实现负责搜索 / 榜单 / 歌单等，取播放地址时它们又会回调 `apis()`，
 * 从而用上用户自己导入的来源。
 */
export default new Proxy(musicSdk, {
  get(target, key) {
    if (key in target) return target[key]
    // Symbol（toStringTag / iterator 之类）如实返回 undefined，
    // 否则会被当成一个"源"塞进某些遍历逻辑里
    if (typeof key != 'string') return undefined
    return getUserApiSource(key) ?? noSource
  },
})
