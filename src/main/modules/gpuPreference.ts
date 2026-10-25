import { app } from 'electron'
import getStore from '@main/utils/store'
import { STORE_NAMES } from '@common/constants'

/**
 * 渲染显卡偏好（借鉴 Folia electron/gpuPreference.cjs，AGPL-3.0 上游实现）
 *
 * 为什么需要：Chromium 默认取 DXGI 列出的**第一块**适配器，混合显卡笔记本上通常就是核显。
 * Chromium 自带两个开关可以让 GPU 进程按偏好向 DXGI 要适配器：
 *   --force_high_performance_gpu / --force_low_power_gpu
 * （见 Chromium gpu/ipc/service/gpu_init.cc, SetupGLDisplayManagerEGL）
 * Windows 自带的「图形设置」里给单个程序指定的显卡优先级更高，会盖过这两个开关。
 *
 * 只对 Windows 生效：macOS 单显卡或 ANGLE 走 Metal 时选择无意义，Linux 上这两个开关到不了实现。
 */

export type GpuPreference = 'auto' | 'high-performance' | 'low-power'

const SETTING_KEY = 'common.gpuPreference' as const

const SWITCHES: Record<string, string> = {
  'high-performance': 'force_high_performance_gpu',
  'low-power': 'force_low_power_gpu',
}

const normalize = (value: unknown): GpuPreference => {
  return value === 'high-performance' || value === 'low-power' ? value : 'auto'
}

/** 读持久化的偏好。必须在 app ready 之前调用（此时 global.lx.appSetting 还没加载，直接读 store） */
export const readGpuPreference = (): GpuPreference => {
  try {
    const store = getStore(STORE_NAMES.APP_SETTINGS)
    const setting = store.get('setting') as Record<string, unknown> | undefined
    return normalize(setting?.[SETTING_KEY])
  } catch (err) {
    console.warn('[Gpu] 读取偏好失败，按 auto 处理:', err)
    return 'auto'
  }
}

export interface GpuPreferenceApplied {
  preference: GpuPreference
  source: 'setting' | 'command-line' | 'platform'
}

/**
 * 按偏好加启动开关。必须在 ready 之前调用（GPU 进程此时还没起来）。
 * 命令行已经带了任一开关时以命令行为准，不再叠加。
 */
export const applyGpuPreference = (): GpuPreferenceApplied => {
  if (process.platform !== 'win32') return { preference: 'auto', source: 'platform' }

  const passed = Object.entries(SWITCHES).find(([, name]) => app.commandLine.hasSwitch(name))
  if (passed) return { preference: normalize(passed[0]), source: 'command-line' }

  const preference = readGpuPreference()
  const switchName = SWITCHES[preference]
  if (switchName) app.commandLine.appendSwitch(switchName)
  return { preference, source: 'setting' }
}

/** 读本次运行实际渲染用的显卡名（只在 complete 级别才标记 active） */
export const readActiveGpuName = async(): Promise<string | null> => {
  try {
    const info = await app.getGPUInfo('complete')
    const devices = (info as { gpuDevice?: Array<{ active?: boolean, deviceString?: string, vendorId?: number, deviceId?: number }> }).gpuDevice ?? []
    const active = devices.find(d => d.active)
    if (!active) return null
    return active.deviceString ?? `vendor 0x${active.vendorId?.toString(16)}, device 0x${active.deviceId?.toString(16)}`
  } catch (err) {
    console.warn('[Gpu] 读取当前显卡失败:', err)
    return null
  }
}

/** 把本次运行用的偏好与显卡打到日志，方便用户反馈问题时定位 */
export const logGpuState = (applied: GpuPreferenceApplied) => {
  if (applied.source === 'platform') return
  const how = applied.source === 'command-line' ? '命令行开关' : '设置项'
  console.info(`[Gpu] 偏好 ${applied.preference}（来源：${how}）`)
  void readActiveGpuName().then(name => {
    console.info(`[Gpu] 实际渲染显卡：${name ?? '无硬件适配器（软件渲染）'}`)
  })
}
