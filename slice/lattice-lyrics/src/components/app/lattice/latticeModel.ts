// 本文件是「切片本地版」，不是 Folia 原文的副本。
//
// Folia 原版的第 2 行是：
//   import { getSongArtistLabel, getSongCoverUrl } from '../../../services/onlineMusic/songMetadata';
// 顺着 songMetadata → providerRegistry 会把**四家平台的音源实现**
// （neteaseProvider / qqProvider / kugouProvider / services/netease.ts）拖进依赖图 ——
// 那是项目的红线（见 docs/development/06-个性化外壳.md 第 4 节）。
//
// 实测：这两条边被剪掉后，闭包从 97 文件 / 1.66 MB 降到 42 文件 / 234 KB。
// 而切片入口 `LatticeLyrics` 只用到这份类型的 `id` / `title` / `artist` 三个字段
// （`buildLatticeTiles` 是海报墙用的，不属于歌词切片），所以这里只留类型定义、
// 不保留任何 import。

export type LatticeSection = 'played' | 'now' | 'upcoming';

export type LatticeTile = {
    /** 去重键，同时决定「这台歌词是不是当前这首歌的」 */
    id: string;
    /** 零基的队列位置 */
    queueIndex: number;
    title: string;
    artist: string;
    coverUrl?: string;
    section: LatticeSection;
};
