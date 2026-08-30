import { describe, it, expect, beforeEach, vi } from 'vitest'
import { usePlaylistStore } from './playlistStore'
import { usePlayerStore } from './playerStore'
import { useMusicStore } from './musicStore'
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
  vi.clearAllMocks()
  useMusicStore.setState({ tracks, favorites: [], configs: [] })
  usePlaylistStore.setState({
    playlists: [
      { id: 100, name: '播放列表', trackIds: '[1,2]', createdAt: '2024-01-01', kind: 'playlist' },
      { id: 200, name: '我的收藏', trackIds: '[3]', createdAt: '2024-01-01', kind: 'favorite' }
    ],
    activeId: 200,
    playlist: [tracks[2]],
    playlistId: 100,
    playlistTracks: [tracks[0], tracks[1]]
  })
  usePlayerStore.setState({
    currentTrack: null,
    pendingTrack: null,
    isPlaying: false,
    isLoading: false,
    loadError: null,
    currentTime: 0,
    duration: 0,
    queue: [],
    playlist: [tracks[0], tracks[1]],
    tempQueue: false,
    loopA: null,
    loopB: null,
    audioSrc: null,
    autoPlayBlocked: false
  })
})

describe('播放列表操作（固定单一列表）', () => {
  it('addPlaylistTracks 追加去重并同步播放器', () => {
    usePlaylistStore.getState().addPlaylistTracks([tracks[1], tracks[2]])
    expect(usePlaylistStore.getState().playlistTracks).toEqual([tracks[0], tracks[1], tracks[2]])
    // 播放器播放列表同步更新
    expect(usePlayerStore.getState().playlist).toEqual([tracks[0], tracks[1], tracks[2]])
    // 收藏列表不受影响
    expect(usePlaylistStore.getState().playlist).toEqual([tracks[2]])
  })

  it('removePlaylistTrack 删除并同步', () => {
    usePlaylistStore.getState().removePlaylistTrack(1)
    expect(usePlaylistStore.getState().playlistTracks).toEqual([tracks[1]])
    expect(usePlayerStore.getState().playlist).toEqual([tracks[1]])
  })

  it('reorderPlaylist 重排并同步', () => {
    usePlaylistStore.getState().reorderPlaylist(0, 1)
    expect(usePlaylistStore.getState().playlistTracks).toEqual([tracks[1], tracks[0]])
    expect(usePlayerStore.getState().playlist).toEqual([tracks[1], tracks[0]])
  })

  it('reorderPlaylist 越界参数不生效', () => {
    usePlaylistStore.getState().reorderPlaylist(0, 99)
    expect(usePlaylistStore.getState().playlistTracks).toEqual([tracks[0], tracks[1]])
  })

  it('clearPlaylistTracks 清空并同步', () => {
    usePlaylistStore.getState().clearPlaylistTracks()
    expect(usePlaylistStore.getState().playlistTracks).toEqual([])
    expect(usePlayerStore.getState().playlist).toEqual([])
  })

  it('持久化写入 trackIds（window.api.playlist.save 被调用）', () => {
    usePlaylistStore.getState().removePlaylistTrack(1)
    expect(window.api.playlist.save).toHaveBeenCalled()
    const saved = vi.mocked(window.api.playlist.save).mock.calls.at(-1)?.[0]
    expect(saved?.trackIds).toBe('[2]')
    expect(saved?.kind).toBe('playlist')
  })
})

describe('addTracksToPlaylist 加入指定列表（不切换活动列表）', () => {
  it('去重后只新增不在列表中的歌曲，返回新增数量', async () => {
    const track4 = makeTrack(4)
    // 收藏列表 activeId=200 已含 id=3
    const added = await usePlaylistStore.getState().addTracksToPlaylist(200, [tracks[2], track4])
    expect(added).toBe(1) // 只有 id=4 新增
    const meta = usePlaylistStore.getState().playlists.find((p) => p.id === 200)
    expect(meta?.trackIds).toBe('[3,4]')
  })
})

describe('replaceTrack 双轨同步', () => {
  it('同时替换收藏列表与播放列表中的曲目', () => {
    // 模拟替代音源：新 id（switchTrackSource 传入的是另一条音源记录）
    const replacement = makeTrack(99, '新音源')
    replacement.path = 'Y:/audio/2-alt.flac'
    usePlaylistStore.getState().replaceTrack(2, replacement)
    // 收藏列表（activeId=200，包含 id=3）不包含 2 → 无变化
    expect(usePlaylistStore.getState().playlist).toEqual([tracks[2]])
    // 播放列表 playlistTracks 中的 id=2 被替换为替代音源
    expect(usePlaylistStore.getState().playlistTracks[1]).toEqual(replacement)
    expect(usePlayerStore.getState().playlist[1]).toEqual(replacement)
  })

  it('同时替换收藏列表中的曲目', () => {
    const replacement = makeTrack(99, '新音源')
    replacement.path = 'Y:/audio/3-alt.flac'
    usePlaylistStore.getState().replaceTrack(3, replacement)
    expect(usePlaylistStore.getState().playlist[0]).toEqual(replacement)
    // 播放列表不包含 3 → 无变化
    expect(usePlaylistStore.getState().playlistTracks).toEqual([tracks[0], tracks[1]])
  })
})

describe('loadPlaylists 旧数据迁移', () => {
  it('多个 kind=playlist 时多余歌单转收藏，不丢数据', async () => {
    const legacy = [
      { id: 1, name: '播放列表', trackIds: '[1]', createdAt: '2024-01-01', kind: 'playlist' },
      { id: 2, name: '老歌单A', trackIds: '[2]', createdAt: '2024-01-01', kind: 'playlist' },
      { id: 3, name: '我的收藏', trackIds: '[3]', createdAt: '2024-01-01', kind: 'favorite' }
    ]
    vi.mocked(window.api.playlist.list).mockResolvedValue(legacy as never)
    vi.mocked(window.api.music.byIds).mockResolvedValue(tracks)
    await usePlaylistStore.getState().loadPlaylists()
    const pls = usePlaylistStore.getState().playlists
    expect(pls.filter((p) => p.kind === 'playlist')).toHaveLength(1)
    expect(pls.find((p) => p.id === 2)?.kind).toBe('favorite')
    // 老歌单 A 被转收藏并保存
    expect(window.api.playlist.save).toHaveBeenCalledWith(expect.objectContaining({ id: 2, kind: 'favorite' }))
  })
})
