import { useEffect, useState, useMemo, useCallback } from 'react'
import { useMusicStore } from '../stores/musicStore'
import { usePlayerStore } from '../stores/playerStore'
import { usePlaylistStore } from '../stores/playlistStore'
import MusicList from '../components/MusicList'

type SortField = 'title' | 'artist' | 'album' | 'duration'
type SortDir = 'asc' | 'desc'

export default function LibraryPage(): JSX.Element {
  const { tracks, loadTracks, configs, loadConfigs } = useMusicStore()
  const { requestPlay, setQueue } = usePlayerStore()
  const addTracks = usePlaylistStore((s) => s.addTracks)
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('title')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [filterConfig, setFilterConfig] = useState<string>('')

  useEffect(() => {
    loadConfigs()
    loadTracks()
  }, [loadConfigs, loadTracks])

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }, [sortField, sortDir])

  const filtered = useMemo(() => {
    let result = tracks
    if (search) {
      const q = search.toLowerCase()
      result = result.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q)
      )
    }
    if (filterConfig) {
      result = result.filter((t) => t.webdavId === filterConfig)
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
  }, [tracks, search, filterConfig, sortField, sortDir])

  const handleRowClick = useCallback((track: typeof tracks[0]) => {
    setQueue(filtered)
    requestPlay(track)
  }, [filtered, requestPlay, setQueue])

  return (
    <div className="page library-page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header">
        <h2>音乐库</h2>
        <div className="library-controls">
          <input
            type="text"
            placeholder="按歌名、歌手、专辑搜索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input"
          />
          <select value={filterConfig} onChange={(e) => setFilterConfig(e.target.value)} className="filter-select">
            <option value="">全部来源</option>
            {configs.map((c) => (
              <option key={c.id} value={c.id}>{c.name || c.url}</option>
            ))}
          </select>
          {(search || filterConfig) && filtered.length > 0 && (
            <button className="btn btn-secondary" onClick={() => addTracks(filtered)} title="将当前筛选结果添加到播放列表">
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
      />
    </div>
  )
}
