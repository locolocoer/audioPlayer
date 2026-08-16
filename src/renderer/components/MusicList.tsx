import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import Modal from './Modal'
import type { MusicFile } from '../../main/types'
import { usePlayerStore } from '../stores/playerStore'
import { useMusicStore } from '../stores/musicStore'
import { usePlaylistStore } from '../stores/playlistStore'
import { useT } from '../i18n'

interface MusicListProps {
  tracks: MusicFile[]
  sortField: 'title' | 'artist' | 'album' | 'duration' | 'playCount' | 'lastPlayed' | 'rating' | 'order'
  sortDir: 'asc' | 'desc'
  onSort: (field: 'title' | 'artist' | 'album' | 'duration' | 'playCount' | 'lastPlayed') => void
  onRowClick: (track: MusicFile) => void
  showFavorite?: boolean
  onReorder?: (from: number, to: number) => void
}

const OVERSCAN = 10

function formatDuration(secs: number): string {
  if (!secs) return '--:--'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function SortArrow({ field, current, dir }: { field: string; current: string; dir: string }): JSX.Element {
  if (field !== current) return <span className="sort-arrow">⇅</span>
  return <span className="sort-arrow active">{dir === 'asc' ? '↑' : '↓'}</span>
}

function EditModal({ track, onClose }: { track: MusicFile; onClose: () => void }): JSX.Element {
  const t = useT()
  const [title, setTitle] = useState(track.title || track.filename)
  const [artist, setArtist] = useState(track.artist || '')
  const [album, setAlbum] = useState(track.album || '')
  const [sources, setSources] = useState<MusicFile[]>([])
  const [activeTrack, setActiveTrack] = useState<MusicFile>(track)
  const updateMeta = useMusicStore((s) => s.updateMeta)
  const switchTrackSource = useMusicStore((s) => s.switchTrackSource)
  const configs = useMusicStore((s) => s.configs)

  useEffect(() => {
    window.api.music.alternatives(track.title, track.webdavId).then((list) => {
      setSources(list)
      setActiveTrack(list.find((s) => s.id === track.id) || track)
    }).catch(() => {})
  }, [track.title, track.webdavId, track.id])

  const sourceName = (id: string): string => {
    const c = configs.find((x) => x.id === id)
    if (c) return c.name || c.url
    return id === track.webdavId ? t('track.currentSource') : id
  }

  const baseMeta = (): { title: string; artist: string; album: string } => ({
    title: activeTrack.title || activeTrack.filename,
    artist: activeTrack.artist || '',
    album: activeTrack.album || ''
  })

  const metaChanged = (): boolean => {
    const base = baseMeta()
    return title !== base.title || artist !== base.artist || album !== base.album
  }

  const handleSave = async () => {
    const meta = { title, artist, album }
    const sourceChanged = activeTrack.id !== track.id
    if (sourceChanged) {
      if (metaChanged()) {
        await updateMeta(activeTrack.id, meta)
        await switchTrackSource(track.id, { ...activeTrack, ...meta })
      } else {
        await switchTrackSource(track.id, { ...activeTrack })
      }
    } else if (metaChanged()) {
      await updateMeta(track.id, meta)
    }
    onClose()
  }

  const switchSource = (id: number) => {
    const source = sources.find((s) => s.id === id)
    if (!source) return
    setActiveTrack(source)
    setTitle(source.title || source.filename)
    setArtist(source.artist || '')
    setAlbum(source.album || '')
  }

  const sep = activeTrack.path.includes('\\') ? '\\' : '/'
  const dirPath = activeTrack.path.substring(0, activeTrack.path.lastIndexOf(sep)) || activeTrack.path
  const fmt = (f: string) => f.slice(f.lastIndexOf('.') + 1).toUpperCase()

  return (
    <Modal onClose={onClose} width={480}>
        <h3>{t('track.detail')}</h3>
        <div className="song-detail-info">
          <div className="detail-row">
            <span className="detail-label">{t('track.filename')}</span>
            <span className="detail-value" style={{ fontSize: 12 }}>{activeTrack.filename}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">{t('track.location')}</span>
            <span className="detail-value detail-path">{dirPath}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">{t('track.duration')}</span>
            <span className="detail-value">{formatDuration(activeTrack.duration)}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">{t('track.size')}</span>
            <span className="detail-value">{(activeTrack.size / 1024 / 1024).toFixed(1)} MB</span>
          </div>
        </div>
        {sources.length > 1 && (
          <div className="form-group">
            <label>{t('track.sources', { n: sources.length })}</label>
            <select value={activeTrack.id} onChange={(e) => switchSource(Number(e.target.value))}>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {sourceName(s.webdavId)} · {fmt(s.filename)} — {s.filename}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="form-group" style={{ marginTop: 8 }}>
          <label>{t('track.title')}</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('track.titlePlaceholder')} />
        </div>
        <div className="form-group">
          <label>{t('track.artist')}</label>
          <input type="text" value={artist} onChange={(e) => setArtist(e.target.value)} placeholder={t('track.artistPlaceholder')} />
        </div>
        <div className="form-group">
          <label>{t('track.album')}</label>
          <input type="text" value={album} onChange={(e) => setAlbum(e.target.value)} placeholder={t('track.albumPlaceholder')} />
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>{t('common.close')}</button>
          <button className="btn btn-primary" onClick={handleSave}>{t('common.save')}</button>
        </div>
    </Modal>
  )
}

function ContextMenu({ x, y, track, onClose, onEdit }: {
  x: number; y: number; track: MusicFile; onClose: () => void; onEdit: () => void
}): JSX.Element {
  const t = useT()
  const toggleFavorite = useMusicStore((s) => s.toggleFavorite)
  const configs = useMusicStore((s) => s.configs)
  const isLocal = configs.find((c) => c.id === track.webdavId)?.sourceType === 'local'
  const isFav = track.favorite === 1
  const playlist = usePlaylistStore((s) => s.playlist)
  const addTrack = usePlaylistStore((s) => s.addTrack)
  const removeTrack = usePlaylistStore((s) => s.removeTrack)
  const inPlaylist = playlist.some((t) => t.id === track.id)

  useEffect(() => {
    const handler = () => onClose()
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [onClose])

  return (
    <div className="context-menu" style={{ left: x, top: y }} onClick={(e) => e.stopPropagation()}>
      <div className="context-menu-item" onClick={onEdit}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
        {t('ctx.detail')}
      </div>
      {isLocal && (
        <div className="context-menu-item" onClick={() => { window.api.shell.showItemInFolder(track.path); onClose() }}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
          {t('ctx.openLocation')}
        </div>
      )}
      <div className="context-menu-item" onClick={() => { toggleFavorite(track.id); onClose() }}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
          <path d={isFav ? "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" : "M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z"}/>
        </svg>
        {isFav ? t('player.unfavorite') : t('ctx.favorite')}
      </div>
      <div className="context-menu-item" onClick={() => { inPlaylist ? removeTrack(track.id) : addTrack(track); onClose() }}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
          {inPlaylist ? (
            <path d="M6 19h12v2H6v-2z"/>
          ) : (
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
          )}
        </svg>
        {inPlaylist ? t('ctx.removeFromPlaylist') : t('ctx.addToPlaylist')}
      </div>
    </div>
  )
}

export default function MusicList({ tracks, sortField, sortDir, onSort, onRowClick, showFavorite, onReorder }: MusicListProps): JSX.Element {
  const t = useT()
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const toggleFavorite = useMusicStore((s) => s.toggleFavorite)
  const addTracks = usePlaylistStore((s) => s.addTracks)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; track: MusicFile } | null>(null)
  const [editTrack, setEditTrack] = useState<MusicFile | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const tableRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLTableRowElement | null>(null)
  const dragIndexRef = useRef<number>(-1)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(0)
  const [rowHeight, setRowHeight] = useState(36)

  useLayoutEffect(() => {
    const container = tableRef.current
    if (!container) return
    const update = () => setViewportH(container.clientHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(container)
    return () => ro.disconnect()
  }, [tracks.length > 0])

  useEffect(() => {
    const container = tableRef.current
    if (!container) return
    const maxScroll = Math.max(0, tracks.length * rowHeight - container.clientHeight)
    if (container.scrollTop > maxScroll) container.scrollTop = maxScroll
  }, [tracks.length, rowHeight])

  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN)
  const end = Math.min(tracks.length, Math.ceil((scrollTop + viewportH) / rowHeight) + OVERSCAN)
  const visible = tracks.slice(start, end)
  const topPad = start * rowHeight
  const bottomPad = Math.max(0, (tracks.length - end) * rowHeight)
  const colCount = (showFavorite ? 1 : 0) + (selectMode ? 1 : 0) + 5

  const toggleSelect = (id: number): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const exitSelectMode = (): void => {
    setSelectMode(false)
    setSelected(new Set())
  }

  const batchAddToPlaylist = (): void => {
    const sel = tracks.filter((t) => selected.has(t.id))
    if (sel.length > 0) addTracks(sel)
    exitSelectMode()
  }

  const batchFavorite = (): void => {
    const sel = tracks.filter((t) => selected.has(t.id))
    for (const t of sel) toggleFavorite(t.id)
    exitSelectMode()
  }

  const handleRowClick = (track: MusicFile): void => {
    if (selectMode) toggleSelect(track.id)
    else onRowClick(track)
  }

  const rowHeightCalibrated = useRef(false)

  useLayoutEffect(() => {
    if (rowHeightCalibrated.current) return
    const el = rowRef.current
    if (!el) return
    const h = el.offsetHeight
    if (h <= 0) return
    rowHeightCalibrated.current = true
    if (Math.abs(h - rowHeight) > 0.5) setRowHeight(h)
  })

  if (tracks.length === 0) {
    return (
      <div className="empty-state">
        <p>{t('list.empty')}</p>
      </div>
    )
  }

  return (
    <>
      {selectMode ? (
        <div className="list-select-bar">
          <span className="select-count">{t('list.selected', { n: selected.size })}</span>
          <button className="btn btn-secondary" onClick={batchAddToPlaylist}>{t('list.addToPlaylist')}</button>
          <button className="btn btn-secondary" onClick={batchFavorite}>{t('list.favorite')}</button>
          <button className="btn btn-secondary" onClick={exitSelectMode}>{t('common.cancel')}</button>
        </div>
      ) : (
        <div className="list-toolbar">
          <button className="btn btn-sm" onClick={() => setSelectMode(true)}>{t('list.multiSelect')}</button>
        </div>
      )}
      <div className="music-table-container" ref={tableRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
        <table className="music-table">
          <thead>
            <tr>
              {showFavorite && <th style={{ width: 36 }} />}
              {selectMode && <th style={{ width: 36 }} />}
              <th className="col-index">#</th>
              <th onClick={() => onSort('title')}>
                {t('list.title')} <SortArrow field="title" current={sortField} dir={sortDir} />
              </th>
              <th className="col-artist" onClick={() => onSort('artist')}>
                {t('list.artist')} <SortArrow field="artist" current={sortField} dir={sortDir} />
              </th>
              <th className="col-album" onClick={() => onSort('album')}>
                {t('list.album')} <SortArrow field="album" current={sortField} dir={sortDir} />
              </th>
              <th onClick={() => onSort('duration')} style={{ width: '100px' }}>
                {t('list.duration')} <SortArrow field="duration" current={sortField} dir={sortDir} />
              </th>
            </tr>
          </thead>
          <tbody>
            {topPad > 0 && (
              <tr key="top-spacer" className="virtual-spacer"><td colSpan={colCount} style={{ height: topPad, padding: 0, border: 'none' }} /></tr>
            )}
            {visible.map((track, i) => {
              const idx = start + i
              return (
                <tr
                  key={track.id}
                  ref={i === 0 ? rowRef : undefined}
                  className={currentTrack?.id === track.id ? 'playing' : ''}
                  draggable={!!onReorder}
                  onDragStart={(e) => {
                    if (!onReorder) return
                    dragIndexRef.current = idx
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', String(track.id))
                  }}
                  onDragOver={(e) => {
                    if (!onReorder) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    const from = dragIndexRef.current
                    dragIndexRef.current = -1
                    if (from >= 0 && from !== idx && onReorder) onReorder(from, idx)
                  }}
                  onClick={() => handleRowClick(track)}
                  onDoubleClick={() => { if (!selectMode) onRowClick(track) }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setContextMenu({ x: e.clientX, y: e.clientY, track })
                  }}
                >
                  {selectMode && (
                    <td style={{ padding: 0, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        className="row-check"
                        checked={selected.has(track.id)}
                        onChange={() => toggleSelect(track.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                  )}
                  {showFavorite && (
                    <td style={{ padding: 0, textAlign: 'center' }}>
                      <button
                        className="btn-icon"
                        style={{ width: 28, height: 28, color: track.favorite ? '#e94560' : undefined }}
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(track.id) }}
                        title={track.favorite ? t('player.unfavorite') : t('player.favorite')}
                      >
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                        </svg>
                      </button>
                    </td>
                  )}
                  <td className="col-index">{idx + 1}</td>
                  <td className="col-title">{track.title || track.filename}</td>
                  <td className="col-artist">{track.artist || t('common.unknown')}</td>
                  <td className="col-album">{track.album || t('common.unknown')}</td>
                  <td className="col-duration">{formatDuration(track.duration)}</td>
                </tr>
              )
            })}
            {bottomPad > 0 && (
              <tr key="bottom-spacer" className="virtual-spacer"><td colSpan={colCount} style={{ height: bottomPad, padding: 0, border: 'none' }} /></tr>
            )}
          </tbody>
        </table>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          track={contextMenu.track}
          onClose={() => setContextMenu(null)}
          onEdit={() => { setEditTrack(contextMenu.track); setContextMenu(null) }}
        />
      )}
      {editTrack && <EditModal track={editTrack} onClose={() => setEditTrack(null)} />}
    </>
  )
}
