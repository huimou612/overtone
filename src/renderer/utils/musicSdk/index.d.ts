/**
 * `musicSdk` 的类型声明。
 *
 * 为什么需要它：内置平台接口全部删除后（见 `index.js` 顶部说明），这个模块的
 * 导出里不再有 kw / kg / tx / wy / mg 这些 key，而调用点仍然是
 * `musicSdk[musicInfo.source].getMusicUrl(...)` 这种按 source 取值的写法 ——
 * 少了索引签名，TS 会对那 40 余处访问报
 * `TS7053: Element implicitly has an 'any' type because expression of type
 * '"kw" | "wy" | ...' can't be used to index type '{ init... }'`。
 *
 * 这里只补两件事：
 *   1. 一个 `[key: string]: any` 的索引签名，让 `musicSdk[source]` 合法；
 *   2. 把几个具名成员的形状写清楚。
 *
 * ⚠️ 索引签名给的是 `any`，但**运行时不保证有值**：泛音里没有任何内置源，
 * 真实取值会落到 `index.js` 里那个 Proxy 空壳上。调用点靠 `?.` 与
 * `try / catch` 兜底，取不到实现就走「换源失败」的降级分支。
 */
declare const musicSdk: {
  /** 内置源列表。泛音里是**空数组** —— 没有内置源 */
  sources: Array<{ name: string, id: string }>
  init: () => Promise<unknown>
  /**
   * 与 `api-source.js` 的导出同源。
   *
   * 类型刻意留成 `object`（而不是 `Record<string, any>` 之类）：`core/apiSource.ts`
   * 里有一行 `@ts-expect-error` 是依赖「索引它确实会报错」的，一旦放宽，
   * 那条指令自己会反过来报 TS2578（未使用的 @ts-expect-error）。
   */
  supportQuality: object
  searchMusic: (params: {
    name?: string
    singer?: string
    source?: string
    limit?: number
  }) => Promise<any[]>
  findMusic: (params: {
    name?: string
    singer?: string
    albumName?: string
    interval?: string
    source?: string
  }) => Promise<any[]>
  [key: string]: any
}

/**
 * 具名导出：某个 source 当前是否有可用实现。
 *
 * 泛音里恒为 `false`（`sources` 是空数组）。`renderer/utils/data.ts` 用它把
 * 持久化设置里存着的失效 source（存量用户盘上的 `kw`）归一化掉。
 */
export declare const isValidSource: (source: string) => boolean

export default musicSdk
