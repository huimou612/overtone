import { nativeImage } from 'electron'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { COVER_COLOR_EVENT_NAME } from '@common/ipcNames'
import { mainHandle } from '@common/mainIpc'
import { log } from '@common/utils'

/**
 * 跟随封面取色 —— 「读图」的那半边（阶段 7.4）
 *
 * 这个模块只做一件事：把当前歌曲的封面图**读出来、缩成一张小图、编码成 PNG data URL**
 * 交回渲染层。颜色量化在渲染层做（见 @renderer/core/useApp/useCoverColor.ts）。
 *
 * 为什么读图必须留在主进程：
 * 渲染层要算主色，唯一的路是把图画进 <canvas> 再 getImageData，而 canvas 一旦被
 * 「非同一来源」的图污染，getImageData 就会抛 SecurityError。封面的三种来源里有两种会踩雷：
 *   - 本地文件路径 —— getMusicFilePic 对超过 400KB 的封面会落到临时文件上，file:// 是不透明源
 *   - 在线歌曲的 http 地址 —— 服务端基本不会给出 CORS 头
 * nativeImage 读图不受这些约束，所以由它把图交出来。
 *
 * 为什么量化不跟着一起做：nativeImage.toBitmap() 返回缓冲区的通道顺序（BGRA / RGBA）
 * 在不同平台与版本上是有歧义的，拿去算颜色等于赌运气。而 <canvas> 的 getImageData
 * 保证是 RGBA —— 让渲染层算，这个坑就天然不存在。
 */

// 交给渲染层的采样图边长。36px 已经足够反映主色调，PNG 只有一两 KB，
// 走 IPC 的成本可以忽略；再放大对取色结果没有任何帮助。
const SAMPLE_SIZE = 36

// 同一首歌会被反复切回来（上一首 / 下一首 / 单曲循环），不缓存就每次都要重新读盘解码。
// 键取图源字符串的 sha1：data URL 动辄几百 KB，直接拿它当键会把内存吃掉一大块。
const cache = new Map<string, string | null>()
const CACHE_LIMIT = 24

const remember = (key: string, value: string | null) => {
  cache.set(key, value)
  // Map 保持插入顺序，删掉最早的那个就是最省事的 FIFO
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!)
}

/** 只处理「非 data URL」的图源。data URL 本身已经是解码结果，渲染层自己就能画，不必绕这一趟。 */
const loadImage = async(pic: string) => {
  if (/^https?:\/\//i.test(pic)) {
    const response = await fetch(pic)
    if (!response.ok) return null
    const buffer = Buffer.from(await response.arrayBuffer())
    const image = nativeImage.createFromBuffer(buffer)
    return image.isEmpty() ? null : image
  }

  const image = nativeImage.createFromPath(/^file:\/\//i.test(pic) ? fileURLToPath(pic) : pic)
  return image.isEmpty() ? null : image
}

export default () => {
  mainHandle<{ pic: string }, string | null>(COVER_COLOR_EVENT_NAME.get_image, async({ params }) => {
    const pic = typeof params?.pic === 'string' ? params.pic.trim() : ''
    if (!pic) return null

    const key = createHash('sha1').update(pic).digest('hex')
    if (cache.has(key)) return cache.get(key) ?? null

    let dataUrl: string | null = null
    try {
      const image = await loadImage(pic)
      if (image) {
        // 宽高都给才会精确缩到正方形；只给一边的话 nativeImage 会保持宽高比。
        // 量化看的是整张图的颜色分布，拉伸不影响主色调，但正方形的画布处理起来简单得多。
        const sample = image.resize({ width: SAMPLE_SIZE, height: SAMPLE_SIZE, quality: 'good' })
        const encoded = sample.toDataURL()
        // 空图会编出一个只有头部的 data URL，用长度兜一道底，免得渲染层拿到一张画不出东西的图
        dataUrl = encoded.startsWith('data:image') && encoded.length > 64 ? encoded : null
      }
    } catch (error) {
      log.warn('cover color: 读取封面失败', error)
      dataUrl = null
    }

    remember(key, dataUrl)
    return dataUrl
  })
}
