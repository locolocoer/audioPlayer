// 全局共享封面缓存：音乐库 / 播放栏 / 播放页共用同一份 objectURL，
// 切歌回看已加载过的封面时直接命中，避免重复 IPC 请求与内存浪费。
const cache = new Map<string, string>()
const MAX = 60

export function coverCacheKey(track: { webdavId: string; path: string }): string {
  return `${track.webdavId}:${track.path}`
}

export function getCoverCached(key: string): string | undefined {
  return cache.get(key)
}

export function setCoverCached(key: string, url: string): void {
  cache.delete(key) // 重新插入以更新 LRU 顺序
  cache.set(key, url)
  while (cache.size > MAX) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    const oldUrl = cache.get(oldest)
    if (oldUrl) URL.revokeObjectURL(oldUrl)
    cache.delete(oldest)
  }
}
