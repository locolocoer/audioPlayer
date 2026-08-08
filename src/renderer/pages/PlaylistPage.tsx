import { useState, useMemo, useCallback } from 'react'
import { usePlaylistStore } from '../stores/playlistStore'
import { usePlayerStore } from '../stores/playerStore'
import MusicList from '../components/MusicList'

type SortField = 'title' | 'artist' | 'album' | 'duration'
type SortDir = 'asc' | 'desc'

export default function PlaylistPage(): JSX.Element {
  const playlist = usePlaylistStore((s) => s.playlist)
  const clearPlaylist = usePlaylistStore((s) => s.clearPlaylist)
  const { requestPlay, setQueue } = usePlayerStore()
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('title')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const handleSort = useCallback((field: SortField) => {
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
    result = [...result].sort((a, b) => {
      let cmp = 0
      if (sortField === 'duration') {
        cmp = a.duration - b.duration
      } else {
        cmp = String(a[sortField] || '').localeCompare(String(b[sortField] || ''))
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return result
  }, [playlist, search, sortField, sortDir])

  const handleRowClick = useCallback((track: typeof playlist[0]) => {
    setQueue(filtered)
    requestPlay(track)
  }, [filtered, requestPlay, setQueue])

  if (playlist.length === 0) {
    return (
      <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="page-header">
          <h2>播放列表</h2>
        </div>
        <div className="empty-state">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor" opacity={0.3}>
            <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
          </svg>
          <p>播放列表为空</p>
          <p className="empty-hint">在音乐库中右键歌曲，选择"添加到播放列表"</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header">
        <h2>播放列表</h2>
        <div className="library-controls">
          <input
            type="text"
            placeholder="搜索播放列表..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input"
          />
          <button className="btn btn-secondary" onClick={clearPlaylist} title="清空播放列表">
            清空列表
          </button>
        </div>
      </div>
      <MusicList
        tracks={filtered}
        sortField={sortField}
        sortDir={sortDir}
        onSort={handleSort}
        onRowClick={handleRowClick}
      />
      <div className="playlist-status">
        共 {playlist.length} 首歌曲
      </div>
    </div>
  )
}
