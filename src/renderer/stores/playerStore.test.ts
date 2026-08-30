import { describe, it, expect, beforeEach } from 'vitest'
import { usePlayerStore } from './playerStore'
import { usePlaylistStore } from './playlistStore'
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

// 每个测试前把三个 store 重置到干净状态（vitest 每个测试文件独立模块实例，文件间互不影响）
beforeEach(() => {
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

describe('tempQueue 临时队列语义', () => {
  it('playSelection 设置临时队列并标记 tempQueue', () => {
    usePlayerStore.getState().playSelection([tracks[1], tracks[2]])
    const s = usePlayerStore.getState()
    expect(s.queue).toEqual([tracks[1], tracks[2]])
    expect(s.playlist).toEqual([])
    expect(s.tempQueue).toBe(true)
    expect(s.currentTrack).toEqual(tracks[1])
  })

  it('tempQueue 期间 syncPlaylist 不覆盖正在听的队列', () => {
    usePlayerStore.getState().playSelection([tracks[1], tracks[2]])
    // 播放列表变更（如外部加入歌曲）不应劫持临时队列
    usePlayerStore.getState().syncPlaylist([tracks[0], tracks[1], tracks[2]])
    const s = usePlayerStore.getState()
    expect(s.queue).toEqual([tracks[1], tracks[2]])
    expect(s.playlist).toEqual([])
    expect(s.tempQueue).toBe(true)
  })

  it('playFromPlaylist 激活播放列表并清除 tempQueue', () => {
    usePlayerStore.getState().playFromPlaylist([tracks[0], tracks[1], tracks[2]], tracks[2])
    const s = usePlayerStore.getState()
    expect(s.playlist).toEqual([tracks[0], tracks[1], tracks[2]])
    expect(s.tempQueue).toBe(false)
    expect(s.currentTrack).toEqual(tracks[2])
  })

  it('退出临时队列后 syncPlaylist 正常同步播放列表', () => {
    usePlayerStore.getState().playFromPlaylist([tracks[0], tracks[1]], tracks[0])
    usePlayerStore.getState().syncPlaylist([tracks[0], tracks[1], tracks[2]])
    expect(usePlayerStore.getState().playlist).toEqual([tracks[0], tracks[1], tracks[2]])
  })
})

describe('播放列表模式下队列操作路由到播放列表（不误删收藏）', () => {
  it('removeQueueItem 删除播放列表曲目而非收藏列表', () => {
    usePlayerStore.getState().playFromPlaylist([tracks[0], tracks[1]], tracks[0])
    usePlayerStore.getState().removeQueueItem(1)
    expect(usePlaylistStore.getState().playlistTracks).toEqual([tracks[1]])
    // 收藏列表不受影响
    expect(usePlaylistStore.getState().playlist).toEqual([tracks[2]])
    // 播放器播放列表同步更新
    expect(usePlayerStore.getState().playlist).toEqual([tracks[1]])
  })

  it('reorderQueue 重排播放列表而非收藏列表', () => {
    usePlayerStore.getState().playFromPlaylist([tracks[0], tracks[1]], tracks[0])
    usePlayerStore.getState().reorderQueue(0, 1)
    expect(usePlaylistStore.getState().playlistTracks).toEqual([tracks[1], tracks[0]])
    expect(usePlaylistStore.getState().playlist).toEqual([tracks[2]])
  })
})

describe('普通队列操作', () => {
  it('非播放列表模式下 removeQueueItem 只改队列', () => {
    usePlayerStore.setState({ playlist: [], tempQueue: true, queue: [tracks[0], tracks[1]] })
    usePlayerStore.getState().removeQueueItem(1)
    expect(usePlayerStore.getState().queue).toEqual([tracks[1]])
    expect(usePlaylistStore.getState().playlistTracks).toEqual([tracks[0], tracks[1]])
  })

  it('播放列表模式下 setQueue 被忽略', () => {
    usePlayerStore.getState().playFromPlaylist([tracks[0], tracks[1]], tracks[0])
    // requestPlay 已把队列同步为播放列表
    expect(usePlayerStore.getState().queue).toEqual([tracks[0], tracks[1]])
    usePlayerStore.getState().setQueue([tracks[2]])
    expect(usePlayerStore.getState().queue).toEqual([tracks[0], tracks[1]])
    expect(usePlayerStore.getState().playlist).toEqual([tracks[0], tracks[1]])
  })
})

describe('next/prev 基于当前模式队列', () => {
  it('播放列表模式下 next 在播放列表内推进', () => {
    usePlayerStore.getState().playFromPlaylist([tracks[0], tracks[1]], tracks[0])
    usePlayerStore.getState().setPlayMode('sequential')
    usePlayerStore.getState().next()
    expect(usePlayerStore.getState().currentTrack).toEqual(tracks[1])
  })

  it('single 模式 next 重复当前曲目', () => {
    usePlayerStore.getState().playFromPlaylist([tracks[0], tracks[1]], tracks[0])
    usePlayerStore.getState().setPlayMode('single')
    usePlayerStore.getState().next()
    expect(usePlayerStore.getState().currentTrack).toEqual(tracks[0])
  })
})

describe('replaceTrack 音源切换替换', () => {
  it('替换播放器中的当前曲目与播放列表', () => {
    const replacement = makeTrack(1, '新音源')
    replacement.path = 'Y:/audio/1-alt.flac'
    usePlayerStore.getState().playFromPlaylist([tracks[0], tracks[1]], tracks[0])
    usePlayerStore.getState().replaceTrack(1, replacement)
    const s = usePlayerStore.getState()
    expect(s.currentTrack?.path).toBe(replacement.path)
    expect(s.playlist[0].path).toBe(replacement.path)
    expect(s.queue[0].path).toBe(replacement.path)
  })
})
