import { useEffect, useState, useMemo, useCallback } from 'react'
import { useMusicStore } from '../stores/musicStore'
import { usePlayerStore } from '../stores/playerStore'
import { usePlaylistStore } from '../stores/playlistStore'
import { useToastStore } from '../stores/toastStore'
import MusicList from '../components/MusicList'
import AddSongsModal from '../components/AddSongsModal'
import Modal from '../components/Modal'
import { getCoverCached, setCoverCached, coverCacheKey } from '../utils/coverCache'
import { useT } from '../i18n'
import type { MusicFile, Playlist } from '../../main/types'

type SortField = 'title' | 'artist' | 'album' | 'duration' | 'playCount' | 'lastPlayed'
type SortDir = 'asc' | 'desc'

// 收藏列表卡片封面：显示列表内第一首歌曲的封面
function FavCover({ track }: { track: MusicFile | undefined }): JSX.Element {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!track) return
    const key = coverCacheKey(track)
    const cached = getCoverCached(key)
    if (cached) {
      setUrl(cached)
      return
    }
    window.api.player.getCover(track.webdavId, track.path).then((r) => {
      if (r.data && r.data.length > 0) {
        const blob = new Blob([new Uint8Array(r.data)], { type: r.format || 'image/jpeg' })
        const u = URL.createObjectURL(blob)
        setCoverCached(key, u)
        setUrl(u)
      }
    }).catch(() => {})
  }, [track])
  if (url) return <img className="square-card-cover square-card-cover-img" src={url} alt="" loading="lazy" />
  return (
    <div className="square-card-cover">
      <svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor">
        <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
      </svg>
    </div>
  )
}

