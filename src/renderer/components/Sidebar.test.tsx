import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Sidebar from './Sidebar'
import { usePlayerStore } from '../stores/playerStore'

beforeEach(() => {
  vi.clearAllMocks()
  usePlayerStore.setState({
    currentTrack: null, pendingTrack: null, isPlaying: false, isLoading: false, loadError: null,
    currentTime: 0, duration: 0, queue: [], playlist: [], tempQueue: false,
    loopA: null, loopB: null, audioSrc: null, autoPlayBlocked: false
  })
})

describe('Sidebar 导航', () => {
  it('渲染全部导航链接', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    )
    for (const name of ['音乐库', '正在播放', '播放列表', '我的收藏', '播放历史', '重复歌曲', '听歌统计', '设置']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument()
    }
  })

  it('当前路由对应链接带 active 状态', () => {
    render(
      <MemoryRouter initialEntries={['/playlist']}>
        <Sidebar />
      </MemoryRouter>
    )
    const link = screen.getByRole('link', { name: '播放列表' })
    expect(link.className).toContain('active')
  })
})
