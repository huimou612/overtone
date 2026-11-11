import { httpGet } from './request'
import pkg from '../../../package.json'

// 版本检查源。
//
// 国内环境下 raw.githubusercontent.com 经常不可达，客户端会 fallback 到 jsdelivr。
// jsdelivr 对不带分支的 /gh/user/repo/publish/version.json 会缓存旧的 commit 快照，
// 0.4.0 发版后仍返回 0.2.0（软件显示「最新版本 0.2」的直接原因）。
// 因此：① 显式写 @master（可 purge、实测立刻拿到新版本）；② 三个 CDN 镜像放前面，
// raw 放最后，避免国内用户先等一个必然超时的源；③ 缩短超时与重试次数。
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
  [`https://cdn.jsdelivr.net/gh/${author}/${name}@master/publish/version.json`, 'direct'],
  [`https://fastly.jsdelivr.net/gh/${author}/${name}@master/publish/version.json`, 'direct'],
  [`https://gcore.jsdelivr.net/gh/${author}/${name}@master/publish/version.json`, 'direct'],
  [`https://raw.githubusercontent.com/${author}/${name}/master/publish/version.json`, 'direct'],
]

// 缓存穿透：版本源（raw.githubusercontent / jsdelivr）都会带缓存，
// 发版后不加时间戳的话客户端可能长时间读到旧版本号，表现为「一直已是最新」。
const bustCache = url => `${url}${url.includes('?') ? '&' : '?'}_t=${Date.now()}`

const request = async(url, retryNum = 0) => {
  return new Promise((resolve, reject) => {
    httpGet(bustCache(url), {
      timeout: 6000,
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    }, (err, resp, body) => {
      if (err || resp.statusCode != 200) {
        ++retryNum >= 2
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
