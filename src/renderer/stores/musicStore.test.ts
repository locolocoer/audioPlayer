import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useMusicStore } from './musicStore'
import { usePlayerStore } from './playerStore'
import { usePlaylistStore } from './playlistStore'
import type { MusicFile } from '../../main/types'

function makeTrack(id: number, title = `歌曲${id}`): MusicFile {
  return {
    id,
    path: `Y:/audio/${id}.mp3`,
    filename: `${id}.mp3`,
    size: 1000,
    mtime: '2024-01-01',
    title,
    artist: '歌手',
    album: '专辑',
    duration: 100,
    webdavId: 'local_test',
    scannedAt: '2024-01-01',
    favorite: 0
  }
}

const tracks = [makeTrack(1), makeTrack(2), makeTrack(3)]

beforeEach(() => {
  useMusicStore.setState({ tracks, tracksLoaded: true, favorites: [], configs: [], count: 0 })
})

describe('musicStore 加载与计数', () => {
  it('loadTracks 加载歌曲并标记已加载', async () => {
    vi.mocked(window.api.music.list).mockResolvedValue([tracks[0]] as never)
    useMusicStore.setState({ tracks: [], tracksLoaded: false })
    await useMusicStore.getState().loadTracks()
    expect(useMusicStore.getState().tracks).toHaveLength(1)
    expect(useMusicStore.getState().tracksLoaded).toBe(true)
  })

  it('已加载后 loadTracks 直接返回（不重复请求），force 时重新请求', async () => {
    vi.mocked(window.api.music.list).mockResolvedValue([tracks[0]] as never)
    await useMusicStore.getState().loadTracks()
    expect(window.api.music.list).toHaveBeenCalledTimes(0)
    await useMusicStore.getState().loadTracks(undefined, true)
    expect(window.api.music.list).toHaveBeenCalledTimes(1)
  })

  it('loadCount 更新总数', async () => {
    vi.mocked(window.api.music.count).mockResolvedValue(42 as never)
    await useMusicStore.getState().loadCount()
    expect(useMusicStore.getState().count).toBe(42)
  })
})

describe('musicStore 收藏与评分', () => {
  it('toggleFavorite 收藏时同步 tracks 与 favorites', async () => {
    vi.mocked(window.api.music.toggleFavorite).mockResolvedValue(true as never)
    await useMusicStore.getState().toggleFavorite(1)
    const s = useMusicStore.getState()
    expect(s.tracks.find((t) => t.id === 1)?.favorite).toBe(1)
    expect(s.favorites.some((t) => t.id === 1)).toBe(true)
  })

  it('toggleFavorite 取消收藏时从 favorites 移除', async () => {
    useMusicStore.setState({ favorites: [tracks[0]] })
    vi.mocked(window.api.music.toggleFavorite).mockResolvedValue(false as never)
    await useMusicStore.getState().toggleFavorite(1)
    const s = useMusicStore.getState()
    expect(s.tracks.find((t) => t.id === 1)?.favorite).toBe(0)
    expect(s.favorites.some((t) => t.id === 1)).toBe(false)
  })

  it('setRating 同步更新 tracks 与 favorites 的评分', async () => {
    useMusicStore.setState({ favorites: [tracks[0]] })
    await useMusicStore.getState().setRating(1, 5)
    expect(useMusicStore.getState().tracks.find((t) => t.id === 1)?.rating).toBe(5)
    expect(useMusicStore.getState().favorites[0].rating).toBe(5)
  })

  it('updateMeta 应用元数据并保留其他字段', async () => {
    vi.mocked(window.api.music.updateMeta).mockResolvedValue({ writeback: { attempted: false } } as never)
    await useMusicStore.getState().updateMeta(2, { title: '新名字' })
    const t = useMusicStore.getState().tracks.find((x) => x.id === 2)
    expect(t?.title).toBe('新名字')
    expect(t?.artist).toBe('歌手')
  })
})

describe('musicStore 音源切换', () => {
  it('switchTrackSource 替换 tracks 中的曲目并通知播放器/播放列表', async () => {
    const spyPlayer = vi.spyOn(usePlayerStore.getState(), 'replaceTrack')
    const spyPlaylist = vi.spyOn(usePlaylistStore.getState(), 'replaceTrack')
    const newTrack = { ...makeTrack(1, '替换后的歌'), webdavId: 'other' } as MusicFile
    await useMusicStore.getState().switchTrackSource(1, newTrack)
    const replaced = useMusicStore.getState().tracks.find((t) => t.id === 1)
    expect(replaced?.title).toBe('替换后的歌')
    expect(spyPlayer).toHaveBeenCalledWith(1, newTrack)
    expect(spyPlaylist).toHaveBeenCalledWith(1, newTrack)
    spyPlayer.mockRestore()
    spyPlaylist.mockRestore()
  })
})
