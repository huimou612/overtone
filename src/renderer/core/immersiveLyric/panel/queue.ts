/**
 * 沉浸式侧栏「当前列表」的数据整形 —— 纯函数
 *
 * 为什么单独抽出来：
 *  1. 面板里的队列是**只读视图**，但「谁是当前曲」这件事有三条来源容易写错：
 *     列表内的 id 匹配、播放器的 playIndex、以及「稍后播放」的临时曲根本不在列表里。
 *  2. 非法状态（列表 id 为空、列表没加载、索引越界、列表被判空）必须**安全降级**，
 *     不能抛异常 —— 面板是跟着播放页一起挂的，一抛就是整页白。
 *
 * 这里只有纯计算：无 import（类型除外）、无定时器、无 DOM、无播放器调用，
 * 因此可以被 build-config/test-l2-panel.cjs 用 data: URL 直接载入测试。
 *
 * ⚠️ 语义约定（不要擅自"优化"）：
 *  · **不排序、不去重、不截断**：面板展示的就是当前列表的原样顺序；
 *    真实「下一首」还会受「稍后播放」「已播放列表」与播放模式影响，
 *    那不是这里该猜的事（由 UI 的提示文案负责说明）。
 *  · 当前曲优先按 **id 匹配**（列表可能被重排/插入）；id 匹配不到且不是临时播放时，
 *    才退回播放器给的 playIndex。两条都不成立 → 不高亮，并标记 currentOutsideList。
 */

export interface QueueRow {
  music: any
  /** 在**当前列表**中的下标（不是播放顺序） */
  index: number
  isCurrent: boolean
  /** 虚拟列表的 key：下标 + id，避免同名/重复 id 撞 key */
  rowKey: string
}

export interface QueueView {
  rows: QueueRow[]
  /** 没有可展示的歌曲（列表 id 为空 / 列表未加载 / 列表为空） */
  isEmpty: boolean
  /** 有当前曲，但它不在这份列表里（典型：正在播「稍后播放」的临时曲） */
  currentOutsideList: boolean
}

const EMPTY = (currentOutsideList: boolean): QueueView => ({
  rows: [],
  isEmpty: true,
  currentOutsideList,
})

export const resolveQueueView = (
  list: unknown,
  listId: unknown,
  currentId: unknown,
  playIndex: unknown,
  isTempPlay: unknown,
): QueueView => {
  // 列表 id 缺失（例如 playInfo.playerListId 为 null）→ 空态
  if (typeof listId !== 'string' || listId.length === 0) return EMPTY(false)
  if (!Array.isArray(list) || list.length === 0) return EMPTY(false)

  const hasCurrent = typeof currentId === 'string' && currentId.length > 0

  let currentIndex = -1
  if (hasCurrent) {
    currentIndex = list.findIndex(music => music != null && music.id === currentId)
  }
  // 临时播放的曲目本来就不在列表里，不能用 playIndex 顶替；
  // 也必须有「当前曲」才谈得上回退 —— 什么都没在播时不该高亮第 0 行。
  if (
    currentIndex < 0 &&
    hasCurrent &&
    isTempPlay !== true &&
    typeof playIndex === 'number' &&
    Number.isInteger(playIndex) &&
    playIndex >= 0 &&
    playIndex < list.length
  ) {
    currentIndex = playIndex
  }

  const rows: QueueRow[] = list.map((music, index) => ({
    music,
    index,
    isCurrent: index === currentIndex,
    rowKey: `${index}:${music?.id != null ? music.id : ''}`,
  }))

  return {
    rows,
    isEmpty: false,
    currentOutsideList: currentIndex < 0 && hasCurrent,
  }
}
