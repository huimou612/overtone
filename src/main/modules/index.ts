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
// 泛音新增：跟随封面取色（把封面读成小图交给渲染层量化）
import registerCoverColor from './coverColor'

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
  registerCoverColor()
  isRegistered = true
}
