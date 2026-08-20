import { useState, useMemo, useCallback } from 'react'
import { usePlaylistStore } from '../stores/playlistStore'
import { usePlayerStore } from '../stores/playerStore'
import MusicList from '../components/MusicList'
import { useT } from '../i18n'

type SortField = 'order' | 'title' | 'artist' | 'album' | 'duration' | 'playCount' | 'lastPlayed'
type SortDir = 'asc' | 'desc'

export default function PlaylistPage(): JSX.Element {
  const t = useT()
  const playlists = usePlaylistStore((s) => s.playlists)
  const activeId = usePlaylistStore((s) => s.activeId)
  const playlist = usePlaylistStore((s) => s.playlist)
  const createPlaylist = usePlaylistStore((s) => s.createPlaylist)
  const renamePlaylist = usePlaylistStore((s) => s.renamePlaylist)
  const deletePlaylist = usePlaylistStore((s) => s.deletePlaylist)
  const selectPlaylist = usePlaylistStore((s) => s.selectPlaylist)
  const clearPlaylist = usePlaylistStore((s) => s.clearPlaylist)
  const reorder = usePlaylistStore((s) => s.reorder)
  const reorderMany = usePlaylistStore((s) => s.reorderMany)
  const { requestPlay, setQueue } = usePlayerStore()
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('order')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')

  const activeName = playlists.find((p) => p.id === activeId)?.name || ''

  const handleSort = useCallback((field: 'title' | 'artist' | 'album' | 'duration' | 'playCount' | 'lastPlayed') => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }, [sortField, sortDir])

  const filtered = useMemo(() => {
    let result = playlist
    if (search) {
      const q = search.toLowerCase()
      result = result.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q)
      )
    }
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
  }, [playlist, search, sortField, sortDir])

  const handleRowClick = useCallback((track: typeof playlist[0]) => {
    setQueue(filtered)
    requestPlay(track)
  }, [filtered, requestPlay, setQueue])

  // 拖拽回调：把 filtered 中的行索引/选中 id 映射回 playlist 的索引，避免搜索筛选时错位
  const wrapReorder = useCallback((from: number, to: number) => {
    if (sortField !== 'order') return
    const fromId = filtered[from]?.id
    const toId = filtered[to]?.id
    if (fromId === undefined || toId === undefined) return
    const pFrom = playlist.findIndex((t) => t.id === fromId)
    const pTo = playlist.findIndex((t) => t.id === toId)
    if (pFrom >= 0 && pTo >= 0) reorder(pFrom, pTo)
  }, [filtered, playlist, sortField, reorder])

  const wrapReorderMany = useCallback((ids: number[], to: number) => {
    if (sortField !== 'order') return
    const toId = filtered[to]?.id
    if (toId === undefined) return
    const pTo = playlist.findIndex((t) => t.id === toId)
    if (pTo >= 0) reorderMany(ids, pTo)
  }, [filtered, playlist, sortField, reorderMany])

  if (playlists.length === 0) {
    return (
      <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="page-header">
          <h2>{t('nav.playlist')}</h2>
        </div>
        <div className="empty-state">
          <p>{t('playlist.empty')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header">
        <h2>{activeName || t('nav.playlist')}</h2>
        <div className="library-controls">
          <div className="playlist-switcher">
            {playlists.map((p) => (
              <button key={p.id} className={`browse-tab${p.id === activeId ? ' active' : ''}`} onClick={() => selectPlaylist(p.id)}>
                {p.name}
              </button>
            ))}
          </div>
          {editing ? (
            <>
              <input
                type="text"
                className="filter-select"
                style={{ width: 140 }}
                value={editName}
                autoFocus
                onChange={(e) => setEditName(e.target.value)}
                placeholder={t('playlist.namePlaceholder')}
              />
              <button
                className="btn btn-secondary"
                onClick={() => {
                  if (activeId !== null && editName.trim()) {
                    renamePlaylist(activeId, editName.trim())
                  }
                  setEditing(false)
                }}
              >{t('common.save')}</button>
              <button className="btn btn-secondary" onClick={() => setEditing(false)}>{t('common.cancel')}</button>
            </>
          ) : (
            <>
              <input
                type="text"
                className="filter-select"
                style={{ width: 140 }}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('playlist.newNamePlaceholder')}
              />
              <button
                className="btn btn-secondary"
                onClick={() => {
                  if (newName.trim()) {
                    createPlaylist(newName.trim())
                    setNewName('')
                  }
                }}
              >{t('playlist.create')}</button>
              <button className="btn btn-secondary" onClick={() => { setEditName(activeName); setEditing(true) }}>{t('playlist.rename')}</button>
            </>
          )}
          <button className="btn btn-secondary" onClick={() => { if (activeId !== null) deletePlaylist(activeId) }}>{t('playlist.delete')}</button>
          <button className="btn btn-secondary" onClick={clearPlaylist} title={t('playlist.clearTitle')}>{t('playlist.clear')}</button>
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
      />
      <div className="playlist-status">
        {t('playlist.songCount', { count: playlist.length })}
      </div>
    </div>
  )
}
