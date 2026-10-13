import { app } from 'electron'
import './utils/logInit'
import '@common/error'
import {
  initGlobalData,
  initSingleInstanceHandle,
  applyElectronEnvParams,
  setUserDataPath,
  registerDeeplink,
  listenerAppEvent,
} from './app'
import { isLinux } from '@common/utils'
import { initAppSetting } from '@main/app'
import registerModules from '@main/modules'
import { applySetting as applySplashSetting, createWindow as createSplashWindow } from '@main/modules/winSplash/main'

// 初始化应用
const init = () => {
  console.log('init')
  if (process.env.BUILD_WIN7 == 'true') import('./utils/winLegacy')
  // 入场动画要抢在 initAppSetting 之前显示：空窗期从这一刻就开始了，
  // 等设置读出来再显示就晚了。它的外观随后由 applySplashSetting 刷入。
  // 启动即隐藏窗口（--hidden）时不显示，此时用户本来就不该看到任何窗口。
  if (!global.envParams.cmdParams.hidden) createSplashWindow()
  void initAppSetting().then(() => {
    applySplashSetting()
    registerModules()
    global.lx.event_app.app_inited()
  })
}

initGlobalData()
initSingleInstanceHandle()
applyElectronEnvParams()
setUserDataPath()
registerDeeplink(init)
listenerAppEvent(init)


// https://github.com/electron/electron/issues/16809
void app.whenReady().then(() => {
  isLinux ? setTimeout(init, 300) : init()
})
