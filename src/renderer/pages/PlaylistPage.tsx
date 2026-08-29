import { useEffect, useState, useMemo, useCallback } from 'react'
import { usePlaylistStore } from '../stores/playlistStore'
import { usePlayerStore } from '../stores/playerStore'
import { useMusicStore } from '../stores/musicStore'
import { useToastStore } from '../stores/toastStore'
import MusicList from '../components/MusicList'
import AddSongsModal from '../components/AddSongsModal'
import { getCoverCached, setCoverCached, coverCacheKey } from '../utils/coverCache'
import { useT } from '../i18n'
import type { MusicFile } from '../../main/types'

type SortField = 'order' | 'title' | 'artist' | 'album' | 'duration' | 'playCount' | 'lastPlayed'
type SortDir = 'asc' | 'desc'
type ViewMode = 'list' | 'square'

function parseTrackIds(trackIds: string): number[] {
  try {
    const parsed = JSON.parse(trackIds)
    return Array.isArray(parsed) ? parsed.map((n: unknown) => Number(n)).filter((n: number) => Number.isFinite(n)) : []
  } catch {
    return []
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 歌单广场卡片封面：显示歌单内第一首歌曲的封面
function SquareCover({ track }: { track: MusicFile | undefined }): JSX.Element {
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
        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
      </svg>
    </div>
  )
}

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
  const addTracks = usePlaylistStore((s) => s.addTracks)
  const removeTrack = usePlaylistStore((s) => s.removeTrack)
  const reorder = usePlaylistStore((s) => s.reorder)
  const reorderMany = usePlaylistStore((s) => s.reorderMany)
  const { requestPlay, setQueue } = usePlayerStore()
  const addToast = useToastStore((s) => s.addToast)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('order')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [addSongsOpen, setAddSongsOpen] = useState(false)

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

  // 导出当前歌单为 JSON
  const handleExport = useCallback(async (): Promise<void> => {
    if (activeId === null) return
    const meta = playlists.find((p) => p.id === activeId)
    if (!meta) return
    const r = await window.api.playlist.export(meta, playlist)
    if (r.ok && r.path) {
      addToast(t('playlist.exported', { path: r.path }), 'success')
    } else if (r.error !== 'canceled') {
      addToast(t('playlist.exportFailed'), 'error')
    }
  }, [activeId, playlists, playlist, addToast, t])

  // 导入 JSON 歌单：解析后按 标题+歌手 在曲库中匹配歌曲
  const handleImport = useCallback(async (): Promise<void> => {
    const r = await window.api.playlist.import()
    if (!r.ok) {
      if (r.error !== 'canceled') {
        addToast(r.error === 'invalid' ? t('playlist.invalidFile') : t('playlist.importFailed', { msg: r.error || '' }), 'error')
      }
      return
    }
    const allTracks = useMusicStore.getState().tracks
    const matched: MusicFile[] = []
    for (const item of r.tracks || []) {
      const found = allTracks.find((tr) =>
        tr.title.toLowerCase() === item.title.toLowerCase() &&
        (!item.artist || tr.artist === item.artist)
      )
      if (found && !matched.some((m) => m.id === found.id)) matched.push(found)
    }
    await createPlaylist(r.name || t('playlist.newDefaultName'))
    addTracks(matched)
    setViewMode('list')
    addToast(t('playlist.importDone', { name: r.name || '', matched: matched.length, total: (r.tracks || []).length }), 'success')
  }, [createPlaylist, addTracks, addToast, t])

  const openSquarePlaylist = useCallback(async (id: number): Promise<void> => {
    await selectPlaylist(id)
    setViewMode('list')
  }, [selectPlaylist])

  const playSquarePlaylist = useCallback(async (id: number): Promise<void> => {
    await selectPlaylist(id)
    const tracks = usePlaylistStore.getState().playlist
    if (tracks.length > 0) {
      usePlayerStore.getState().setPlayMode('sequential')
      usePlayerStore.getState().playSelection(tracks)
    }
    setViewMode('list')
  }, [selectPlaylist])

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header">
        <h2>{t('nav.playlist')}</h2>
        <div className="library-controls">
          <div className="playlist-switcher">
            <button className={`browse-tab${viewMode === 'list' ? ' active' : ''}`} onClick={() => setViewMode('list')}>{t('playlist.myPlaylists')}</button>
            <button className={`browse-tab${viewMode === 'square' ? ' active' : ''}`} onClick={() => setViewMode('square')}>{t('playlist.square')}</button>
          </div>
          <button className="btn btn-sm" onClick={handleImport} title={t('playlist.importTitle')}>{t('playlist.import')}</button>
          {viewMode === 'list' && (
            <button className="btn btn-sm" onClick={handleExport} title={t('playlist.exportTitle')}>{t('playlist.export')}</button>
          )}
        </div>
      </div>

      {viewMode === 'square' ? (
        <div className="square-scroll">
          {playlists.length === 0 ? (
            <div className="empty-state"><p>{t('playlist.empty')}</p></div>
          ) : (
            <div className="square-grid">
              {playlists.map((p) => {
                const count = parseTrackIds(p.trackIds).length
                const firstId = parseTrackIds(p.trackIds)[0]
                const firstTrack = firstId !== undefined ? useMusicStore.getState().tracks.find((x) => x.id === firstId) : undefined
                return (
                  <div key={p.id} className="square-card" onClick={() => openSquarePlaylist(p.id)}>
                    <SquareCover track={firstTrack} />
                    <div className="square-card-name">{p.name}</div>
                    <div className="square-card-meta">
                      {t('playlist.songCount', { count })}
                      <span> · {formatDate(p.createdAt)}</span>
                    </div>
                    <div className="square-card-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-sm" onClick={() => playSquarePlaylist(p.id)}>{t('playlist.playAll')}</button>
                      <button className="btn btn-sm btn-secondary" onClick={() => deletePlaylist(p.id)}>{t('playlist.delete')}</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="page-header-sub">
            <div className="library-controls">
              <div className="playlist-switcher">
                {playlists.map((p) => (
                  <button key={p.id} className={`browse-tab${p.id === activeId ? ' active' : ''}`} onClick={() => selectPlaylist(p.id)}>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="library-controls playlist-toolbar">
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
            <input
              type="text"
              className="search-input"
              style={{ width: 160 }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('library.search')}
            />
            <button className="btn btn-secondary" onClick={() => { if (activeId !== null) deletePlaylist(activeId) }}>{t('playlist.delete')}</button>
            <button className="btn btn-secondary" onClick={clearPlaylist} title={t('playlist.clearTitle')}>{t('playlist.clear')}</button>
            <button className="btn btn-primary" onClick={() => setAddSongsOpen(true)} title={t('playlist.addSongsTitle')}>{t('playlist.addSongs')}</button>
          </div>
          <MusicList
            tracks={filtered}
            sortField={sortField}
            sortDir={sortDir}
            onSort={handleSort}
            onRowClick={handleRowClick}
            onReorder={sortField === 'order' ? wrapReorder : undefined}
            onReorderMany={sortField === 'order' ? wrapReorderMany : undefined}
            onRemoveFromPlaylist={(track) => removeTrack(track.id)}
          />
          <div className="playlist-status">
            {t('playlist.songCount', { count: playlist.length })}
          </div>
        </>
      )}

      {addSongsOpen && <AddSongsModal onClose={() => setAddSongsOpen(false)} />}
    </div>
  )
}