export default function FavoritesPage(): JSX.Element {
  const t = useT()
  const favorites = useMusicStore((s) => s.favorites)
  const loadFavorites = useMusicStore((s) => s.loadFavorites)
  const allTracks = useMusicStore((s) => s.tracks)
  const { requestPlay, setQueue } = usePlayerStore()
  const addToast = useToastStore((s) => s.addToast)
  const playlists = usePlaylistStore((s) => s.playlists)
  const activeId = usePlaylistStore((s) => s.activeId)
  const playlist = usePlaylistStore((s) => s.playlist)
  const createPlaylist = usePlaylistStore((s) => s.createPlaylist)
  const renamePlaylist = usePlaylistStore((s) => s.renamePlaylist)
  const deletePlaylist = usePlaylistStore((s) => s.deletePlaylist)
  const selectPlaylist = usePlaylistStore((s) => s.selectPlaylist)
  const removeTrack = usePlaylistStore((s) => s.removeTrack)
  // null = 网格视图；'favorites' 或 列表 id = 列表视图
  const [current, setCurrent] = useState<'favorites' | number | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; id: 'favorites' | number } | null>(null)
  const [editTarget, setEditTarget] = useState<{ id: number; name: string } | null>(null)
  const [editName, setEditName] = useState('')
  const [addSongsTo, setAddSongsTo] = useState<number | null>(null)
  const [sortField, setSortField] = useState<SortField>('title')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  useEffect(() => {
    loadFavorites()
  }, [loadFavorites])

  useEffect(() => {
    if (!menu) return
    const handler = (): void => setMenu(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [menu])

  const favLists = useMemo(() => playlists.filter((p) => p.kind === 'favorite'), [playlists])

  const firstTrackOf = useCallback((trackIds: string): MusicFile | undefined => {
    try {
      const ids = JSON.parse(trackIds)
      if (Array.isArray(ids) && ids.length > 0) {
        return allTracks.find((x) => x.id === Number(ids[0]))
      }
    } catch { /* ignore */ }
    return undefined
  }, [allTracks])

  const countOf = (trackIds: string): number => {
    try {
      const parsed = JSON.parse(trackIds)
      return Array.isArray(parsed) ? parsed.length : 0
    } catch { return 0 }
  }

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }, [sortField, sortDir])

  // ===== 列表视图 =====
  if (current !== null) {
    const isFavorites = current === 'favorites'
    const listMeta = isFavorites ? null : favLists.find((p) => p.id === current)
    const source = isFavorites ? favorites : playlist
    const sorted = [...source].sort((a, b) => {
      let cmp = 0
      if (sortField === 'duration') cmp = a.duration - b.duration
      else if (sortField === 'playCount') cmp = (a.playCount || 0) - (b.playCount || 0)
      else if (sortField === 'lastPlayed') cmp = String(a.lastPlayed || '').localeCompare(String(b.lastPlayed || ''))
      else cmp = String(a[sortField] || '').localeCompare(String(b[sortField] || ''))
      return sortDir === 'asc' ? cmp : -cmp
    })
    const handleRowClick = (track: MusicFile): void => {
      setQueue(sorted)
      requestPlay(track)
    }
    return (
      <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="page-header">
          <h2>
            <span className="browse-back" onClick={() => setCurrent(null)}>
              ‹ {isFavorites ? t('favorites.default') : (listMeta ? listMeta.name : '')}
            </span>
          </h2>
          <div className="library-controls">
            {!isFavorites && (
              <button className="btn btn-sm" onClick={() => setAddSongsTo(current as number)}>{t('playlist.addSongs')}</button>
            )}
          </div>
        </div>
        <MusicList
          tracks={sorted}
          sortField={sortField}
          sortDir={sortDir}
          onSort={handleSort}
          onRowClick={handleRowClick}
          showFavorite={isFavorites}
          onRemoveFromPlaylist={!isFavorites ? (track) => removeTrack(track.id) : undefined}
        />
        {!isFavorites && addSongsTo !== null && (
          <AddSongsModal targetId={addSongsTo} targetTracks={playlist} onClose={() => setAddSongsTo(null)} />
        )}
      </div>
    )
  }

  // ===== 网格视图 =====
  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header">
        <h2>{t('nav.favorites')}</h2>
        <div className="library-controls">
          <input
            type="text"
            className="filter-select"
            style={{ width: 120 }}
            placeholder={t('playlist.newNamePlaceholder')}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && editName.trim()) {
                createPlaylist(editName.trim(), 'favorite')
                setEditName('')
                setCurrent('favorites')
              }
            }}
          />
          <button
            className="btn btn-sm"
            onClick={() => {
              if (editName.trim()) {
                createPlaylist(editName.trim(), 'favorite')
                setEditName('')
                setCurrent('favorites')
              }
            }}
          >{t('playlist.create')}</button>
        </div>
      </div>

      <div className="square-scroll">
        <div className="square-grid">
          <div
            className="square-card"
            onClick={() => setCurrent('favorites')}
            onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, id: 'favorites' }) }}
          >
            <FavCover track={favorites[0]} />
            <div className="square-card-name">{t('favorites.default')}</div>
            <div className="square-card-meta">{t('playlist.songCount', { count: favorites.length })}</div>
          </div>

          {favLists.map((p: Playlist) => (
            <div
              key={p.id}
              className="square-card"
              onClick={() => {
                selectPlaylist(p.id)
                setCurrent(p.id)
              }}
              onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, id: p.id }) }}
            >
              <FavCover track={firstTrackOf(p.trackIds)} />
              <div className="square-card-name">{p.name}</div>
              <div className="square-card-meta">{t('playlist.songCount', { count: countOf(p.trackIds) })}</div>
            </div>
          ))}
        </div>
      </div>

      {menu && (
        <div className="context-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <div
            className="context-menu-item"
            onClick={() => {
              const list = menu.id === 'favorites' ? favorites : playlist
              if (list.length > 0) {
                usePlayerStore.getState().setPlayMode('sequential')
                usePlayerStore.getState().playSelection(list)
              }
              setMenu(null)
            }}
          >{t('playlist.playAll')}</div>
          {menu.id !== 'favorites' && (
            <>
              <div
                className="context-menu-item"
                onClick={() => { setAddSongsTo(menu.id as number); setMenu(null) }}
              >{t('playlist.addSongs')}</div>
              <div
                className="context-menu-item"
                onClick={() => {
                  const meta = favLists.find((p) => p.id === menu.id)
                  if (meta) { setEditTarget({ id: meta.id, name: meta.name }); setEditName(meta.name) }
                  setMenu(null)
                }}
              >{t('playlist.rename')}</div>
              <div
                className="context-menu-item"
                onClick={() => {
                  if (menu.id !== 'favorites') deletePlaylist(menu.id as number)
                  addToast(t('playlist.deleted'), 'info')
                  setMenu(null)
                }}
              >{t('playlist.delete')}</div>
            </>
          )}
        </div>
      )}

      {addSongsTo !== null && (
        <AddSongsModal
          targetId={addSongsTo}
          targetTracks={playlist}
          onClose={() => setAddSongsTo(null)}
        />
      )}

      {editTarget && (
        <Modal onClose={() => setEditTarget(null)} width={340}>
          <h3>{t('playlist.rename')}</h3>
          <div className="form-group">
            <input
              type="text"
              className="filter-select"
              value={editName}
              autoFocus
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { renamePlaylist(editTarget.id, editName.trim()); setEditTarget(null) } }}
            />
          </div>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setEditTarget(null)}>{t('common.cancel')}</button>
            <button
              className="btn btn-primary"
              onClick={() => { if (editName.trim()) renamePlaylist(editTarget.id, editName.trim()); setEditTarget(null) }}
            >{t('common.save')}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
