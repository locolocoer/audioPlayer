import { useEffect, useState, useMemo, useCallback } from 'react'
import { usePlayerStore } from '../stores/playerStore'
import MusicList from '../components/MusicList'
import { useT } from '../i18n'
import type { MusicFile } from '../../main/types'

type SortField = 'title' | 'artist' | 'album' | 'duration' | 'playCount' | 'lastPlayed'
type SortDir = 'asc' | 'desc'

export default function RecentPage(): JSX.Element {
  const t = useT()
  const { requestPlay, setQueue } = usePlayerStore()
  const [tracks, setTracks] = useState<MusicFile[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    window.api.music.recent(200).then((list) => {
      setTracks(list)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    if (!search) return tracks
    const q = search.toLowerCase()
    return tracks.filter((t) =>
      t.title.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q) ||
      t.album.toLowerCase().includes(q)
    )
  }, [tracks, search])

  const handleRowClick = useCallback((track: typeof tracks[0]) => {
    setQueue(filtered)
    requestPlay(track)
  }, [filtered, requestPlay, setQueue])

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header">
        <h2>{t('nav.recent')}</h2>
        <div className="library-controls">
          <input
            type="text"
            placeholder={t('recent.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input"
          />
        </div>
      </div>
      {loading ? (
        <div className="empty-state"><p>{t('common.loading')}</p></div>
      ) : (
        <MusicList
          tracks={filtered}
          sortField="lastPlayed"
          sortDir="desc"
          onSort={() => {}}
          onRowClick={handleRowClick}
        />
      )}
    </div>
  )
}
