import ClassicMode from './modes/classic.vue'

/**
 * 沉浸式视觉模式注册表（L1）
 *
 * 为什么是「显式静态列表」而不是自动发现：本项目用 webpack 5 + vue-loader，
 * 没有 Vite 的 `import.meta.glob`；用 `require.context` 虽然能扫目录，但会
 * 把「哪些文件是模式」这件事藏进文件名约定里，不利于审阅。L1 只有一个模式，
 * 显式列表最省事也最不容易出错。L4 模式变多时，再把 `component` 换成
 * `defineAsyncComponent(() => import('./modes/xxx.vue'))` 拆包即可，契约不变。
 *
 * 模式契约（最小化，别提前抽象）：
 *   { id, label, labelKey, order, component }
 *   · id        唯一标识，用于设置持久化与调试
 *   · label     内部标识/兜底名（未接 i18n 的场景用它）
 *   · labelKey  i18n 键，面板里显示用
 *   · order     面板里的排序
 *   · component Vue 组件；props 见 modes/classic.vue 顶部注释
 *     硬约束：只消费 props 里的时间，不读 audio、不自建 rAF。
 */
export const DEFAULT_MODE_ID = 'classic'

const MODE_LIST = [
  {
    id: 'classic',
    label: '经典',
    labelKey: 'immersive_lyric__mode_classic',
    order: 10,
    component: ClassicMode,
  },
]

// 加载即自检：id 唯一、字段齐全、默认模式存在。
// 宁可启动就抛错，也不要等到用户切模式时静默白屏。
const seen = new Set()
for (const mode of MODE_LIST) {
  if (!mode || typeof mode.id !== 'string' || mode.id.length === 0) {
    throw new Error('[immersive/registry] 模式缺少 id')
  }
  if (seen.has(mode.id)) {
    throw new Error(`[immersive/registry] 模式 id 重复：${mode.id}`)
  }
  if (!mode.component) {
    throw new Error(`[immersive/registry] 模式 ${mode.id} 缺少 component`)
  }
  seen.add(mode.id)
}
if (!seen.has(DEFAULT_MODE_ID)) {
  throw new Error(`[immersive/registry] 默认模式 ${DEFAULT_MODE_ID} 未注册`)
}

const MODE_MAP = new Map(MODE_LIST.map(mode => [mode.id, mode]))

/** 按 order 排序后的模式列表（面板展示用） */
export const listModes = () => MODE_LIST.slice().sort((a, b) => a.order - b.order)

/** 按 id 取模式；未知 id 一律回落到 classic（设置项缺失/脏数据时的安全兜底） */
export const getMode = id => MODE_MAP.get(id) ?? MODE_MAP.get(DEFAULT_MODE_ID)

/** 某个 id 是否已注册 */
export const hasMode = id => MODE_MAP.has(id)
