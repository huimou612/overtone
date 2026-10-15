/**
 * 开放曲库 —— Openverse（https://openverse.org）音源实现。
 *
 * 为什么是它：泛音按红线清掉内置平台接口后「没有歌可放」；而让用户自己去
 * 导入第三方音源，终究是把风险与门槛丢给用户。Openverse 由 WordPress 基金会
 * 运营，聚合的是**明确标注 CC / 公有领域授权**的音频（Jamendo、Freesound、
 * ccMixter、Wikimedia…），公开 API、无需密钥、单次搜索就返回可直接播放的
 * 音频地址 —— 与本项目的红线完全相容：**内置的是开放版权曲库，不是任何商业
 * 音乐平台的接口**。
 *
 * ── 改这个文件前必读的三条实测约束 ────────────────────────────────
 *
 * 1. **匿名访问单页上限 20 条**。`page_size` 传 30/50 直接 401，所以这里夹到
 *    20，并把**实际用的值**当成 limit 回给调用方。`store/search/music/action.ts`
 *    翻页时用的就是上一页返回的 limit，夹紧后分页不会错位。
 *
 * 2. **必须用 `fetch`，不能用 `../../request`（needle）**。不是习惯问题，
 *    而是因为「谁能拿到用户配的代理」这件事在两边的时机不同：
 *
 *      - `fetch` 走 Chromium 网络栈 = 走**主窗口的会话代理由主进程同步**。
 *        「设置 → 网络 → 代理」一改，主进程 `updated_config` 就调
 *        `winMain/main.ts` 的 `setSesProxy()` → `ses.setProxy()`，**立即生效**。
 *        注意它没配代理时打的是 `mode: 'direct'` —— 会**主动关掉系统代理**，
 *        所以别指望 Chromium 自动跟随系统代理，唯一的开关就是应用里那一处。
 *      - needle 的代理来自渲染层 `proxy` store，而那个 store 只在启动时
 *        （`useApp/index.ts`）从 appSetting 抄一次快照，运行期改设置要重启才跟上。
 *
 *    ⚠️ 推论：**这个源连不连得上，完全取决于「设置 → 网络」**。实测
 *    `api.openverse.org` 直连 20s 超时（沙箱出口代理也返回 000），不开代理时
 *    搜索会直接显示「加载失败」。这是网络环境问题，不是这个文件坏了。
 *    （另注：条目的 `thumbnail` 也在 `api.openverse.org` 上，所以封面同样需要代理。）
 *
 * 3. **`duration` 字段单位是毫秒**（72000 → 01:12）。
 *
 * ── 两个刻意的取舍 ───────────────────────────────────────────────
 *
 * - 只筛 `license_type=commercial,modification`。不加这个过滤会混进
 *   `by-nc-nd`（禁止商用、禁止改编）这类「看着开放、其实不能用」的授权 ——
 *   那就不配叫开放曲库了。代价是结果集小一些（实测 `q=piano` 仍有 240 条）。
 * - **中文关键词基本搜不到**：曲库以西文内容为主，`q=钢琴&category=music`
 *   实测 0 条。界面文案与文档都要如实说明这一点，不能让用户以为是坏了。
 */
const API = 'https://api.openverse.org/v1/audio/'

/** 匿名访问的单页上限；超过会被 401。 */
const MAX_PAGE_SIZE = 20

/** 只展示 Chromium 能直接解码的容器，其余不展示（免得点了放不出来）。 */
const PLAYABLE_FILETYPES = new Set([
  'mp3', 'mp32', 'ogg', 'oga', 'opus', 'wav', 'flac', 'm4a', 'aac', 'webm', 'mp4',
])

/** 搜索时顺手记下原始条目，播放/取图就不必再请求一次详情接口。 */
const trackCache = new Map()

const requestJson = (url, signal) => fetch(url, { signal }).then(res => {
  if (!res.ok) throw new Error(`openverse request failed: ${res.status}`)
  return res.json()
})

const isPlayableFiletype = filetype => PLAYABLE_FILETYPES.has(String(filetype || '').toLowerCase())

/**
 * 取可直接播放的音频地址。
 *
 * 部分条目主 `url` 是空或不可播格式，可播的版本在 `alt_files` 里，
 * 所以要按「主 url → 可播的 alt → 原 url」的顺序找。
 */
const resolveAudioUrl = item => {
  if (item.url && isPlayableFiletype(item.filetype)) return item.url
  const altFiles = Array.isArray(item.alt_files) ? item.alt_files : []
  const alt = altFiles.find(file => file.url && isPlayableFiletype(file.filetype))
  if (alt) return alt.url
  return item.url || null
}

