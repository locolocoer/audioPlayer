import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import LibraryPage from './LibraryPage'
import { useMusicStore } from '../stores/musicStore'
import { usePlayerStore } from '../stores/playerStore'
import type { MusicFile } from '../../main/types'

function makeTrack(id: number, title: string, path: string): MusicFile {
  return {
    id, path, filename: path.split(/[\\/]/).pop() || '', size: 1000, mtime: '2024-01-01',
    title, artist: '歌手', album: '专辑', duration: 100,
    webdavId: 'local_test', scannedAt: '2024-01-01', favorite: 0
  }
}

const tracks = [
  makeTrack(1, '晴天', 'Y:/audio/华语/晴天.mp3'),
  makeTrack(2, '倔强', 'Y:/audio/华语/倔强.mp3'),
  makeTrack(3, 'Hello', 'Y:/audio/欧美/Hello.mp3')
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(window.api.music.getAiTags).mockResolvedValue([])
  // LibraryPage 挂载时 loadConfigs/loadTracks 会重新拉取，mock 返回与预置一致的数据
  vi.mocked(window.api.webdav.list).mockResolvedValue([])
  vi.mocked(window.api.music.list).mockResolvedValue(tracks)
  useMusicStore.setState({ tracks, favorites: [], configs: [] })
  usePlayerStore.setState({
    currentTrack: null, pendingTrack: null, isPlaying: false, isLoading: false, loadError: null,
    currentTime: 0, duration: 0, queue: [], playlist: [], tempQueue: false,
    loopA: null, loopB: null, audioSrc: null, autoPlayBlocked: false
  })
})

describe('LibraryPage 音乐库', () => {
  it('默认歌曲视图渲染所有歌曲行', () => {
    render(<LibraryPage />)
    expect(screen.getByText('晴天')).toBeInTheDocument()
    expect(screen.getByText('倔强')).toBeInTheDocument()
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('文件夹视图按目录分组显示子目录（根层显示盘符）', () => {
    render(<LibraryPage />)
    fireEvent.click(screen.getByText('文件夹'))
    // 根层子目录：Y:（盘符）
    expect(screen.getByText('Y:')).toBeInTheDocument()
    // 点击进入后显示下一层 audio
    fireEvent.click(screen.getByText('Y:'))
    expect(screen.getByText('audio')).toBeInTheDocument()
  })

  it('搜索过滤歌曲', async () => {
    render(<LibraryPage />)
    const input = screen.getByPlaceholderText('按歌名、歌手、专辑搜索...') as HTMLInputElement
    fireEvent.change(input, { target: { value: '晴天' } })
    expect(screen.getByText('晴天')).toBeInTheDocument()
    expect(screen.queryByText('Hello')).not.toBeInTheDocument()
  })
})
