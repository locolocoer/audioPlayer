import { describe, it, expect } from 'vitest'
import { selectContextTracks } from './aiContext'
import type { MusicFile } from '../../main/types'

function makeTrack(id: number, title: string, artist: string, album = '专辑', playCount = 0): MusicFile {
  return {
    id,
    path: `Y:/audio/${id}.mp3`,
    filename: `${id}.mp3`,
    size: 1000,
    mtime: '2024-01-01',
    title,
    artist,
    album,
    duration: 100,
    webdavId: 'local_test',
    scannedAt: '2024-01-01',
    favorite: 0,
    playCount
  } as MusicFile
}

const tracks = [
  makeTrack(1, '十年', '陈奕迅', '黑白灰', 5),
  makeTrack(2, '浮夸', '陈奕迅', 'U87', 20),
  makeTrack(3, '晴天', '周杰伦', '叶惠美', 10),
  makeTrack(4, '夜曲', '周杰伦', '十一月的萧邦', 1)
]

describe('selectContextTracks 为 AI 挑选相关曲库上下文', () => {
  it('空问题返回热门歌曲（按播放次数降序）', () => {
    const r = selectContextTracks(tracks, '', 3)
    expect(r.map((t) => t.id)).toEqual([2, 3, 1])
  })

  it('按歌手检索出对应歌曲', () => {
    const r = selectContextTracks(tracks, '陈奕迅的歌')
    expect(r.every((t) => t.artist === '陈奕迅')).toBe(true)
    expect(r).toHaveLength(2)
  })

  it('按专辑检索', () => {
    const r = selectContextTracks(tracks, '叶惠美')
    expect(r.map((t) => t.id)).toEqual([3])
  })

  it('按歌名检索', () => {
    const r = selectContextTracks(tracks, '晴天')
    expect(r.map((t) => t.id)).toEqual([3])
  })

  it('没有匹配时退回热门而不是返回空', () => {
    const r = selectContextTracks(tracks, '完全不存在的歌手xyz', 2)
    expect(r).toHaveLength(2)
    expect(r[0].playCount).toBeGreaterThanOrEqual(r[1].playCount || 0)
  })

  it('limit 生效', () => {
    expect(selectContextTracks(tracks, '', 1)).toHaveLength(1)
  })
})
