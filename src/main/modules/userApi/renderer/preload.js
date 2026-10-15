import { contextBridge, ipcRenderer, webFrame } from 'electron'
import needle from 'needle'
import zlib from 'zlib'
import { createCipheriv, publicEncrypt, constants, randomBytes, createHash } from 'crypto'
import USER_API_RENDERER_EVENT_NAME from '../rendererEvent/name'
import { httpOverHttp, httpsOverHttp } from 'tunnel'


const sendMessage = (action, data, status, message) => {
  ipcRenderer.send(action, { data, status, message })
}

let isInitedApi = false
const proxy = {
  host: '',
  port: '',
}
let isShowedUpdateAlert = false
const EVENT_NAMES = {
  request: 'request',
  inited: 'inited',
  updateAlert: 'updateAlert',
}
const eventNames = Object.values(EVENT_NAMES)
const events = {
  request: null,
}
const allSources = ['kw', 'kg', 'tx', 'wy', 'mg', 'local']
const supportQualitys = {
  kw: ['128k', '320k', 'flac', 'flac24bit'],
  kg: ['128k', '320k', 'flac', 'flac24bit'],
  tx: ['128k', '320k', 'flac', 'flac24bit'],
  wy: ['128k', '320k', 'flac', 'flac24bit'],
  mg: ['128k', '320k', 'flac', 'flac24bit'],
  local: [],
}
/**
 * 每个 source 允许脚本声明的能力白名单（顺序即返回给渲染层的顺序）。
 *
 * 为什么 kw / kg / tx / wy / mg 原来只有 `musicUrl` —— 上游 LX Music 的**内置**
 * 平台接口自带「搜索 / 榜单 / 歌单 / 歌词 / 封面」，自定义源只需要补「取播放地址」
 * 这一块。泛音把内置接口整体删掉了（见 renderer/utils/musicSdk/index.js 顶部说明），
 * 于是搜索、歌词、封面全都**没有提供者**了：用户导入一个自定义源之后，仍然是
 * 「搜不到歌、没有封面、没有歌词」。
 *
 * 所以这里放开三个能力：
 *   - `musicSearch` 搜索（本次新增，见 verifySearchResult）
 *   - `lyric` 歌词、`pic` 封面（删源后同样无提供者，一起补上）
 *
 * ⚠️ 这里只是「允许声明」；真正的结构校验与规范化在下面的 handleRequest /
 * verifySearchResult 里做 —— 脚本可以声明，但返回什么由宿主说了算。
 */
const supportActions = {
  kw: ['musicUrl', 'musicSearch', 'lyric', 'pic'],
  kg: ['musicUrl', 'musicSearch', 'lyric', 'pic'],
  tx: ['musicUrl', 'musicSearch', 'lyric', 'pic'],
  wy: ['musicUrl', 'musicSearch', 'lyric', 'pic'],
  mg: ['musicUrl', 'musicSearch', 'lyric', 'pic'],
  xm: ['musicUrl'],
  local: ['musicUrl', 'lyric', 'pic'],
}

const httpsRxp = /^https:/
const getRequestAgent = url => {
  return proxy.host ? (httpsRxp.test(url) ? httpsOverHttp : httpOverHttp)({
    proxy: {
      host: proxy.host,
      port: proxy.port,
    },
  }) : undefined
}

const verifyLyricInfo = (info) => {
  if (typeof info != 'object' || typeof info.lyric != 'string') throw new Error('failed')
  if (info.lyric.length > 51200) throw new Error('failed')
  return {
    lyric: info.lyric,
    tlyric: (typeof info.tlyric == 'string' && info.tlyric.length < 5120) ? info.tlyric : null,
    rlyric: (typeof info.rlyric == 'string' && info.rlyric.length < 5120) ? info.rlyric : null,
    lxlyric: (typeof info.lxlyric == 'string' && info.lxlyric.length < 8192) ? info.lxlyric : null,
  }
}

