import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FavoritesPage from './FavoritesPage'
import { useMusicStore } from '../stores/musicStore'
import { usePlaylistStore } from '../stores/playlistStore'
import { usePlayerStore } from '../stores/playerStore'
import type { MusicFile } from '../../main/types'

function makeTrack(id: number, title: string, path: string): MusicFile {
  return {
    id, path, filename: path.split(/[\\/]/).pop() || '', size: 1000, mtime: '2024-01-01',
    title, artist: '歌手', album: '专辑', duration: 100,
    webdavId: 'local_test', scannedAt: '2024-01-01', favorite: 0
  }
}

const t1 = makeTrack(1, '晴天', 'Y:/audio/a/晴天.mp3')
const t2 = makeTrack(2, '倔强', 'Y:/audio/b/倔强.mp3')

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(window.api.music.favoriteList).mockResolvedValue([t1])
  vi.mocked(window.api.music.byIds).mockResolvedValue([t2])
  useMusicStore.setState({ tracks: [t1, t2], favorites: [t1], configs: [] })
  usePlaylistStore.setState({
    playlists: [
      { id: 200, name: '我的收藏', trackIds: '[1]', createdAt: '2024-01-01', kind: 'favorite' },
      { id: 201, name: '摇滚收藏', trackIds: '[2]', createdAt: '2024-01-01', kind: 'favorite' }
    ],
    activeId: 200,
    playlist: [t1],
    playlistId: null,
    playlistTracks: []
  })
  usePlayerStore.setState({
    currentTrack: null, pendingTrack: null, isPlaying: false, isLoading: false, loadError: null,
    currentTime: 0, duration: 0, queue: [], playlist: [], tempQueue: false,
    loopA: null, loopB: null, audioSrc: null, autoPlayBlocked: false
  })
})

describe('FavoritesPage 收藏网格视图', () => {
  it('渲染「我的收藏」与各收藏夹卡片，显示歌曲数', () => {
    render(<FavoritesPage />)
    // 「我的收藏」卡片 + 收藏夹列表里的「我的收藏」可能出现多次
    expect(screen.getAllByText('我的收藏').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('摇滚收藏')).toBeInTheDocument()
    // 两个卡片各显示歌曲数（共 1 首歌曲）
    expect(screen.getAllByText('共 1 首歌曲').length).toBeGreaterThanOrEqual(2)
  })

  it('右键收藏夹卡片弹出管理菜单（播放全部/添加歌曲/重命名/删除列表）', () => {
    render(<FavoritesPage />)
    const card = screen.getByText('摇滚收藏').closest('.square-card')
    expect(card).not.toBeNull()
    fireEvent.contextMenu(card as HTMLElement)
    expect(screen.getByText('播放全部')).toBeInTheDocument()
    expect(screen.getByText('添加歌曲')).toBeInTheDocument()
    expect(screen.getByText('重命名')).toBeInTheDocument()
    expect(screen.getByText('删除列表')).toBeInTheDocument()
  })

  it('点击收藏夹卡片进入列表视图并显示歌曲', async () => {
    render(<FavoritesPage />)
    fireEvent.click(screen.getByText('摇滚收藏').closest('.square-card') as HTMLElement)
    // 进入列表视图（selectPlaylist 异步加载）：返回按钮 + 歌曲行
    expect(await screen.findByText('‹ 摇滚收藏')).toBeInTheDocument()
    expect(await screen.findByText('倔强')).toBeInTheDocument()
  })
})
