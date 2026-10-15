// import { getListFromState } from './list'
// import { downloadList } from './download'


// export const getList = (listId: string | null): LX.Download.ListItem[] | LX.Music.MusicInfo[] => {
//   return listId == 'download' ? downloadList : getListFromState(listId)
// }
import { encodePath, isUrl } from '@common/utils/common'
import { joinPath } from '@common/utils/nodejs'
import { markRaw, shallowReactive } from '@common/utils/vueTools'
import { getThemes as getTheme } from '@renderer/utils/ipc'
// ⚠️ isValidSource 是**具名导出**，不在默认导出的 Proxy 上（Proxy 只兜住
// 「取不到的源」），所以必须具名引入；别写成 musicSdk.isValidSource —— 那会
// 拿到空壳对象，调用即 TypeError。
import { isValidSource } from '@renderer/utils/musicSdk'
import { qualityList, themeInfo, themeShouldUseDarkColors } from './index'

/**
 * 某个源现在能不能播。
 *
 * `qualityList` 是按**所选「音源」**填的（`core/apiSource.ts` / `useInitUserApi`），
 * 键是 source —— 所以用户导入的自定义源、以及历史上那几个平台源，都靠它判定。
 *
 * 但**内置源不依赖所选音源**（它随应用分发，不需要用户导入），所以不能只查
 * `qualityList`：那样用户一旦选了别的音源，内置的开放曲库就会「搜得到、播不了」。
 * 这里直接用 `musicSdk.sources` 判一次。
 *
 * ⚠️ 别把它简化成 `musicSdk[source] != null` —— Proxy 会给任何取不到的 key
 * 返回空壳对象，那样每个源都"支持"了。
 */
export const assertApiSupport = (source: LX.Source): boolean => {
  return source == 'local' || isValidSource(source) || qualityList.value[source] != null
}

export const buildBgUrl = (originUrl: string, dataPath: string): string => {
  return isUrl(originUrl)
    ? `url(${originUrl})`
    : `url(${encodePath(joinPath(dataPath, originUrl).replaceAll('\\', '/'))})`
}

export const getThemes = (callback: (themeInfo: LX.ThemeInfo) => void) => {
  if (themeInfo.themes.length) {
    callback(themeInfo)
    return
  }
  void getTheme().then(info => {
    themeInfo.themes = markRaw(info.themes)
    themeInfo.userThemes = shallowReactive(info.userThemes)
    themeInfo.dataPath = info.dataPath
    callback(themeInfo)
  })
}
export const buildThemeColors = (theme: LX.Theme, dataPath: string) => {
  if (theme.isCustom) {
    const image = theme.config.extInfo['--background-image']
    const video = theme.config.extInfo['--background-video']
    // 注意这里比原来多了一道真值判断：原来只判 `!= 'none'`，
    // 空字符串会走进 buildBgUrl 拼出一个 `url(<dataPath>)` 的坏地址。
    if ((image && image != 'none') || video) {
      theme = copyTheme(theme)
      if (image && image != 'none') theme.config.extInfo['--background-image'] = buildBgUrl(image, dataPath)
      // 视频同样按 url(...) 产出，剥壳交给 AppBackground —— 两条路径形状保持一致，
      // 以后再加壁纸来源时只要沿用这个约定。
      if (video) theme.config.extInfo['--background-video'] = buildBgUrl(video, dataPath)
    }
  }
  const colors: Record<string, string> = {
    ...theme.config.themeColors,
    ...theme.config.extInfo,
  }

  return colors
}

export const copyTheme = (theme: LX.Theme): LX.Theme => {
  return {
    ...theme,
    config: {
      ...theme.config,
      extInfo: { ...theme.config.extInfo },
      themeColors: { ...theme.config.themeColors },
    },
  }
}

export const findTheme = (themeInfo: LX.ThemeInfo, id: string): LX.Theme | undefined => {
  let theme = themeInfo.themes.find(theme => theme.id == id)
  if (theme) return theme
  theme = themeInfo.userThemes.find(theme => theme.id == id)
  return theme
}

export const applyTheme = (id: string, lightId: string, darkId: string, dataPath: string) => {
  getThemes((themeInfo) => {
    let themeId = id == 'auto'
      ? themeShouldUseDarkColors.value
        ? darkId
        : lightId
      : id

    let theme = findTheme(themeInfo, themeId)
    if (!theme) {
      themeId = id == 'auto' && themeShouldUseDarkColors.value ? 'overtone_dark' : 'overtone'
      theme = themeInfo.themes.find(theme => theme.id == themeId)!
    }
    window.setTheme(buildThemeColors(theme, dataPath))
  })
}
