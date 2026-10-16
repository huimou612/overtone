/**
 * `musicSdk` 的类型声明。
 *
 * 为什么需要它：模块的导出形状由 `index.js` 的展开 + Proxy 决定，而调用点写的是
 * `musicSdk[musicInfo.source].getMusicUrl(...)` 这种按 source 取值的写法 ——
 * 少了索引签名，TS 会对那 40 余处访问报
 * `TS7053: Element implicitly has an 'any' type because expression of type
 * '"kw" | "wy" | ...' can't be used to index type '{ init... }'`。
 *
 * （这个文件是阶段 5「删掉内置源」时加的，因为那时导出里不再有 kw / kg / tx / wy / mg
 * 这些 key。后来按用户要求把七个平台源还原了 —— 索引签名仍然需要，理由不变。）
 *
 * 这里只补两件事：
 *   1. 一个 `[key: string]: any` 的索引签名，让 `musicSdk[source]` 合法；
 *   2. 把几个具名成员的形状写清楚。
 *
 * ⚠️ 索引签名给的是 `any`，但**运行时不保证有值**：取不到的 source 会落到
 * `index.js` 里那个 Proxy 的空壳或 `getUserApiSource` 上。调用点靠 `?.` 与
 * `try / catch` 兜底，取不到实现就走「换源失败」的降级分支。
 */
declare const musicSdk: {
  /** 内置源列表：七个平台源（kw / kg / tx / wy / mg / xm）+ 开放曲库 ov */
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
 * 判据就是 `sources.sources`（内置源清单）。`renderer/utils/data.ts` 用它把持久化
 * 设置里存着的**失效** source 归一化掉（比如用户导入的自定义源被移除之后）；
 * `store/utils.ts` 的 `assertApiSupport` 也用它放行内置源的播放 / 下载按钮。
 */
export declare const isValidSource: (source: string) => boolean

export default musicSdk
