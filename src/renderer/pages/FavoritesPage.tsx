import { useEffect, useState, useMemo, useCallback } from 'react'
import { useMusicStore } from '../stores/musicStore'
import { usePlayerStore } from '../stores/playerStore'
import { usePlaylistStore } from '../stores/playlistStore'
import MusicList from '../components/MusicList'

type SortField = 'title' | 'artist' | 'album' | 'duration' | 'playCount' | 'lastPlayed'
type SortDir = 'asc' | 'desc'

export default function FavoritesPage(): JSX.Element {
  const favorites = useMusicStore((s) => s.favorites)
  const loadFavorites = useMusicStore((s) => s.loadFavorites)
  const { requestPlay, setQueue } = usePlayerStore()
  const addTracks = usePlaylistStore((s) => s.addTracks)
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('title')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  useEffect(() => {
    loadFavorites()
  }, [loadFavorites])

  const handleSort = useCallback((field: 'title' | 'artist' | 'album' | 'duration' | 'playCount' | 'lastPlayed') => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }, [sortField, sortDir])

  const filtered = useMemo(() => {
    let result = favorites
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
  }, [favorites, search, sortField, sortDir])

  const handleRowClick = useCallback((track: typeof favorites[0]) => {
    setQueue(filtered)
    requestPlay(track)
  }, [filtered, requestPlay, setQueue])

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header">
        <h2>我的收藏</h2>
        <div className="library-controls">
          <input
            type="text"
            placeholder="搜索收藏..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input"
          />
          {favorites.length > 0 && (
            <button className="btn btn-secondary" onClick={() => addTracks(favorites)} title="将所有收藏歌曲添加到播放列表">
              + 全部添加到播放列表
            </button>
          )}
        </div>
      </div>
      <MusicList
        tracks={filtered}
        sortField={sortField}
        sortDir={sortDir}
        onSort={handleSort}
        onRowClick={handleRowClick}
        showFavorite={true}
      />
    </div>
  )
}
