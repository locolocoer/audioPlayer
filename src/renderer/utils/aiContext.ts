import type { MusicFile } from '../../main/types'

const MAX_QUERY_WORDS = 8

/**
 * 为 AI 助手挑选与用户问题相关的曲库歌曲作为上下文。
 * 4087 首全量塞给模型既贵又超上下文，所以按问题关键词检索后限量返回；
 * 没有匹配时退回热门歌曲，保证 AI 至少能看到真实的曲库内容。
 * fillHot=true 时用热门歌曲把结果补足到 limit（适合生成歌单这类需要足够候选的场景）。
 */
export function selectContextTracks(tracks: MusicFile[], query: string, limit = 40, fillHot = false): MusicFile[] {
  const playSorted = [...tracks].sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
  const q = (query || '').toLowerCase().trim()
  if (!q) return playSorted.slice(0, limit)

  const words = q
    .split(/[\s,，。、!?！？;；:：/|]+/)
    .filter((w) => w.length >= 2)
    .slice(0, MAX_QUERY_WORDS)

  // 中英混排无空格很常见：字段是问题子串（如「陈奕迅的歌」含「陈奕迅」）也算命中
  const contains = (field: string, needle: string): boolean => {
    if (!field) return false
    if (field.includes(needle)) return true
    return field.length >= 2 && needle.includes(field)
  }

  const match = (t: MusicFile): boolean => {
    const title = (t.title || '').toLowerCase()
    const artist = (t.artist || '').toLowerCase()
    const album = (t.album || '').toLowerCase()
    if (contains(title, q) || contains(artist, q) || contains(album, q)) return true
    return words.some((w) => title.includes(w) || artist.includes(w) || album.includes(w))
  }

  const matched = playSorted.filter(match)
  const result = matched.slice(0, limit)
  if (fillHot && result.length < limit) {
    const seen = new Set(result.map((t) => t.id))
    for (const t of playSorted) {
      if (seen.has(t.id)) continue
      result.push(t)
      seen.add(t.id)
      if (result.length >= limit) break
    }
  }
  if (result.length > 0) return result
  // 没有匹配：退回热门（AI 仍能基于真实曲库作答）
  return playSorted.slice(0, limit)
}
