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
 * 与 source 相关的默认值是上游的 `'kw'` / `'kw__16'` / `'new'`（酷我的默认榜单与
 * 排序）。阶段 5 删掉内置平台接口时，这四处被改成了空串 —— 否则新建 profile 一
 * 打开就是指向不存在源的 `?source=kw`，`TagList` 还会把空结果写进 `tags['kw']`。
 *
 * 现在七个平台源已按用户要求恢复（见 `utils/musicSdk/index.js`），这些默认值重新
 * 有效，所以跟着还原。
 *
 * ⚠️ 仍会有失效的 source（用户导入的自定义源被移除、或将来源被删）。那一层不靠
 * 默认值兜，而靠 `renderer/utils/data.ts` 的 `clearInvalidSourceField` +
 * `isValidSource`：读设置时把指向不存在源的 `source` 归一成空串，各页面于是自然
 * 走「没有可用源」分支（`TagList` 的 `if (!source) return` 不发请求、源下拉框为空、
 * 列表区显示「暂无内容」）。
 *
 * 例外：`search.source` 保持 `'all'` —— 那是聚合视图，不是某个平台。
 */
export const DEFAULT_SETTING = {
  leaderboard: {
    source: 'kw',
    boardId: 'kw__16',
  },

  songList: {
    source: 'kw',
    sortId: 'new',
    tagId: '',
  },

  search: {
    temp_source: 'kw',
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
