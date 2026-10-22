import { describe, it, expect, vi } from 'vitest'
import { coverCacheKey, getCoverCached, setCoverCached } from './coverCache'

describe('coverCache 全局封面缓存', () => {
  it('coverCacheKey 由 webdavId + path 组成', () => {
    expect(coverCacheKey({ webdavId: 'local_x', path: '/a/b.mp3' })).toBe('local_x:/a/b.mp3')
  })

  it('set 后可 get 到同一 objectURL', () => {
    setCoverCached('t:k1', 'blob:url1')
    expect(getCoverCached('t:k1')).toBe('blob:url1')
  })

  it('未缓存的 key 返回 undefined', () => {
    expect(getCoverCached('t:none')).toBeUndefined()
  })

  it('超过上限后淘汰最早条目并 revoke objectURL', () => {
    const spy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    for (let i = 0; i < 61; i++) setCoverCached(`lru:k${i}`, `blob:u${i}`)
    // MAX=60：最早的 lru:k0 已被淘汰，最新的保留
    expect(getCoverCached('lru:k0')).toBeUndefined()
    expect(getCoverCached('lru:k60')).toBe('blob:u60')
    expect(spy).toHaveBeenCalledWith('blob:u0')
    spy.mockRestore()
  })
})
