import registerUserApi from './userApi'
import registerWinMain from './winMain'
import registerHotKey from './hotKey'
import registerTray from './tray'
import registerAppMenu from './appMenu'
import registerWinLyric from './winLyric'
import registerCommonRenderers from './commonRenderers'
// 泛音新增：AI 歌词处理（移植自 Folia 的 AI 分词能力）
import registerAi from './ai'
// 泛音新增：音源分离（移植自 Folia 的 htdemucs sidecar）
import registerAnalysis from './analysis'

let isRegistered = false
export default () => {
  if (isRegistered) return
  registerUserApi()
  registerCommonRenderers()
  registerWinMain()
  registerHotKey()
  registerTray()
  registerAppMenu()
  registerWinLyric()
  registerAi()
  registerAnalysis()
  isRegistered = true
}
