import { userApis as defaultUserApis, BUILTIN_API_IDS } from './config'
import { STORE_NAMES } from '@common/constants'
import getStore from '@main/utils/store'
import zlib from 'node:zlib'

let userApis: LX.UserApi.UserApiInfo[] | null
let scripts = new Map<string, string>()

const saveData = () => {
  getStore(STORE_NAMES.USER_API).set('userApis', userApis!.map(api => {
    return {
      ...api,
      script: scripts.get(api.id),
    }
  }))
}

export const getUserApis = (): LX.UserApi.UserApiInfo[] => {
  if (userApis) return userApis

  const electronStore_userApi = getStore(STORE_NAMES.USER_API)
  let infoFull = electronStore_userApi.get('userApis') as LX.UserApi.UserApiInfoFull[]
  let requiredUpdate = false
  if (infoFull) {
    // —— 内置源补齐 ——
    // 老用户的 store 里已经有自己导入的源，不会走下面的默认值分支，
    // 内置源就永远不会出现。这里按 id 缺啥补啥，并写回 store。
    const builtinIds = BUILTIN_API_IDS as readonly string[]
    const existIds = new Set(infoFull.map(api => api.id))
    const missing = defaultUserApis.filter(api => builtinIds.includes(api.id) && !existIds.has(api.id))
    if (missing.length) {
      infoFull = [...missing, ...infoFull]
      requiredUpdate = true
    }
    // 内置源随 App 更新：store 里的版本和当前打包的版本不一致时，用新的覆盖
    // （否则用户升级了 App，内置音源脚本还停在旧版，永远拿不到修好的后端）
    infoFull = infoFull.map(api => {
      if (!builtinIds.includes(api.id)) return api
      const latest = defaultUserApis.find(def => def.id === api.id)
      if (!latest || String(latest.version) === String(api.version)) return api
      requiredUpdate = true
      return latest
    })
    for (let i = 0; i < infoFull.length; i++) {
      const api = infoFull[i]
      if (api.version != null) continue
      requiredUpdate ||= true
      try {
        infoFull.splice(i, 1, {
          ...parseScriptInfo(api.script),
          ...api,
        })
      } catch (e) {
        infoFull.splice(i, 1)
        i--
      }
    }
  } else {
    infoFull = defaultUserApis
    electronStore_userApi.set('userApis', userApis)
  }
  userApis = infoFull.map(api => {
    if (api.allowShowUpdateAlert == null) api.allowShowUpdateAlert = false
    const { script, ...info } = api
    scripts.set(api.id, script)
    return info
  })
  if (requiredUpdate) saveData()
  return userApis
}

const INFO_NAMES = {
  name: 24,
  description: 36,
  author: 56,
  homepage: 1024,
  version: 36,
} as const
type INFO_NAMES_Type = typeof INFO_NAMES
const matchInfo = (scriptInfo: string) => {
  const infoArr = scriptInfo.split(/\r?\n/)
  const rxp = /^\s?\*\s?@(\w+)\s(.+)$/
  const infos: Partial<Record<keyof typeof INFO_NAMES, string>> = {}
  for (const info of infoArr) {
    const result = rxp.exec(info)
    if (!result) continue
    const key = result[1] as keyof typeof INFO_NAMES
    if (INFO_NAMES[key] == null) continue
    infos[key] = result[2].trim()
  }

  for (const [key, len] of Object.entries(INFO_NAMES) as Array<{ [K in keyof INFO_NAMES_Type]: [K, INFO_NAMES_Type[K]] }[keyof INFO_NAMES_Type]>) {
    infos[key] ||= ''
    if (infos[key] == null) infos[key] = ''
    else if (infos[key].length > len) infos[key] = infos[key].substring(0, len) + '...'
  }

  return infos as Record<keyof typeof INFO_NAMES, string>
}
const parseScriptInfo = (script: string) => {
  const result = /^\/\*[\S|\s]+?\*\//.exec(script)
  if (!result) throw new Error('无效的自定义源文件')

  let scriptInfo = matchInfo(result[0])

  scriptInfo.name ||= `user_api_${new Date().toLocaleString()}`
  return scriptInfo
}
const deflateScript = async(script: string) => new Promise<string>((resolve, reject) => {
  zlib.deflate(Buffer.from(script, 'utf8'), (err, buf) => {
    if (err) {
      reject(err)
      return
    }
    resolve('gz_' + buf.toString('base64'))
  })
})
const inflateScript = async(script: string) => new Promise<string>((resolve, reject) => {
  if (script.startsWith('gz_')) {
    zlib.inflate(Buffer.from(script.substring(3), 'base64'), (err, buf) => {
      if (err) {
        reject(err)
        return
      }
      resolve(buf.toString('utf8'))
    })
  } else resolve(script)
})
export const importApi = async(scriptRaw: string): Promise<LX.UserApi.UserApiInfo> => {
  let scriptInfo = parseScriptInfo(scriptRaw)
  const script = await deflateScript(scriptRaw)
  userApis ??= []
  for (const api of userApis) {
    const existingScript = scripts.get(api.id)
    if (existingScript === script) {
      throw new Error(`导入失败，脚本内容与已有的源「${api.name}」相同`)
    }
  }
  const apiInfo = {
    id: `user_api_${Math.random().toString().substring(2, 5)}_${Date.now()}`,
    ...scriptInfo,
    allowShowUpdateAlert: true,
  }
  userApis.push(apiInfo)
  scripts.set(apiInfo.id, script)
  saveData()
  return apiInfo
}

export const removeApi = (ids: string[]) => {
  // 内置源不允许删除（删了下次启动还会回来，不如直接挡住）
  const BUILTIN_API_IDS = ['user_api_fanyin_builtin']
  ids = ids.filter(id => !BUILTIN_API_IDS.includes(id))
  if (!ids.length) return
  if (!userApis) return
  for (let index = userApis.length - 1; index > -1; index--) {
    if (ids.includes(userApis[index].id)) {
      scripts.delete(userApis[index].id)
      userApis.splice(index, 1)
      ids.splice(index, 1)
    }
  }
  saveData()
}

export const setAllowShowUpdateAlert = (id: string, enable: boolean) => {
  const targetApi = userApis?.find(api => api.id == id)
  if (!targetApi) return
  targetApi.allowShowUpdateAlert = enable
  saveData()
}

export const getScript = async(id: string) => {
  return inflateScript(scripts.get(id) ?? '')
}
