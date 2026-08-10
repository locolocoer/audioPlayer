import { useState, useMemo, useCallback } from 'react'
import { usePlaylistStore } from '../stores/playlistStore'
import { usePlayerStore } from '../stores/playerStore'
import MusicList from '../components/MusicList'

type SortField = 'order' | 'title' | 'artist' | 'album' | 'duration' | 'playCount' | 'lastPlayed'
type SortDir = 'asc' | 'desc'

export default function PlaylistPage(): JSX.Element {
  const playlists = usePlaylistStore((s) => s.playlists)
  const activeId = usePlaylistStore((s) => s.activeId)
  const playlist = usePlaylistStore((s) => s.playlist)
  const createPlaylist = usePlaylistStore((s) => s.createPlaylist)
  const renamePlaylist = usePlaylistStore((s) => s.renamePlaylist)
  const deletePlaylist = usePlaylistStore((s) => s.deletePlaylist)
  const selectPlaylist = usePlaylistStore((s) => s.selectPlaylist)
  const clearPlaylist = usePlaylistStore((s) => s.clearPlaylist)
  const reorder = usePlaylistStore((s) => s.reorder)
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

  if (playlists.length === 0) {
    return (
      <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="page-header">
          <h2>播放列表</h2>
        </div>
        <div className="empty-state">
          <p>播放列表为空</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header">
        <h2>{activeName || '播放列表'}</h2>
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
                placeholder="列表名称"
              />
              <button
                className="btn btn-secondary"
                onClick={() => {
                  if (activeId !== null && editName.trim()) {
                    renamePlaylist(activeId, editName.trim())
                  }
                  setEditing(false)
                }}
              >保存</button>
              <button className="btn btn-secondary" onClick={() => setEditing(false)}>取消</button>
            </>
          ) : (
            <>
              <input
                type="text"
                className="filter-select"
                style={{ width: 140 }}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="新建列表名"
              />
              <button
                className="btn btn-secondary"
                onClick={() => {
                  if (newName.trim()) {
                    createPlaylist(newName.trim())
                    setNewName('')
                  }
                }}
              >新建</button>
              <button className="btn btn-secondary" onClick={() => { setEditName(activeName); setEditing(true) }}>重命名</button>
            </>
          )}
          <button className="btn btn-secondary" onClick={() => { if (activeId !== null) deletePlaylist(activeId) }}>删除列表</button>
          <button className="btn btn-secondary" onClick={clearPlaylist} title="清空当前列表">清空</button>
        </div>
      </div>
      <MusicList
        tracks={filtered}
        sortField={sortField}
        sortDir={sortDir}
        onSort={handleSort}
        onRowClick={handleRowClick}
        onReorder={sortField === 'order' ? reorder : undefined}
      />
      <div className="playlist-status">
        共 {playlist.length} 首歌曲
      </div>
    </div>
  )
}
