import { useState, useMemo, useCallback } from 'react'
import { usePlaylistStore } from '../stores/playlistStore'
import { usePlayerStore } from '../stores/playerStore'
import { useToastStore } from '../stores/toastStore'
import MusicList from '../components/MusicList'
import AddSongsModal from '../components/AddSongsModal'
import { useT } from '../i18n'
import type { MusicFile } from '../../main/types'

type SortField = 'order' | 'title' | 'artist' | 'album' | 'duration' | 'playCount' | 'lastPlayed'
type SortDir = 'asc' | 'desc'

export default function PlaylistPage(): JSX.Element {
  const t = useT()
  const playlists = usePlaylistStore((s) => s.playlists)
  const playlistId = usePlaylistStore((s) => s.playlistId)
  const playlistTracks = usePlaylistStore((s) => s.playlistTracks)
  const addPlaylistTracks = usePlaylistStore((s) => s.addPlaylistTracks)
  const reorderPlaylist = usePlaylistStore((s) => s.reorderPlaylist)
  const reorderManyPlaylist = usePlaylistStore((s) => s.reorderManyPlaylist)
  const clearPlaylistTracks = usePlaylistStore((s) => s.clearPlaylistTracks)
  const addTracksToPlaylist = usePlaylistStore((s) => s.addTracksToPlaylist)
  const { playFromPlaylist } = usePlayerStore()
  const addToast = useToastStore((s) => s.addToast)
  const [sortField, setSortField] = useState<SortField>('order')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [addSongsOpen, setAddSongsOpen] = useState(false)

  const playlistName = useMemo(() => {
    const meta = playlists.find((p) => p.id === playlistId)
    return meta ? meta.name : t('nav.playlist')
  }, [playlists, playlistId, t])

  const handleSort = useCallback((field: 'title' | 'artist' | 'album' | 'duration' | 'playCount' | 'lastPlayed') => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }, [sortField, sortDir])

  const filtered = useMemo(() => {
    let result = playlistTracks
    if (sortField !== 'order') {
      result = [...result].sort((a, b) => {
        let cmp = 0
        if (sortField === 'duration') {
          cmp = a.duration - b.duration
        } else if (sortField === 'playCount') {
          cmp = (a.playCount || 0) - (b.playCount || 0)
        } else if (sortField === 'lastPlayed') {
          cmp = String(a.lastPlayed || '').localeCompare(String(b.lastPlayed || ''))
        } else {
          cmp = String(a[sortField] || '').localeCompare(String(b[sortField] || ''))
        }
        return sortDir === 'asc' ? cmp : -cmp
      })
    } else {
      result = [...result]
    }
    return result
  }, [playlistTracks, sortField, sortDir])

  const handleRowClick = useCallback((track: MusicFile) => {
    // 激活播放列表模式并播放（避免覆盖用户可能正在听的临时队列语义混乱）
    playFromPlaylist(playlistTracks, track)
  }, [playFromPlaylist, playlistTracks])

  // 拖拽回调：把 filtered 中的行索引/选中 id 映射回 playlistTracks 的索引，避免搜索筛选时错位
  const wrapReorder = useCallback((from: number, to: number) => {
    if (sortField !== 'order') return
    const fromId = filtered[from]?.id
    const toId = filtered[to]?.id
    if (fromId === undefined || toId === undefined) return
    const pFrom = playlistTracks.findIndex((t) => t.id === fromId)
    const pTo = playlistTracks.findIndex((t) => t.id === toId)
    if (pFrom >= 0 && pTo >= 0) reorderPlaylist(pFrom, pTo)
  }, [filtered, playlistTracks, sortField, reorderPlaylist])

  const wrapReorderMany = useCallback((ids: number[], to: number) => {
    if (sortField !== 'order') return
    const toId = filtered[to]?.id
    if (toId === undefined) return
    const pTo = playlistTracks.findIndex((t) => t.id === toId)
    if (pTo >= 0) reorderManyPlaylist(ids, pTo)
  }, [filtered, playlistTracks, sortField, reorderManyPlaylist])

  // 导出当前播放列表
  const handleExport = useCallback(async (): Promise<void> => {
    if (playlistId === null) return
    const meta = playlists.find((p) => p.id === playlistId)
    if (!meta) return
    const r = await window.api.playlist.export(meta, playlistTracks)
    if (r.ok && r.path) {
      addToast(t('playlist.exported', { path: r.path }), 'success')
    } else if (r.error !== 'canceled') {
      addToast(t('playlist.exportFailed'), 'error')
    }
  }, [playlistId, playlists, playlistTracks, addToast, t])

  // 添加歌曲到播放列表
  const handleAddSongs = async (tracks: MusicFile[]): Promise<void> => {
    if (playlistId === null) return
    const added = await addTracksToPlaylist(playlistId, tracks)
    if (added > 0) {
      addToast(t('playlist.addedTo', { name: playlistName, n: added }), 'success')
    }
  }

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header">
        <h2>{t('nav.playlist')}</h2>
        <div className="library-controls">
          <button className="btn btn-sm" onClick={handleExport} title={t('playlist.exportTitle')}>{t('playlist.export')}</button>
          <button className="btn btn-secondary" onClick={clearPlaylistTracks} title={t('playlist.clearTitle')}>{t('playlist.clear')}</button>
          <button className="btn btn-primary" onClick={() => setAddSongsOpen(true)} title={t('playlist.addSongsTitle')}>{t('playlist.addSongs')}</button>
        </div>
      </div>
      <MusicList
        tracks={filtered}
        sortField={sortField}
        sortDir={sortDir}
        onSort={handleSort}
        onRowClick={handleRowClick}
        onReorder={sortField === 'order' ? wrapReorder : undefined}
        onReorderMany={sortField === 'order' ? wrapReorderMany : undefined}
        showMultiSelect={false}
      />
      <div className="playlist-status">
        {t('playlist.songCount', { count: playlistTracks.length })}
      </div>
      {addSongsOpen && (
        <AddSongsModal targetId={playlistId ?? undefined} targetTracks={playlistTracks} onClose={() => setAddSongsOpen(false)} onAdded={handleAddSongs} />
      )}
    </div>
  )
}
