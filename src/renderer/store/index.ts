import { ref, reactive, shallowRef, markRaw, computed, watch } from '@common/utils/vueTools'
import { windowSizeList as configWindowSizeList } from '@common/config'
import { appSetting } from './setting'
import pkg from '../../../package.json'
import { type ProgressInfo } from 'electron-updater'
import music from '@renderer/utils/musicSdk'
process.versions.app = pkg.version

export const apiSource = ref<string | null>(null)
export const proxy: {
  enable: boolean
  host: string
  port: string

  envProxy?: {
    host: string
    port: string
  }
} = {
  enable: false,
  host: '',
  port: '',
}
export const sync: {
  enable: boolean
  mode: LX.AppSetting['sync.mode']
  isShowSyncMode: boolean
  isShowAuthCodeModal: boolean
  deviceName: string
  type: keyof LX.Sync.ModeTypes
  server: {
    port: string
    status: {
      status: boolean
      message: string
      address: string[]
      code: string
      devices: LX.Sync.ServerKeyInfo[]
    }
  }
  client: {
    host: string
    status: {
      status: boolean
      message: string
      address: string[]
    }
  }
} = reactive({
  enable: false,
  mode: 'server',
  isShowSyncMode: false,
  isShowAuthCodeModal: false,
  deviceName: '',
  type: 'list',
  server: {
    port: '',
    status: {
      status: false,
      message: '',
      address: [],
      code: '',
      devices: [],
    },
  },
  client: {
    host: '',
    status: {
      status: false,
      message: '',
      address: [],
    },
  },
})

export const openAPI = reactive({
  address: '',
  message: '',
})


export const windowSizeActive = computed(() => {
  return windowSizeList.find(i => i.id === appSetting['common.windowSizeId']) ?? windowSizeList[0]
})

export const getSourceI18nPrefix = () => {
  return appSetting['common.sourceNameType'] == 'real' ? 'source_' : 'source_alias_'
}

export const sourceNames = computed(() => {
  const prefix = getSourceI18nPrefix()
  // 内置平台源已全部移除（见 utils/musicSdk/index.js 顶部的说明），但下面这张
  // 映射要保留：历史数据里可能有 source 为 kw / tx / … 的歌曲（已收藏、已下载、
  // 已导入的歌单），界面要靠它显示「来源」。
  //
  // 原来这几个 key 写的是占位字面量（kw: 'kw'），因为紧接着的循环一定会用
  // i18n 名称覆盖掉。现在循环不再有内容，占位就得改成真正的名称。
  const sourceNames: Record<LX.OnlineSource | 'all', string> = {
    kw: window.i18n.t(prefix + 'kw' as any),
    tx: window.i18n.t(prefix + 'tx' as any),
    kg: window.i18n.t(prefix + 'kg' as any),
    mg: window.i18n.t(prefix + 'mg' as any),
    wy: window.i18n.t(prefix + 'wy' as any),
    all: window.i18n.t(prefix + 'all' as any),
  }
  // 目前 music.sources 是空的（没有内置源）。保留这个循环是为了让「将来把
  // 自定义源登记进 music.sources」时不必回来改这里。
  for (const { id } of music.sources) {
    sourceNames[id as LX.OnlineSource] = window.i18n.t(prefix + id as any)
  }

  return sourceNames
})

export const windowSizeList = markRaw(configWindowSizeList)

export const isShowPact = ref(false)

export const versionInfo = window.lxData.versionInfo = reactive<{
  version: string
  newVersion: {
    version: string
    desc: string
    history?: LX.VersionInfo[]
  } | null
  showModal: boolean
  isUnknown: boolean
  isLatest: boolean
  reCheck: boolean
  status: LX.UpdateStatus
  downloadProgress: ProgressInfo | null
}>({
  version: pkg.version,
  newVersion: null,
  showModal: false,
  reCheck: false,
  isUnknown: false,
  isLatest: false,
  status: 'checking',
  downloadProgress: null,
})
export const userApi = reactive<{
  list: LX.UserApi.UserApiInfo[]
  status: boolean
  message?: string
  apis: Partial<LX.UserApi.UserApiSources>
}>({
  list: [],
  status: false,
  message: 'initing',
  apis: {},
})

export const isShowChangeLog = ref(false)


export const isFullscreen = ref(false)
watch(isFullscreen, isFullscreen => {
  window.lx.rootOffset = window.dt || isFullscreen ? 0 : 8
}, { immediate: true })

/**
 * 是否处于「个性模式」（沉浸形态）
 *
 * 同一套界面的两种形态，不是两套界面：个性模式下侧栏收起（左边缘悬停浮出）、
 * 视图切换带过渡动画、启动时若有当前歌曲则直接进播放详情页。
 */
export const isPersonalMode = computed(() => appSetting['common.appMode'] == 'personal')

export const themeShouldUseDarkColors = ref(window.shouldUseDarkColors)


export const qualityList = shallowRef<LX.QualityList>({})
export const setQualityList = (_qualityList: LX.QualityList) => {
  qualityList.value = _qualityList
}

export const themeId = ref('overtone')
export const themeInfo: LX.ThemeInfo = {
  themes: [],
  userThemes: [],
  dataPath: '',
}
