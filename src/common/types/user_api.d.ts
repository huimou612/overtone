declare namespace LX {
  namespace UserApi {
    type UserApiSourceInfoType = 'music'
    /**
     * 脚本可以声明的能力。
     *
     * `musicSearch` / `lyric` / `pic` 是泛音新增的：上游 LX Music 有内置平台接口
     * 提供搜索、歌词、封面，自定义源只需补 `musicUrl`；泛音删掉了全部内置接口
     * （见 renderer/utils/musicSdk/index.js），这三项就没人提供了 —— 所以开放给
     * 自定义源接管。白名单在 `main/modules/userApi/renderer/preload.js`。
     */
    type UserApiSourceInfoActions = 'musicUrl' | 'musicSearch' | 'lyric' | 'pic'

    interface UserApiSourceInfo {
      name: string
      type: UserApiSourceInfoType
      actions: UserApiSourceInfoActions[]
      qualitys: LX.Quality[]
    }

    type UserApiSources = Record<LX.Source, UserApiSourceInfo>

    /**
     * 脚本 `musicSearch` 返回的条目：只有四个字段是我们真正需要的，
     * 其余（`albumName` / `img` / `interval`）可选，宿主会补齐缺省值。
     *
     * 硬约束两条：`name` 与 `songmid` 必填 —— 前者要显示、后者要拼歌曲 id
     * （见 common/utils/tools.ts 的 toNewMusicInfo）。`source` 不在契约里：
     * 它由宿主按脚本声明的 source 钉死，脚本给了也不采信。
     */
    interface UserApiSearchItem {
      name: string
      songmid?: string
      /** `songmid` 的别名，兼容脚本直接透传接口字段 */
      songId?: string
      id?: string
      singer?: string
      /** `singer` 的别名 */
      artist?: string
      albumName?: string
      /** `albumName` 的别名 */
      album?: string
      /** `mm:ss`、秒数或毫秒都接受，宿主会归一化成 `mm:ss` */
      interval?: string | number
      img?: string
      /** `img` 的别名 */
      pic?: string
    }

    /**
     * 搜索结果。`limit` / `allPage` 缺省时由宿主按 `total` 推算，
     * 所以脚本最少只要给 `{ list, total }`（甚至直接给裸数组）。
     */
    interface UserApiSearchResult {
      list: UserApiSearchItem[]
      total?: number
      limit?: number
      allPage?: number
    }


    interface UserApiInfoFull {
      id: string
      name: string
      description: string
      script: string
      allowShowUpdateAlert: boolean
      author?: string
      homepage?: string
      version?: string
      sources?: UserApiSources
    }

    type UserApiInfo = Omit<UserApiInfoFull, 'script'>

    interface UserApiStatus {
      status: boolean
      message?: string
      apiInfo?: UserApiInfo
    }

    interface UserApiUpdateInfo {
      name: string
      description: string
      log: string
      updateUrl?: string
    }

    interface UserApiRequestParams {
      requestKey: string
      data: any
    }
    type UserApiRequestCancelParams = string
    type UserApiSetApiParams = string

    interface UserApiSetAllowUpdateAlertParams {
      id: string
      enable: boolean
    }

    interface ImportUserApi {
      apiInfo: UserApiInfo
      apiList: UserApiInfo[]
    }

  }
}