const formatInterval = duration => {
  const total = Math.round(Number(duration) / 1000)
  if (!Number.isFinite(total) || total < 0) return '00:00'
  const minute = Math.floor(total / 60)
  const second = total % 60
  return `${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
}

const formatSize = bytes => {
  const size = Number(bytes)
  if (!Number.isFinite(size) || size <= 0) return null
  return size < 1024 * 1024
    ? `${Math.round(size / 1024)}K`
    : `${(size / 1024 / 1024).toFixed(2)}M`
}

/**
 * 把 Openverse 条目转成「旧形状」。
 *
 * ⚠️ 必须是旧形状：搜索结果会过 `toNewMusicInfo()`（`@common/utils/tools`），
 * 它读的是 `songmid` / `img` / `types` / `_types` / `albumId`，不是新的
 * `meta.*`。播放时 `toOldMusicInfo()` 再把它转回来。
 */
const mapTrack = item => {
  const url = resolveAudioUrl(item)
  if (!url) return null
  trackCache.set(item.id, item)
  // ⚠️ `filesize` 在 jamendo 这类 provider 上**实际是 null**（实测整页都是 null），
  // 所以 size 常为 null —— 列表里少一列文件大小而已，不影响播放。freesound 等
  // provider 会给真实字节数，那时才有值。
  const size = formatSize(item.filesize)
  const audioSet = item.audio_set || null
  return {
    name: item.title || '',
    singer: item.creator || '',
    source: 'ov',
    songmid: item.id,
    // ⚠️ `audio_set` 里**没有 id**（只有 title / creator / foreign_landing_url /
    // url / filesize / filetype），所以这里给空串。别把 landing_url 塞进来冒充
    // id —— 那是个网页地址，落到列表的专辑列或去重逻辑上都会很难看。
    albumId: '',
    interval: formatInterval(item.duration),
    albumName: audioSet && audioSet.title ? audioSet.title : '',
    lrc: null,
    // 注意这个地址在 api.openverse.org 上（`/v1/audio/<id>/thumb/`），
    // 不是独立 CDN —— 没有代理时封面同样加载不出来。
    img: item.thumbnail || null,
    otherSource: null,
    // 这个源不做转码、也没有多档码率，统一给一档标准音质。
    // （`getPlayQuality` 在播放音质设为 320k/flac 时也只会回落成 128k）
    types: [{ type: '128k', size }],
    _types: { '128k': { size } },
    typeUrl: {},
  }
}

const buildSearchUrl = (keyword, page, pageSize) => {
  const params = new URLSearchParams({
    q: keyword,
    page: String(page),
    page_size: String(pageSize),
    category: 'music',
    license_type: 'commercial,modification',
  })
  return `${API}?${params.toString()}`
}

/**
 * 按歌曲 id 还原音频地址：先查搜索时的缓存，未命中再请求详情接口。
 *
 * 为什么不能把地址直接塞进 `songmid` —— 那会落进用户保存的歌单里，既脏又长。
 * 为什么不只用缓存 —— 重启后缓存是空的，已收藏的歌就播不了。
 */
const resolveUrlBySongmid = (songmid, signal) => {
  const cached = trackCache.get(songmid)
  if (cached) {
    const url = resolveAudioUrl(cached)
    if (url) return Promise.resolve(url)
  }
  return requestJson(`${API}${encodeURIComponent(songmid)}/`, signal).then(item => {
    trackCache.set(songmid, item)
    const url = resolveAudioUrl(item)
    if (!url) throw new Error('openverse: no playable audio file')
    return url
  })
}

const search = (keyword, page = 1, limit) => {
  const pageSize = Math.min(Math.max(Number(limit) || MAX_PAGE_SIZE, 1), MAX_PAGE_SIZE)
  return requestJson(buildSearchUrl(keyword, page, pageSize)).then(data => {
    const list = (data.results || []).map(mapTrack).filter(Boolean)
    const total = Number(data.result_count) || list.length
    return {
      list,
      total,
      limit: pageSize,
      allPage: Math.ceil(total / pageSize),
      source: 'ov',
    }
  })
}

let tipController = null

export default {
  limit: MAX_PAGE_SIZE,

  musicSearch: {
    search(str, page, limit) {
      return search(str, page, limit)
    },
  },

  tipSearch: {
    cancelTipSearch() {
      if (!tipController) return
      tipController.abort()
      tipController = null
    },
    search(str) {
      this.cancelTipSearch()
      tipController = new AbortController()
      return requestJson(buildSearchUrl(str, 1, 8), tipController.signal)
        .then(data => (data.results || []).map(item => ({
          name: item.title || '',
          singer: item.creator || '',
          source: 'ov',
        })))
        .finally(() => { tipController = null })
    },
  },

  /** 消费点读的是返回值的 `.promise`（`core/music/utils.ts`）。 */
  getMusicUrl(songInfo, type) {
    const controller = new AbortController()
    return {
      promise: resolveUrlBySongmid(songInfo.songmid, controller.signal).then(url => ({ type, url })),
      cancelHttp() {
        controller.abort()
      },
    }
  },

  /** 消费点**直接 await 返回值**（不是 `.promise`），与 getMusicUrl 不同。 */
  getPic(songInfo) {
    if (songInfo.img) return Promise.resolve(songInfo.img)
    const cached = trackCache.get(songInfo.songmid)
    return Promise.resolve((cached && cached.thumbnail) || null)
  },

  /**
   * 这个源不提供歌词。
   *
   * 但**不 reject** —— 消费点（`core/music/utils.ts:457`）要求 `lyric` 里必须
   * 有时间戳（`existTimeExp`），落空就会触发 `onToggleSource()` 去**换源**，
   * 白跑一轮还给用户一个报错。所以这里给两行带时间戳的说明：既避免报错，
   * 又把 CC 授权来源讲清楚。
   */
  getLyric(songInfo) {
    const title = [songInfo.name, songInfo.singer].filter(Boolean).join(' - ')
    // `attribution` 是曲库**现成的整套署名文案**（作品名 + 作者 + 许可证名称 +
    // 许可证地址），CC-BY 系列本来就要求署名，而歌词面板是这个源唯一稳定的
    // 文字展示位 —— 所以放这里最合适。重启后缓存为空时回落成作品页链接，
    // 同样表达了「来源 + 许可证」。
    const cached = trackCache.get(songInfo.songmid)
    const credit = (cached && cached.attribution) ||
      `来自开放曲库（Openverse，CC 授权 / 公有领域）https://openverse.org/audio/${songInfo.songmid}`
    return {
      promise: Promise.resolve({
        lyric: `[00:00.00]${title}\n[00:00.00]${credit}\n`,
        tlyric: null,
        rlyric: null,
        lxlyric: null,
      }),
    }
  },
}
