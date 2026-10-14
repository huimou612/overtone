export const URL_SCHEME_RXP = /^overtone:\/\//

export const SPLIT_CHAR = {
  DISLIKE_NAME: '@',
  DISLIKE_NAME_ALIAS: '#',
} as const

export const STORE_NAMES = {
  APP_SETTINGS: 'config_v2',
  DATA: 'data',
  SYNC: 'sync',
  HOTKEY: 'hot_key',
  USER_API: 'user_api',
  LRC_RAW: 'lyrics',
  LRC_EDITED: 'lyrics_edited',
  THEME: 'theme',
  SOUND_EFFECT: 'sound_effect',
  // 泛音新增：AI 歌词处理的配置与加密后的 API Key（ai.json）
  AI: 'ai',
} as const

export const APP_EVENT_NAMES = {
  winMainName: 'win_main',
  winLyricName: 'win_lyric',
  trayName: 'tray',
} as const

export const LIST_IDS = {
  DEFAULT: 'default',
  LOVE: 'love',
  TEMP: 'temp',
  DOWNLOAD: 'download',
  PLAY_LATER: null,
} as const

export const DATA_KEYS = {
  viewPrevState: 'viewPrevState',
  playInfo: 'playInfo',
  searchHistoryList: 'searchHistoryList',
  listScrollPosition: 'listScrollPosition',
  listPrevSelectId: 'listPrevSelectId',
  listUpdateInfo: 'listUpdateInfo',
  ignoreVersion: 'ignoreVersion',

  leaderboardSetting: 'leaderboardSetting',
  songListSetting: 'songListSetting',
  searchSetting: 'searchSetting',

  lastStartInfo: 'lastStartInfo',
} as const

/**
 * 默认设置。
 *
 * ⚠️ 与 source 相关的默认值一律是**空串**，不是平台 id。
 *
 * 上游这里写的是 `'kw'` / `'kw__16'` / `'new'`（酷我的默认榜单与排序），因为
 * 那时内置源总是存在的。泛音删掉了全部内置平台接口（红线，见
 * `utils/musicSdk/index.js`），这些默认值就变成了**指向不存在的源**：新建一个
 * profile 打开应用，URL 会是 `?source=kw` —— 看起来像这个源还在，而且
 * `TagList` 会把空结果写进 `tags['kw']` 缓存。
 *
 * 归到空串之后，各页面自然走「没有可用源」分支：`TagList` 的 `if (!source) return`
 * 不再发请求、源下拉框（sourceList）为空、列表区显示「暂无内容」。
 * 存量用户盘上已落着的 `'kw'` 由 `renderer/utils/data.ts` 的 `clearInvalidSource` 兜住。
 *
 * 例外：`search.source` 保持 `'all'` —— 那是聚合视图，不是某个平台，删源后依然存在。
 */
export const DEFAULT_SETTING = {
  leaderboard: {
    source: '',
    boardId: '',
  },

  songList: {
    source: '',
    sortId: '',
    tagId: '',
  },

  search: {
    temp_source: '',
    source: 'all',
    type: 'music',
  },

  viewPrevState: {
    url: '/search',
    query: {},
  },
}

export const DOWNLOAD_STATUS = {
  RUN: 'run',
  WAITING: 'waiting',
  PAUSE: 'pause',
  ERROR: 'error',
  COMPLETED: 'completed',
} as const

export const QUALITYS = ['flac24bit', 'flac', 'wav', 'ape', '320k', '192k', '128k'] as const

export const TRAY_AUTO_ID = -1