/**
 * 搜索结果的规模上限。
 *
 * 结果要从「沙箱窗口 → 主进程 → 渲染进程」连传两趟，脚本塞个几 MB 的响应会把
 * IPC 卡住；而且渲染层的虚拟列表也吃不下这么多。20 是 Openverse 匿名档、
 * 各平台接口的常见单页量级，取 100 留足余量。
 */
const SEARCH_LIST_MAX = 100
const SEARCH_RESULT_MAX_LENGTH = 1048576

const INTERVAL_RXP = /^\d{1,3}:\d{1,2}$/

/**
 * 把脚本给的时长归一化成消费点认识的 `mm:ss`。
 *
 * 为什么要归一化 —— 消费点（`handleSortList` 的相似度排序、`findMusic` 的
 * `getIntv`）只认 `mm:ss` 这种带冒号的字符串；而「换源」功能要靠时长判同一首歌。
 * 脚本作者最容易犯的错是把接口返回的**毫秒**或**秒**直接透传（Openverse 的
 * `duration` 就是毫秒，实测 129000 → 应为 02:09）。
 *
 * 判据：>= 1000 的一律当成毫秒 —— 一首歌不可能短于 1000 秒（≈16 分钟），
 * 所以这个阈值不会误伤「秒」。
 */
const normalizeInterval = (value) => {
  if (typeof value == 'string' && INTERVAL_RXP.test(value.trim())) {
    const [m, s] = value.trim().split(':')
    return `${m.padStart(2, '0')}:${s.padStart(2, '0')}`
  }
  let num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return null
  if (num >= 1000) num = Math.round(num / 1000)
  const m = Math.floor(num / 60)
  const s = Math.floor(num % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * 把脚本给的歌曲条目规范成 `MusicInfo`。
 *
 * ⚠️ 三个字段是**硬约束**，缺一个整条结果就作废（抛错 → 渲染层看到搜索失败）：
 *   - `name`：列表要显示，去重排序也要用
 *   - `songmid`：`toNewMusicInfo` 拿它拼 `id`（`${source}_${songmid}`），
 *     `deduplicationList` 靠这个 id 去重；取地址时也会原样回传给脚本
 *   - `source`：**由宿主钉死**，不采信脚本给的值。搜出来的歌会带着这个 source
 *     走播放主路径（`musicSdk[source].getMusicUrl`），脚本乱标就会取到别人的实现
 *
 * `_types` 必须是对象、`types` 必须是数组：`toNewMusicInfo` 会读
 * `meta._qualitys.flac32bit`，给个 undefined 会直接 TypeError。
 */
const normalizeMusicItem = (item, source) => {
  if (!item || typeof item != 'object') throw new Error('search result item is not an object')
  const name = typeof item.name == 'string' ? item.name.trim() : ''
  if (!name) throw new Error('search result item is missing "name"')
  const songmid = item.songmid ?? item.songId ?? item.id
  if (songmid == null || songmid === '') throw new Error(`search result item "${name}" is missing "songmid"`)
  return {
    name,
    singer: typeof item.singer == 'string' ? item.singer : (typeof item.artist == 'string' ? item.artist : ''),
    source,
    songmid: String(songmid),
    albumId: item.albumId != null ? String(item.albumId) : '',
    interval: normalizeInterval(item.interval),
    albumName: typeof item.albumName == 'string' ? item.albumName : (typeof item.album == 'string' ? item.album : ''),
    img: typeof item.img == 'string' ? item.img : (typeof item.pic == 'string' ? item.pic : null),
    // 下面这几个是消费点的形状要求（不是功能要求）：
    // `lrc` / `otherSource` 允许为 null，但 `types` / `_types` / `typeUrl` 必须是
    // 数组或对象 —— 见上面的说明。
    lrc: null,
    otherSource: null,
    types: [],
    _types: {},
    typeUrl: {},
  }
}

/**
 * 校验并规范化搜索结果。
 *
 * 契约（以渲染层 `store/search/music/action.ts` 实际读的字段为准）：
 *   `{ list, total, limit, allPage }` —— `setList` 会读全部四个，`limit` 缺了
 *   分页会错乱、`allPage` 缺了翻页控件会错乱，所以这里一律补齐而不是原样透传。
 *
 * 允许脚本直接返回**裸数组**（省事），等价于 `{ list }`。
 */
const verifySearchResult = (response, source, info) => {
  if (!response || typeof response != 'object') throw new Error('search result must be an object')
  const rawList = Array.isArray(response) ? response : response.list
  if (!Array.isArray(rawList)) throw new Error('search result is missing "list"')
  const limit = Math.min(Math.max(Math.floor(Number(info?.limit)) || 30, 1), SEARCH_LIST_MAX)
  const list = rawList.slice(0, SEARCH_LIST_MAX).map(item => normalizeMusicItem(item, source))
  let total = Math.floor(Number(response.total))
  if (!Number.isFinite(total) || total < 0) total = list.length
  let allPage = Math.floor(Number(response.allPage))
  if (!Number.isFinite(allPage) || allPage < 1) allPage = Math.max(1, Math.ceil(total / limit))
  return { list, total, limit, allPage, source }
}

const handleRequest = (context, { requestKey, data }) => {
  // console.log(data)
  if (!events.request) return sendMessage(USER_API_RENDERER_EVENT_NAME.response, { requestKey }, false, 'Request event is not defined')
  try {
    events.request.call(context, { source: data.source, action: data.action, info: data.info }).then(response => {
      let sendData = {
        requestKey,
      }
      switch (data.action) {
        case 'musicUrl':
          if (typeof response != 'string' || response.length > 2048 || !/^https?:/.test(response)) throw new Error('failed')
          sendData.result = {
            source: data.source,
            action: data.action,
            data: {
              type: data.info.type,
              url: response,
            },
          }
          break
        case 'lyric':
          sendData.result = {
            source: data.source,
            action: data.action,
            data: verifyLyricInfo(response),
          }
          break
        case 'pic':
          if (typeof response != 'string' || response.length > 2048 || !/^https?:/.test(response)) throw new Error('failed')
          sendData.result = {
            source: data.source,
            action: data.action,
            data: response,
          }
          break
        case 'musicSearch': {
          const result = verifySearchResult(response, data.source, data.info)
          if (JSON.stringify(result).length > SEARCH_RESULT_MAX_LENGTH) throw new Error('search result is too large')
          sendData.result = {
            source: data.source,
            action: data.action,
            data: result,
          }
          break
        }
      }
      sendMessage(USER_API_RENDERER_EVENT_NAME.response, sendData, true)
    }).catch(err => {
      sendMessage(USER_API_RENDERER_EVENT_NAME.response, { requestKey }, false, err.message)
    })
  } catch (err) {
    sendMessage(USER_API_RENDERER_EVENT_NAME.response, { requestKey }, false, err.message)
  }
}

/**
 * 处理脚本的 `inited` 事件：收集它声明了哪些 source、哪些能力。
 *
 * @param {*} context
 * @param {*} info 脚本里 `lx.send(lx.EVENT_NAMES.inited, info)` 传进来的对象：
 *                  {
 *                    openDevTools: false,          // 可选，调试用
 *                    sources: {
 *                      kw: {
 *                        type: 'music',              // 目前只认 'music'
 *                        actions: ['musicUrl', 'musicSearch', 'lyric', 'pic'],
 *                        qualitys: ['128k', '320k'],
 *                      },
 *                    },
 *                  }
 *
 * ⚠️ 脚本声明的 actions / qualitys 会先按 supportActions / supportQualitys 两张
 * 白名单过滤 —— 声明了白名单之外的能力会被**静默丢弃**（不是报错），所以脚本
 * 作者排错时应该先看这里，而不是看自己的代码。
 * ⚠️ `allSources` 之外的新 source id 也会被丢弃：源名（`source_kw` 等）来自语言包，
 * 泛音不打算为自定义源再做一套动态名称体系。
 */
const handleInit = (context, info) => {
  if (!info) {
    sendMessage(USER_API_RENDERER_EVENT_NAME.init, null, false, 'Missing required parameter init info')
    // sendMessage(USER_API_RENDERER_EVENT_NAME.init, false, null, typeof info.message === 'string' ? info.message.substring(0, 100) : '')
    return
  }
  if (info.openDevTools === true) {
    sendMessage(USER_API_RENDERER_EVENT_NAME.openDevTools)
  }
  // if (!info.status) {
  //   sendMessage(USER_API_RENDERER_EVENT_NAME.init, null, false, 'Missing required parameter init info')
  //   // sendMessage(USER_API_RENDERER_EVENT_NAME.init, false, null, typeof info.message === 'string' ? info.message.substring(0, 100) : '')
  //   return
  // }
  const sourceInfo = {
    sources: {},
  }
  try {
    for (const source of allSources) {
      const userSource = info.sources[source]
      if (!userSource || userSource.type !== 'music') continue
      const qualitys = supportQualitys[source]
      const actions = supportActions[source]
      sourceInfo.sources[source] = {
        type: 'music',
        actions: actions.filter(a => userSource.actions.includes(a)),
        qualitys: qualitys.filter(q => userSource.qualitys.includes(q)),
      }
    }
  } catch (error) {
    console.log(error)
    sendMessage(USER_API_RENDERER_EVENT_NAME.init, null, false, error.message)
    return
  }
  sendMessage(USER_API_RENDERER_EVENT_NAME.init, sourceInfo, true)

  ipcRenderer.on(USER_API_RENDERER_EVENT_NAME.request, (event, data) => {
    handleRequest(context, data)
  })
}

const handleShowUpdateAlert = (data, resolve, reject) => {
  if (!data || typeof data != 'object') return reject(new Error('parameter format error.'))
  if (!data.log || typeof data.log != 'string') return reject(new Error('log is required.'))
  if (data.updateUrl && !/^https?:\/\/[^\s$.?#].[^\s]*$/.test(data.updateUrl) && data.updateUrl.length > 1024) delete data.updateUrl
  if (data.log.length > 1024) data.log = data.log.substring(0, 1024) + '...'
  sendMessage(USER_API_RENDERER_EVENT_NAME.showUpdateAlert, {
    log: data.log,
    updateUrl: data.updateUrl,
  })
  resolve()
}

const onError = (errorMessage) => {
  if (isInitedApi) return
  isInitedApi = true
  if (errorMessage.length > 1024) errorMessage = errorMessage.substring(0, 1024) + '...'
  sendMessage(USER_API_RENDERER_EVENT_NAME.init, null, false, errorMessage)
}

const initEnv = (userApi) => {
  proxy.host = userApi.proxy.host
  proxy.port = userApi.proxy.port

  contextBridge.exposeInMainWorld('lx', {
    EVENT_NAMES,
    request(url, { method = 'get', timeout, headers, body, form, formData }, callback) {
      let options = {
        headers,
        agent: getRequestAgent(url),
      }
      let data
      if (body) {
        data = body
      } else if (form) {
        data = form
        // data.content_type = 'application/x-www-form-urlencoded'
        options.json = false
      } else if (formData) {
        data = formData
        // data.content_type = 'multipart/form-data'
        options.json = false
      }
      options.response_timeout = typeof timeout == 'number' && timeout > 0 ? Math.min(timeout, 60_000) : 60_000

      let request = needle.request(method, url, data, options, (err, resp, body) => {
        // console.log(err, resp, body)
        try {
          if (err) {
            callback.call(this, err, null, null)
          } else {
            body = resp.body = resp.raw.toString()
            try {
              resp.body = JSON.parse(resp.body)
            } catch (_) {}
            body = resp.body
            callback.call(this, err, {
              statusCode: resp.statusCode,
              statusMessage: resp.statusMessage,
              headers: resp.headers,
              bytes: resp.bytes,
              raw: resp.raw,
              body,
            }, body)
          }
        } catch (err) {
          onError(err.message)
        }
      }).request

      return () => {
        if (!request.aborted) request.abort()
        request = null
      }
    },
    send(eventName, data) {
      return new Promise((resolve, reject) => {
        if (!eventNames.includes(eventName)) return reject(new Error('The event is not supported: ' + eventName))
        switch (eventName) {
          case EVENT_NAMES.inited:
            if (isInitedApi) return reject(new Error('Script is inited'))
            isInitedApi = true
            handleInit(this, data)
            resolve()
            break
          case EVENT_NAMES.updateAlert:
            if (isShowedUpdateAlert) return reject(new Error('The update alert can only be called once.'))
            isShowedUpdateAlert = true
            handleShowUpdateAlert(data, resolve, reject)
            break
          default:
            reject(new Error('Unknown event name: ' + eventName))
        }
      })
    },
    on(eventName, handler) {
      if (!eventNames.includes(eventName)) return Promise.reject(new Error('The event is not supported: ' + eventName))
      switch (eventName) {
        case EVENT_NAMES.request:
          events.request = handler
          break
        default: return Promise.reject(new Error('The event is not supported: ' + eventName))
      }
      return Promise.resolve()
    },
    utils: {
      crypto: {
        aesEncrypt(buffer, mode, key, iv) {
          const cipher = createCipheriv(mode, key, iv)
          return Buffer.concat([cipher.update(buffer), cipher.final()])
        },
        rsaEncrypt(buffer, key) {
          buffer = Buffer.concat([Buffer.alloc(128 - buffer.length), buffer])
          return publicEncrypt({ key, padding: constants.RSA_NO_PADDING }, buffer)
        },
        randomBytes(size) {
          return randomBytes(size)
        },
        md5(str) {
          return createHash('md5').update(str).digest('hex')
        },
      },
      buffer: {
        from(...args) {
          return Buffer.from(...args)
        },
        bufToString(buf, format) {
          return Buffer.from(buf, 'binary').toString(format)
        },
      },
      zlib: {
        inflate(buf) {
          return new Promise((resolve, reject) => {
            zlib.inflate(buf, (err, data) => {
              if (err) reject(new Error(err.message))
              else resolve(data)
            })
          })
        },
        deflate(data) {
          return new Promise((resolve, reject) => {
            zlib.deflate(data, (err, buf) => {
              if (err) reject(new Error(err.message))
              else resolve(buf)
            })
          })
        },
      },
    },
    currentScriptInfo: {
      name: userApi.name,
      description: userApi.description,
      version: userApi.version,
      author: userApi.author,
      homepage: userApi.homepage,
      rawScript: userApi.script,
    },
    version: '2.0.0',
    env: 'desktop',
    // removeEvent(eventName, handler) {
    //   if (!eventNames.includes(eventName)) return Promise.reject(new Error('The event is not supported: ' + eventName))
    //   let handlers
    //   switch (eventName) {
    //     case EVENT_NAMES.request:
    //       handlers = events.request
    //       break
    //   }
    //   for (let index = 0; index < handlers.length; index++) {
    //     if (handlers[index] === handler) {
    //       handlers.splice(index, 1)
    //       break
    //     }
    //   }
    // },
    // removeAllEvents() {
    //   for (const handlers of Object.values(events)) {
    //     handlers.splice(0, handlers.length)
    //   }
    // },
  })

  contextBridge.exposeInMainWorld('__lx_init_error_handler__', {
    sendError(errorMessage) {
      onError(errorMessage)
    },
  })

  webFrame.executeJavaScript(`(() => {
window.addEventListener('error', (event) => {
  if (event.isTrusted) globalThis.__lx_init_error_handler__.sendError(event.message.replace(/^Uncaught\\sError:\\s/, ''))
})
window.addEventListener('unhandledrejection', (event) => {
  if (!event.isTrusted) return
  const message = typeof event.reason === 'string' ? event.reason : event.reason?.message ?? String(event.reason)
  globalThis.__lx_init_error_handler__.sendError(message.replace(/^Error:\\s/, ''))
})
})()`)

  webFrame.executeJavaScript(userApi.script).catch(_ => _)
}


ipcRenderer.on(USER_API_RENDERER_EVENT_NAME.initEnv, (event, data) => {
  initEnv(data)
})

ipcRenderer.on(USER_API_RENDERER_EVENT_NAME.proxyUpdate, (event, data) => {
  proxy.host = data.host
  proxy.port = data.port
})
