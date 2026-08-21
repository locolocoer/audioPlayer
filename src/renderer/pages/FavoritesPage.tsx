import { useEffect, useState, useMemo, useCallback } from 'react'
import { useMusicStore } from '../stores/musicStore'
import { usePlayerStore } from '../stores/playerStore'
import PlaylistPickerModal from '../components/PlaylistPickerModal'
import MusicList from '../components/MusicList'
import { useT } from '../i18n'
import type { MusicFile } from '../../main/types'

type SortField = 'title' | 'artist' | 'album' | 'duration' | 'playCount' | 'lastPlayed'
type SortDir = 'asc' | 'desc'

export default function FavoritesPage(): JSX.Element {
  const t = useT()
  const favorites = useMusicStore((s) => s.favorites)
  const loadFavorites = useMusicStore((s) => s.loadFavorites)
  const { requestPlay, setQueue } = usePlayerStore()
  const [pickerTracks, setPickerTracks] = useState<MusicFile[] | null>(null)
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
      } else if (sortField === 'playCount') {
        cmp = (a.playCount || 0) - (b.playCount || 0)
      } else if (sortField === 'lastPlayed') {
        cmp = String(a.lastPlayed || '').localeCompare(String(b.lastPlayed || ''))
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
        <h2>{t('nav.favorites')}</h2>
        <div className="library-controls">
          <input
            type="text"
            placeholder={t('favorites.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input"
          />
          {favorites.length > 0 && (
            <button className="btn btn-secondary" onClick={() => setPickerTracks(favorites)} title={t('favorites.addAllTitle')}>
              {t('favorites.addAll')}
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
      {pickerTracks && (
        <PlaylistPickerModal tracks={pickerTracks} onClose={() => setPickerTracks(null)} />
      )}
    </div>
  )
}
