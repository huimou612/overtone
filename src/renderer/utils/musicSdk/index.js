import { supportQuality, getApiImpl } from './api-source'
import { versionChars } from './versionChars'
import ov from './ov'

/**
 * 内置平台接口已全部移除 —— 泛音的红线：**不内置任何平台音源接口**。
 *
 * 上游 LX Music 在这里 import 并导出 kw / kg / tx / wy / mg / bd / xm 七个平台的
 * 接口实现（搜索、榜单、歌单、歌词、封面、热词……），其中还有酷狗那套签名算法
 * （kg/vendors/infSign.min.js）。那些代码即使不被调用，也会被整包打进产物，
 * 等于把平台接口"内置"进了应用 —— 所以连同目录一起删除，只留下这个分发框架。
 *
 * 现在 `sources.sources` 里只剩**开放曲库**（`ov`，见 ./ov）—— 它是 CC / 公有
 * 领域的开放版权曲库，不是任何商业音乐平台的接口，所以与红线相容。于是：
 *   - 下面几处 `for (const source of sources.sources)` 只会带上 `ov`；
 *   - 渲染层的 store（search / songList / leaderboard / hotSearch）遍历的是
 *     `sources.sources` 这个数组并带 `?.` 守卫，没实现的 Tab 不会出现；
 *   - 所有取 URL / 封面 / 歌词的调用点要么包在 try 里、要么用了 `?.`，
 *     取不到实现就落进原有的「换源失败」降级分支，不会抛未捕获异常。
 *
 * ⚠️ 别把 `apis()`（./api-source）当成取 URL 的主路径 —— 它只在**换源**时被调用。
 * 在线歌真正的主播放路径是 `musicSdk[musicInfo.source].getMusicUrl(...)`，
 * 也就是**下面这个 Proxy**。所以哪怕用户导入的自定义源脚本是对的，只要 Proxy
 * 只兜空壳，主路径就永远失败（实测报 `no source implementation`）——
 * 这正是 `getUserApiSource` 存在的理由。
 *
 * searchMusic / findMusic 保留：它们是**通用骨架**（并发搜同名歌 + 按
 * 歌名/歌手/专辑/时长/版本字符排序），不含任何平台相关逻辑。现在顶层只有 `ov`
 * 一个源可遍历；将来自定义源协议若支持 musicSearch，这里直接就能用。
 */
const sources = {
  sources: [
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
 * 删除内置源后 `musicSdk['kw']` 变成 `undefined`，于是：
 *   - 有的地方 `.then` 直接挂在 undefined 上（`Object.defineProperty called on non-object`）
 *   - 有的地方把 `undefined` 当成查询结果传下去（`Cannot read properties of undefined (reading 'list')`）
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
 * `musicSdk.sources` 这个**数组**（现在只有内置的 `ov`），而不是 musicSdk 上的 key。
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
 * 现在只有 `ov`（开放曲库 / Openverse，实现见 ./ov）—— 收录的是 CC 授权与
 * 公有领域音频，因此不违反「不内置任何平台音源接口」这条红线。
 *
 * ⚠️ 每个实现都要**与空壳合并**，不能直接放模块本身：消费点里有
 * `musicSdk[source]?.songList.getTags()` 这种「先取属性再取方法」的写法，
 * 只提供 musicSearch / getMusicUrl / getPic / getLyric 的模块会让 `.songList`
 * 变成 undefined 再炸一次。用户导入的自定义源走同样的合并（见 getUserApiSource）。
 *
 * ⚠️ 位置必须在 `noSource` 之后（要用到它），又在 `musicSdk` 之前（要被展开）。
 */
const builtinSources = {
  ov: { ...noSource, ...ov },
}

Object.assign(sources, builtinSources)

const musicSdk = {
  ...sources,
  init() {
    return Promise.resolve([])
  },
  supportQuality,

  async searchMusic({ name, singer, source: s, limit = 25 }) {
    const trimStr = str => typeof str == 'string' ? str.trim() : str
    const musicName = trimStr(name)
    const tasks = []
    const excludeSource = []
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
 * `sources.sources` 现在只有内置的 `ov`；用户导入的源不在这个数组里（它们
 * 是按需注册到 `userApi.apis` 的，见 `getUserApiSource`）。界面用这个函数把
 * **持久化设置里存着的失效 source** 归一化掉 —— 存量用户的盘上还留着
 * `source: 'kw'`（`DEFAULT_SETTING` 过去也把默认值写死成 `'kw'`），
 * 读取处见 `renderer/utils/data.ts` 的 `clearInvalidSource`。
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
 * 之所以不在 `musicSdk` 上写死 kw / kg / … 这些 key（哪怕指向空壳），是因为
 * 那会让 `'kw' in musicSdk` 为真、让读者以为这些源还在；而 `sources.sources`
 * 里只有内置的 `ov`，界面本来就不该出现那些平台的 tab。Proxy 只在**真的去取**
 * 的时候才兜底。
 *
 * ⚠️ 但空壳不能只是空壳 —— **在线歌的主播放路径走的就是这里**
 * （`core/music/utils.ts` 的 `musicSdk[musicInfo.source].getMusicUrl(...)`），
 * 而 `apis()` 那条只是「换源」。所以只留空壳的话，就算用户自己导入了自定义源，
 * 主路径也永远拿不到实现、永远失败（实测报 `no source implementation`）。
 *
 * 这里的顺序因此是：**内置源（已登记在 target 上）> 用户导入的源 > 空壳**。
 * 泛音自身不含任何商业平台实现 —— 内置的只有开放版权曲库，其余是用户自己
 * 导入的脚本。
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
