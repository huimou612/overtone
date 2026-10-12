import { httpGet } from './request'
import pkg from '../../../package.json'

// 版本检查源。
//
// 注意：这里原先沿用了上游 LX Music 的版本源（npm 包 lx-music-desktop-version-info、
// gitee 镜像、cdn.stsky.cn 等），合并到本项目后必须全部剔除 —— 否则本软件会把
// 上游的版本号当成「新版」，把用户引到 LX Music 的发布页去，属于明确的品牌串味。
//
// 下面所有地址都由 package.json 的 author.name / name 拼出，已随品牌化改造指向
// 本项目仓库。仓库尚未发布 version.json（publish/version.json 会在发版时生成），
// 检查失败会被 useUpdate.ts 的 .catch 兜住并提示「已是最新版本」，不会误报。
const author = pkg.author.name
const name = pkg.name

const address = [
  [`https://raw.githubusercontent.com/${author}/${name}/master/publish/version.json`, 'direct'],
  [`https://cdn.jsdelivr.net/gh/${author}/${name}/publish/version.json`, 'direct'],
  [`https://fastly.jsdelivr.net/gh/${author}/${name}/publish/version.json`, 'direct'],
  [`https://gcore.jsdelivr.net/gh/${author}/${name}/publish/version.json`, 'direct'],
]

const request = async(url, retryNum = 0) => {
  return new Promise((resolve, reject) => {
    httpGet(url, {
      timeout: 10000,
    }, (err, resp, body) => {
      if (err || resp.statusCode != 200) {
        ++retryNum >= 3
          ? reject(err || new Error(resp.statusMessage || resp.statusCode))
          : request(url, retryNum).then(resolve).catch(reject)
      } else resolve(body)
    })
  })
}

const getDirectInfo = async(url) => {
  return request(url).then(info => {
    if (info.version == null) throw new Error('failed')
    return info
  })
}

const getNpmPkgInfo = async(url) => {
  return request(url).then(json => {
    if (!json.versionInfo) throw new Error('failed')
    const info = JSON.parse(json.versionInfo)
    if (info.version == null) throw new Error('failed')
    return info
  })
}

export const getVersionInfo = async(index = 0) => {
  const [url, source] = address[index]
  let promise
  switch (source) {
    case 'direct':
      promise = getDirectInfo(url)
      break
    case 'npm':
      promise = getNpmPkgInfo(url)
      break
  }

  return promise.catch(async(err) => {
    index++
    if (index >= address.length) throw err
    return getVersionInfo(index)
  })
}

// getVersionInfo().then(info => {
//   console.log(info)
// })
