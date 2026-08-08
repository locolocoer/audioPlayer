import { useState, useRef, useEffect } from 'react'
import type { MusicFile } from '../../main/types'
import { usePlayerStore } from '../stores/playerStore'
import { useMusicStore } from '../stores/musicStore'

interface MusicListProps {
  tracks: MusicFile[]
  sortField: 'title' | 'artist' | 'album' | 'duration'
  sortDir: 'asc' | 'desc'
  onSort: (field: 'title' | 'artist' | 'album' | 'duration') => void
  onRowClick: (track: MusicFile) => void
  showFavorite?: boolean
}

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
  const [title, setTitle] = useState(track.title || track.filename)
  const [artist, setArtist] = useState(track.artist || '')
  const [album, setAlbum] = useState(track.album || '')
  const [sources, setSources] = useState<MusicFile[]>([])
  const [activeTrack, setActiveTrack] = useState<MusicFile>(track)
  const updateMeta = useMusicStore((s) => s.updateMeta)

  useEffect(() => {
    window.api.music.alternatives(track.title, track.webdavId).then((list) => {
      setSources(list)
      const prefId = Number(localStorage.getItem(`source_pref:${track.title}`))
      const preferred = prefId ? list.find((s) => s.id === prefId) : undefined
      setActiveTrack(preferred || list.find((s) => s.id === track.id) || track)
    }).catch(() => {})
  }, [track.title, track.webdavId, track.id])

  const handleSave = () => {
    updateMeta(track.id, { title, artist, album })
    if (activeTrack.id !== track.id) {
      localStorage.setItem(`source_pref:${track.title}`, String(activeTrack.id))
    }
    onClose()
  }

  const switchSource = (id: number) => {
    const source = sources.find((s) => s.id === id)
    if (source) {
      setActiveTrack(source)
    }
  }

  const dirPath = activeTrack.path.substring(0, activeTrack.path.lastIndexOf('/')) || '/'
  const fmt = (f: string) => f.slice(f.lastIndexOf('.') + 1).toUpperCase()

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 480 }}>
        <h3>歌曲详情</h3>
        <div className="song-detail-info">
          <div className="detail-row">
            <span className="detail-label">文件名</span>
            <span className="detail-value" style={{ fontSize: 12 }}>{activeTrack.filename}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">存储位置</span>
            <span className="detail-value detail-path">{dirPath}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">时长</span>
            <span className="detail-value">{formatDuration(activeTrack.duration)}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">大小</span>
            <span className="detail-value">{(activeTrack.size / 1024 / 1024).toFixed(1)} MB</span>
          </div>
        </div>
        {sources.length > 1 && (
          <div className="form-group">
            <label>音乐源 ({sources.length} 个可用)</label>
            <select value={activeTrack.id} onChange={(e) => switchSource(Number(e.target.value))}>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {fmt(s.filename)} — {s.filename}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="form-group" style={{ marginTop: 8 }}>
          <label>歌曲名</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="输入歌曲名" />
        </div>
        <div className="form-group">
          <label>歌手</label>
          <input type="text" value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="输入歌手名" />
        </div>
        <div className="form-group">
          <label>专辑</label>
          <input type="text" value={album} onChange={(e) => setAlbum(e.target.value)} placeholder="输入专辑名" />
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>关闭</button>
          <button className="btn btn-primary" onClick={handleSave}>保存</button>
        </div>
      </div>
    </div>
  )
}

function ContextMenu({ x, y, track, onClose, onEdit }: {
  x: number; y: number; track: MusicFile; onClose: () => void; onEdit: () => void
}): JSX.Element {
  const toggleFavorite = useMusicStore((s) => s.toggleFavorite)
  const isFav = track.favorite === 1

  useEffect(() => {
    const handler = () => onClose()
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [onClose])

  return (
    <div className="context-menu" style={{ left: x, top: y }} onClick={(e) => e.stopPropagation()}>
      <div className="context-menu-item" onClick={onEdit}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
        查看详情
      </div>
      <div className="context-menu-item" onClick={() => { toggleFavorite(track.id); onClose() }}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
          <path d={isFav ? "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" : "M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z"}/>
        </svg>
        {isFav ? '取消收藏' : '添加到收藏'}
      </div>
    </div>
  )
}

export default function MusicList({ tracks, sortField, sortDir, onSort, onRowClick, showFavorite }: MusicListProps): JSX.Element {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const toggleFavorite = useMusicStore((s) => s.toggleFavorite)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; track: MusicFile } | null>(null)
  const [editTrack, setEditTrack] = useState<MusicFile | null>(null)
  const tableRef = useRef<HTMLDivElement>(null)

  if (tracks.length === 0) {
    return (
      <div className="empty-state">
        <p>未发现音乐文件。请配置音乐源并运行扫描。</p>
      </div>
    )
  }

  return (
    <>
      <div className="music-table-container" ref={tableRef}>
        <table className="music-table">
          <thead>
            <tr>
              {showFavorite && <th style={{ width: 36 }} />}
              <th className="col-index">#</th>
              <th onClick={() => onSort('title')}>
                歌名 <SortArrow field="title" current={sortField} dir={sortDir} />
              </th>
              <th onClick={() => onSort('artist')}>
                歌手 <SortArrow field="artist" current={sortField} dir={sortDir} />
              </th>
              <th onClick={() => onSort('album')}>
                专辑 <SortArrow field="album" current={sortField} dir={sortDir} />
              </th>
              <th onClick={() => onSort('duration')} style={{ width: '100px' }}>
                时长 <SortArrow field="duration" current={sortField} dir={sortDir} />
              </th>
            </tr>
          </thead>
          <tbody>
            {tracks.map((track, idx) => (
              <tr
                key={track.id}
                className={currentTrack?.id === track.id ? 'playing' : ''}
                onClick={() => onRowClick(track)}
                onDoubleClick={() => onRowClick(track)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setContextMenu({ x: e.clientX, y: e.clientY, track })
                }}
              >
                {showFavorite && (
                  <td style={{ padding: 0, textAlign: 'center' }}>
                    <button
                      className="btn-icon"
                      style={{ width: 28, height: 28, color: track.favorite ? '#e94560' : undefined }}
                      onClick={(e) => { e.stopPropagation(); toggleFavorite(track.id) }}
                      title={track.favorite ? '取消收藏' : '收藏'}
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                        <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                      </svg>
                    </button>
                  </td>
                )}
                <td className="col-index">{idx + 1}</td>
                <td className="col-title">{track.title || track.filename}</td>
                <td className="col-artist">{track.artist || '未知'}</td>
                <td className="col-album">{track.album || '未知'}</td>
                <td className="col-duration">{formatDuration(track.duration)}</td>
              </tr>
            ))}
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
