import { onBeforeUnmount, watch } from '@common/utils/vueTools'
import { useI18n } from '@renderer/plugins/i18n'
import { onUserApiStatus, getUserApiList, sendUserApiRequest as sendUserApiRequestRemote, userApiRequestCancel, onShowUserApiUpdateAlert } from '@renderer/utils/ipc'
import { openUrl } from '@common/utils/electron'
import { qualityList, userApi } from '@renderer/store'
import { initSearchSources } from '@renderer/store/search/music/state'
import { appSetting } from '@renderer/store/setting'
import { dialog } from '@renderer/plugins/Dialog'
import { setUserApi } from '@renderer/core/apiSource'

const sendUserApiRequest: typeof sendUserApiRequestRemote = async(data) => {
  let stop: () => void
  return new Promise<void>((resolve, reject) => {
    stop = watch(() => appSetting['common.apiSource'], () => {
      reject(new Error('source changed'))
    })
    void sendUserApiRequestRemote(data).then(resolve).catch(reject)
  }).finally(() => {
    stop()
  })
}

export default () => {
  const t = useI18n()

  const rUserApiStatus = onUserApiStatus(({ params: { status, message, apiInfo } }) => {
    // console.log({ status, message, apiInfo })
    userApi.status = status
    userApi.message = message

    if (!apiInfo || apiInfo.id !== appSetting['common.apiSource']) return
    if (status) {
      if (apiInfo.sources) {
        let apis: any = {}
        let qualitys: LX.QualityList = {}
        for (const [source, { actions, type, qualitys: sourceQualitys }] of Object.entries(apiInfo.sources)) {
          if (type != 'music') continue
          apis[source as LX.Source] = {}
          // 「搜得到必须播得了」。泛音在开放曲库上已经踩过一次同类坑：assertApiSupport
          // 只查 qualityList 时，会出现「搜得到、点了既不播也不报错」。这里的形态更糟 ——
          // 搜出来的歌 source 就是这个源，取播放地址也要走它
          // （core/music/utils.ts 的 `musicSdk[source].getMusicUrl`），缺 musicUrl
          // 等于给用户一个必然失败的入口。所以宁可不注册搜索能力。
          const canPlay = actions.includes('musicUrl')
          for (const action of actions) {
            switch (action) {
              case 'musicUrl':
                apis[source].getMusicUrl = (songInfo: LX.Music.MusicInfo, type: LX.Quality) => {
                  const requestKey = `request__${Math.random().toString().substring(2)}`
                  return {
                    canceleFn() {
                      userApiRequestCancel(requestKey)
                    },
                    promise: sendUserApiRequest({
                      requestKey,
                      data: {
                        source,
                        action: 'musicUrl',
                        info: {
                          type,
                          musicInfo: songInfo,
                        },
                      },
                      // eslint-disable-next-line @typescript-eslint/promise-function-async
                    }).then(res => {
                      // console.log(res)
                      return { type, url: res.data.url }
                    }).catch(async err => {
                      console.log(err.message)
                      return Promise.reject(err)
                    }),
                  }
                }
                break
              case 'lyric':
                apis[source].getLyric = (songInfo: LX.Music.MusicInfo) => {
                  const requestKey = `request__${Math.random().toString().substring(2)}`
                  return {
                    canceleFn() {
                      userApiRequestCancel(requestKey)
                    },
                    promise: sendUserApiRequest({
                      requestKey,
                      data: {
                        source,
                        action: 'lyric',
                        info: {
                          type,
                          musicInfo: songInfo,
                        },
                      },
                      // eslint-disable-next-line @typescript-eslint/promise-function-async
                    }).then(res => {
                      // console.log(res)
                      return res.data
                    }).catch(async err => {
                      console.log(err.message)
                      return Promise.reject(err)
                    }),
                  }
                }
                break
              case 'pic':
                apis[source].getPic = (songInfo: LX.Music.MusicInfo) => {
                  const requestKey = `request__${Math.random().toString().substring(2)}`
                  const request = sendUserApiRequest({
                    requestKey,
                    data: {
                      source,
                      action: 'pic',
                      info: {
                        type,
                        musicInfo: songInfo,
                      },
                    },
                    // eslint-disable-next-line @typescript-eslint/promise-function-async
                  }).then(res => {
                    // console.log(res)
                    return res.data
                  }).catch(async err => {
                    console.log(err.message)
                    return Promise.reject(err)
                  })
                  // ⚠️ 这里有两个**形状不同**的消费点，不能统一成一种：
                  //   - local 走 `apis('local').getPic(...).promise`
                  //     （core/music/utils.ts:211）
                  //   - 在线源走 `musicSdk[source].getPic(...)`，返回值**直接被当 Promise 用**
                  //     （core/music/utils.ts:363 / :393，下一句就是 .then）
                  // 上游只给 local 实现过 pic，所以在线源这条形状从没被验证过；现在放开了
                  // 自定义源的 pic 能力，不分开就会报 `reqPromise.then is not a function`。
                  return source == 'local'
                    ? {
                        canceleFn() {
                          userApiRequestCancel(requestKey)
                        },
                        promise: request,
                      }
                    : request
                }
                break
              case 'musicSearch':
                if (!canPlay) {
                  console.warn(`[userApi]「${source}」声明了 musicSearch 但没有 musicUrl，已跳过搜索注册：搜出来的歌取不到播放地址`)
                  break
                }
                apis[source].musicSearch = {
                  // 消费点（store/search/music/action.ts）把它当普通 Promise 用：
                  // `music[source]?.musicSearch.search(text, page, limit)`
                  search: (text: string, page: number, limit: number) => {
                    const requestKey = `request__${Math.random().toString().substring(2)}`
                    return sendUserApiRequest({
                      requestKey,
                      data: {
                        source,
                        action: 'musicSearch',
                        info: {
                          text,
                          page,
                          limit,
                        },
                      },
                      // eslint-disable-next-line @typescript-eslint/promise-function-async
                    }).then(res => {
                      // console.log(res)
                      const data = res.data ?? {}
                      // source 由宿主钉死：action.ts 的 setList 会拿它去查 listInfos，
                      // 拿脚本回传的值会有对不上 state 的风险。
                      return {
                        list: Array.isArray(data.list) ? data.list : [],
                        total: typeof data.total == 'number' ? data.total : 0,
                        limit: typeof data.limit == 'number' ? data.limit : 30,
                        allPage: typeof data.allPage == 'number' ? data.allPage : 1,
                        source,
                      }
                    }).catch(async err => {
                      console.log(err.message)
                      return Promise.reject(err)
                    })
                  },
                }
                break
              default:
                break
            }
          }
          qualitys[source as LX.Source] = sourceQualitys
        }
        qualityList.value = qualitys
        userApi.apis = apis
        // 让「声明了 musicSearch 的自定义源」出现在搜索页的源列表里。
        // 必须在这里调（apis 就绪之后）—— 判据就是从这里读的，见
        // store/search/music/state.ts 的 initSearchSources。
        initSearchSources(
          Object.entries(apis as Record<string, { musicSearch?: unknown }>)
            .filter(([, impl]) => impl.musicSearch)
            .map(([id]) => id as LX.OnlineSource),
        )
      }
    } else {
      if (message) {
        void dialog({
          message: `${t('user_api__init_failed_alert', { name: apiInfo.name })}\n${message}`,
          selection: true,
          confirmButtonText: t('ok'),
        })
      }
    }
    if (!window.lx.apiInitPromise[1]) window.lx.apiInitPromise[2](status)
  })

  const rUserApiShowUpdateAlert = onShowUserApiUpdateAlert(({ params: { name, log, updateUrl } }) => {
    if (updateUrl) {
      void dialog({
        message: `${t('user_api__update_alert', { name })}\n${log}`,
        selection: true,
        showCancel: true,
        confirmButtonText: t('user_api__update_alert_open_url'),
        cancelButtonText: t('close'),
      }).then(confirm => {
        if (!confirm) return
        window.setTimeout(() => {
          void openUrl(updateUrl)
        }, 300)
      })
    } else {
      void dialog({
        message: `${t('user_api__update_alert', { name })}\n${log}`,
        selection: true,
        confirmButtonText: t('ok'),
      })
    }
  })

  onBeforeUnmount(() => {
    rUserApiStatus()
    rUserApiShowUpdateAlert()
  })

  return async() => {
    await setUserApi(appSetting['common.apiSource'])
    void getUserApiList().then(list => {
      // console.log(list)
      // if (![...apiSourceInfo.map(s => s.id), ...list.map(s => s.id)].includes(appSetting['common.apiSource'])) {
      //   console.warn('reset api')
      //   let api = apiSourceInfo.find(api => !api.disabled)
      //   if (api) apiSource.value = api.id
      // }
      userApi.list = list
    }).catch(err => {
      console.log(err)
    })
  }
}
