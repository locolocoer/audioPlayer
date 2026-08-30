import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import MusicList from './MusicList'
import { useMusicStore } from '../stores/musicStore'
import { usePlaylistStore } from '../stores/playlistStore'
import { usePlayerStore } from '../stores/playerStore'
import type { MusicFile } from '../../main/types'

function makeTrack(id: number): MusicFile {
  return {
    id,
    path: `Y:/audio/${id}.mp3`,
    filename: `${id}.mp3`,
    size: 1000,
    mtime: '2024-01-01',
    title: `歌曲${id}`,
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
  useMusicStore.setState({
    tracks,
    favorites: [],
    configs: [{ id: 'local_test', name: '本机', url: 'Y:/audio', username: '', password: '', port: 0, enabled: true, createdAt: '2024-01-01', sourceType: 'local' }]
  })
  usePlaylistStore.setState({
    playlists: [{ id: 100, name: '播放列表', trackIds: '[1]', createdAt: '2024-01-01', kind: 'playlist' }],
    activeId: null,
    playlist: [],
    playlistId: 100,
    playlistTracks: [tracks[0]]
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
    playlist: [tracks[0]],
    tempQueue: false,
    loopA: null,
    loopB: null,
    audioSrc: null,
    autoPlayBlocked: false
  })
})

function renderList(): void {
  render(
    <MusicList
      tracks={tracks}
      sortField="title"
      sortDir="asc"
      onSort={vi.fn()}
      onRowClick={vi.fn()}
    />
  )
}

function rowOf(title: string): HTMLElement {
  const cell = screen.getByText(title)
  const row = cell.closest('tr')
  if (!row) throw new Error(`row not found for ${title}`)
  return row
}

describe('MusicList 右键菜单（已定型的四项交互）', () => {
  it('右键行显示：查看详情 / 打开文件位置 / 添加到播放列表 / 添加到收藏', () => {
    renderList()
    fireEvent.contextMenu(rowOf('歌曲1'))
    expect(screen.getByText('查看详情')).toBeInTheDocument()
    expect(screen.getByText('打开文件位置')).toBeInTheDocument()
    expect(screen.getByText('添加到播放列表')).toBeInTheDocument()
    expect(screen.getByText('添加到收藏')).toBeInTheDocument()
    // 已移除的入口不再出现
    expect(screen.queryByText(/从播放列表移除/)).not.toBeInTheDocument()
  })

  it('「添加到播放列表」直接加入固定播放列表（去重）', async () => {
    renderList()
    fireEvent.contextMenu(rowOf('歌曲3'))
    fireEvent.click(screen.getByText('添加到播放列表'))
    // t3 不在播放列表 → 加入；t1 已在 → 不重复
    expect(usePlaylistStore.getState().playlistTracks.map((t) => t.id)).toEqual([1, 3])
    await waitFor(() => expect(window.api.playlist.save).toHaveBeenCalled())
  })

  it('「添加到收藏」打开收藏选择器', () => {
    renderList()
    fireEvent.contextMenu(rowOf('歌曲1'))
    fireEvent.click(screen.getByText('添加到收藏'))
    // PlaylistPickerModal 打开：显示我的收藏入口（含 ★ 前缀）
    expect(screen.getByText(/我的收藏/)).toBeInTheDocument()
  })
})

describe('MusicList 多选', () => {
  it('多选后「加入播放列表」批量加入固定播放列表', () => {
    renderList()
    fireEvent.click(screen.getByText('多选'))
    fireEvent.click(rowOf('歌曲2'))
    fireEvent.click(rowOf('歌曲3'))
    expect(screen.getByText('已选 2 首')).toBeInTheDocument()
    fireEvent.click(screen.getByText('加入播放列表'))
    expect(usePlaylistStore.getState().playlistTracks.map((t) => t.id)).toEqual([1, 2, 3])
  })

  it('多选后「收藏」打开收藏选择器', () => {
    renderList()
    fireEvent.click(screen.getByText('多选'))
    fireEvent.click(rowOf('歌曲2'))
    fireEvent.click(screen.getByText('收藏'))
    expect(screen.getByText(/我的收藏/)).toBeInTheDocument()
  })
})
