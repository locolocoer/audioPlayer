import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AddSongsModal from './AddSongsModal'
import { useMusicStore } from '../stores/musicStore'
import { usePlaylistStore } from '../stores/playlistStore'
import { usePlayerStore } from '../stores/playerStore'
import { t } from '../i18n'
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

const t1 = makeTrack(1)
const t2 = makeTrack(2)
const t3 = makeTrack(3)

beforeEach(() => {
  vi.clearAllMocks()
  useMusicStore.setState({ tracks: [t1, t2, t3], favorites: [], configs: [] })
  usePlaylistStore.setState({
    playlists: [
      { id: 100, name: '播放列表', trackIds: '[1]', createdAt: '2024-01-01', kind: 'playlist' },
      { id: 200, name: '我的收藏', trackIds: '[]', createdAt: '2024-01-01', kind: 'favorite' }
    ],
    activeId: 200,
    playlist: [],
    playlistId: 100,
    playlistTracks: [t1]
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
    playlist: [t1],
    tempQueue: false,
    loopA: null,
    loopB: null,
    audioSrc: null,
    autoPlayBlocked: false
  })
})

describe('AddSongsModal 添加歌曲', () => {
  it('提供 onAdded 时内部不重复添加（防双重添加回归）', async () => {
    const user = userEvent.setup()
    // 模拟父组件 PlaylistPage.handleAddSongs 的真实行为（由父组件执行添加）
    const onAdded = vi.fn(async (tr: MusicFile[]) => {
      await usePlaylistStore.getState().addTracksToPlaylist(100, tr)
    })
    render(<AddSongsModal targetId={100} targetTracks={[t1]} onClose={() => {}} onAdded={onAdded} />)

    // t1 已在目标列表，可勾选的是 t2/t3
    await user.click(screen.getByText('歌曲2'))
    await user.click(screen.getByRole('button', { name: t('playlist.addSelected', { n: 1 }) }))

    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1))
    expect(onAdded).toHaveBeenCalledWith([t2])
    // 添加只由父组件执行一次：模态框内部不再重复 addTracksToPlaylist
    expect(window.api.playlist.save).toHaveBeenCalledTimes(1)
    expect(usePlaylistStore.getState().playlistTracks.map((x) => x.id)).toEqual([1, 2])
  })

  it('无 onAdded 时内部直接添加到目标列表并持久化', async () => {
    const user = userEvent.setup()
    render(<AddSongsModal targetId={200} targetTracks={[]} onClose={() => {}} />)

    await user.click(screen.getByText('歌曲1'))
    await user.click(screen.getByText('歌曲2'))
    await user.click(screen.getByRole('button', { name: t('playlist.addSelected', { n: 2 }) }))

    await waitFor(() => expect(window.api.playlist.save).toHaveBeenCalledTimes(1))
    const saved = vi.mocked(window.api.playlist.save).mock.calls[0][0]
    expect(saved.id).toBe(200)
    expect(saved.trackIds).toBe('[1,2]')
  })

  it('已在目标列表的歌曲不显示为可选项', () => {
    render(<AddSongsModal targetId={100} targetTracks={[t1]} onClose={() => {}} />)
    expect(screen.queryByText('歌曲1')).not.toBeInTheDocument()
    expect(screen.getByText('歌曲2')).toBeInTheDocument()
  })

  it('父组件重渲染不清空已勾选（reset effect 不依赖 onClose）', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <AddSongsModal targetId={100} targetTracks={[t1]} onClose={() => {}} onAdded={() => {}} />
    )
    await user.click(screen.getByText('歌曲2'))
    expect(screen.getByRole('button', { name: t('playlist.addSelected', { n: 1 }) })).toBeEnabled()
    // 模拟父组件重渲染（onClose 是新函数）
    rerender(
      <AddSongsModal targetId={100} targetTracks={[t1]} onClose={() => {}} onAdded={() => {}} />
    )
    expect(screen.getByRole('button', { name: t('playlist.addSelected', { n: 1 }) })).toBeEnabled()
  })
})
