import apiSourceInfo from './api-source-info'
import { apiSource, userApi } from '@renderer/store'

/**
 * 音源 API 的分发点。两条路：
 *
 * 1. **自定义源**（`apiSource` 形如 `user_api*`）→ 直接返回 `userApi.apis[source]`。
 *    这是现在唯一走得通的路。由 `core/useApp/useInitUserApi.ts` 注册，内含
 *    musicUrl / lyric / pic 三种 action，也顺带承担本地音乐（source 为 `local`）的读取。
 * 2. **内置源** → 查 `apiList` 表。这张表由 `apiSourceInfo`（注册表）与各平台的
 *    接口实现共同构成。
 *
 * ⚠️ 泛音里这条路是**关闭**的：`api-source-info.ts` 是空数组（上游 `1ff6a006`
 * 「移除所有内置源」只清空了注册表），平台实现目录也已整体删除（见 `index.js`
 * 顶部说明）。所以 `supportQuality` 与 `apiList` 恒为空、`getAPI()` 恒返回
 * `undefined`，`apis()` 对非自定义源一律抛 `Api is not found`。
 *
 * 这里保留表的结构而不是把 `apis()` 简化成一行，是为了让「注册表 + 实现表」
 * 这套形状还在：将来若要支持自定义源注册搜索能力，接着往这里挂即可。
 * 上游原本还有一张 `allApi`（把各平台 `api-temp` / `api-test` 调试接口映射成
 * `<id>_<source>`），那些 import 早已被注释掉、表本身就是空的 —— 已一并清掉。
 */
const apiList = {}
const supportQuality = {}

for (const api of apiSourceInfo) {
  supportQuality[api.id] = api.supportQualitys
}

const getAPI = source => apiList[`${apiSource.value}_api_${source}`]

const apis = source => {
  if (/^user_api/.test(apiSource.value)) return userApi.apis[source]
  let api = getAPI(source)
  if (api) return api
  throw new Error('Api is not found')
}

/**
 * 取「用户导入的自定义源」为某个 source 提供的实现。
 *
 * 为什么需要这个出口 —— 在线歌的**主播放路径**不是走 `apis()`，而是
 * `core/music/utils.ts` 里的 `musicSdk[musicInfo.source].getMusicUrl(...)`；
 * `apis()` 只在「换源」时被调用。删掉内置实现后 `musicSdk[source]` 落到
 * 空壳上，主路径就永远失败了 —— 这跟用户有没有导入音源无关。
 *
 * 这里把用户导入的源暴露给 `index.js` 的 Proxy：**泛音自身仍不含任何平台实现**，
 * 只是把「用户自己导入的东西」接上正确的调用点（见 index.js 的 Proxy 说明）。
 *
 * 返回的对象可能是空的（脚本没声明这个 source），调用方据此回落空壳。
 */
const getApiImpl = source =>
  /^user_api/.test(String(apiSource.value)) ? userApi.apis[source] : undefined

export { apis, supportQuality, getApiImpl }
