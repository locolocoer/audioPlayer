import { useEffect, useState, useMemo, useCallback } from 'react'
import { useMusicStore } from '../stores/musicStore'
import { usePlayerStore } from '../stores/playerStore'
import { usePlaylistStore } from '../stores/playlistStore'
import MusicList from '../components/MusicList'
import type { MusicFile } from '../../main/types'

type SortField = 'title' | 'artist' | 'album' | 'duration' | 'playCount' | 'lastPlayed'
type SortDir = 'asc' | 'desc'
type ViewMode = 'songs' | 'albums' | 'artists' | 'folders'

function splitPath(p: string): string[] {
  return p.split(/[\\/]+/).filter(Boolean)
}

const SORT_OPTIONS: { value: string; label: string; field: SortField; dir: SortDir }[] = [
  { value: 'title', label: '歌名 ↑', field: 'title', dir: 'asc' },
  { value: 'title_desc', label: '歌名 ↓', field: 'title', dir: 'desc' },
  { value: 'artist', label: '歌手', field: 'artist', dir: 'asc' },
  { value: 'album', label: '专辑', field: 'album', dir: 'asc' },
  { value: 'duration', label: '时长', field: 'duration', dir: 'asc' },
  { value: 'playCount', label: '播放次数', field: 'playCount', dir: 'desc' },
  { value: 'lastPlayed', label: '最近播放', field: 'lastPlayed', dir: 'desc' }
]

const albumCoverCache = new Map<string, string>()

function AlbumCover({ album, tracks }: { album: string; tracks: MusicFile[] }): JSX.Element {
  const [coverUrl, setCoverUrl] = useState('')
  useEffect(() => {
    const first = tracks[0]
    if (!first) return
    const cached = albumCoverCache.get(album)
    if (cached) {
      setCoverUrl(cached)
      return
    }
    window.api.player.getCover(first.webdavId, first.path).then((r) => {
      if (r.data && r.data.length > 0) {
        const blob = new Blob([new Uint8Array(r.data)], { type: r.format || 'image/jpeg' })
        const url = URL.createObjectURL(blob)
        albumCoverCache.set(album, url)
        setCoverUrl(url)
      }
    }).catch(() => {})
  }, [album, tracks])
  if (coverUrl) return <img className="album-cover" src={coverUrl} alt="" loading="lazy" />
  return (
    <div className="album-cover-placeholder">
      <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
      </svg>
    </div>
  )
}

export default function LibraryPage(): JSX.Element {
  const { tracks, loadTracks, configs, loadConfigs } = useMusicStore()
  const { requestPlay, setQueue } = usePlayerStore()
  const addTracks = usePlaylistStore((s) => s.addTracks)
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>(() => {
    const saved = localStorage.getItem('library_sortField') as SortField | null
    return saved && ['title', 'artist', 'album', 'duration', 'playCount', 'lastPlayed'].includes(saved) ? saved : 'title'
  })
  const [sortDir, setSortDir] = useState<SortDir>(() => (localStorage.getItem('library_sortDir') === 'desc' ? 'desc' : 'asc'))
  const [filterConfig, setFilterConfig] = useState<string>(() => localStorage.getItem('library_filterConfig') || '')
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('library_viewMode') as ViewMode | null
    return saved === 'albums' || saved === 'artists' || saved === 'folders' ? saved : 'songs'
  })
  const [browseAlbum, setBrowseAlbum] = useState<string | null>(null)
  const [browseArtist, setBrowseArtist] = useState<string | null>(null)
  const [browseFolder, setBrowseFolder] = useState<string | null>(null)
  const [artistMenu, setArtistMenu] = useState<{ x: number; y: number; name: string } | null>(null)
  const [editArtistName, setEditArtistName] = useState<string | null>(null)
  const [editArtistInput, setEditArtistInput] = useState('')

  useEffect(() => {
    loadConfigs()
    loadTracks()
  }, [loadConfigs, loadTracks])

  useEffect(() => {
    localStorage.setItem('library_viewMode', viewMode)
  }, [viewMode])
  useEffect(() => {
    localStorage.setItem('library_sortField', sortField)
  }, [sortField])
  useEffect(() => {
    localStorage.setItem('library_sortDir', sortDir)
  }, [sortDir])
  useEffect(() => {
    localStorage.setItem('library_filterConfig', filterConfig)
  }, [filterConfig])

  useEffect(() => {
    if (!artistMenu) return
    const handler = (): void => setArtistMenu(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [artistMenu])

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }, [sortField, sortDir])

  const baseTracks = useMemo(() => {
    if (browseAlbum) return tracks.filter((t) => (t.album || '未知专辑') === browseAlbum)
    if (browseArtist) return tracks.filter((t) => (t.artist || '未知歌手') === browseArtist)
    return tracks
  }, [tracks, browseAlbum, browseArtist])

  const filtered = useMemo(() => {
    let result = baseTracks
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
  }, [baseTracks, search, filterConfig, sortField, sortDir])

  const albums = useMemo(() => {
    const map = new Map<string, { name: string; artist: string; tracks: MusicFile[] }>()
    for (const t of tracks) {
      const key = t.album || '未知专辑'
      const entry = map.get(key) || { name: key, artist: t.artist || '', tracks: [] }
      entry.tracks.push(t)
      map.set(key, entry)
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  }, [tracks])

  const artists = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>()
    for (const t of tracks) {
      const key = t.artist || '未知歌手'
      const entry = map.get(key) || { name: key, count: 0 }
      entry.count++
      map.set(key, entry)
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  }, [tracks])

  const folderData = useMemo(() => {
    const subdirs = new Map<string, { label: string; key: string; count: number }>()
    const files: MusicFile[] = []
    const root = browseFolder || ''
    for (const t of tracks) {
      const segs = splitPath(t.path)
      if (segs.length === 0) continue
      segs.pop()
      const dirKey = segs.join('/')
      if (dirKey === root) {
        files.push(t)
      } else if (root === '' || dirKey.startsWith(root + '/')) {
        const rest = root === '' ? dirKey : dirKey.slice(root.length + 1)
        const child = rest.split('/')[0]
        if (child) {
          const childKey = root === '' ? child : root + '/' + child
          const existing = subdirs.get(childKey)
          if (existing) existing.count++
          else subdirs.set(childKey, { label: child, key: childKey, count: 1 })
        }
      }
    }
    return {
      subdirs: Array.from(subdirs.values()).sort((a, b) => a.label.localeCompare(b.label, 'zh')),
      files
    }
  }, [tracks, browseFolder])

  const handleRowClick = useCallback((track: typeof tracks[0]) => {
    setQueue(filtered)
    requestPlay(track)
  }, [filtered, requestPlay, setQueue])

  const sortKey = SORT_OPTIONS.find((o) => o.field === sortField && o.dir === sortDir)?.value || 'title'

  const backToBrowse = useCallback(() => {
    setBrowseAlbum(null)
    setBrowseArtist(null)
    setBrowseFolder(null)
  }, [])

  const browsing = !!browseAlbum || !!browseArtist || !!browseFolder
  const parentFolder = browseFolder ? browseFolder.slice(0, browseFolder.lastIndexOf('/')) : null

  const handleRenameArtist = async (): Promise<void> => {
    const oldName = editArtistName
    const newName = editArtistInput.trim()
    setEditArtistName(null)
    setArtistMenu(null)
    if (oldName === null || !newName || newName === oldName) return
    const targets = tracks
      .filter((t) => (oldName === '未知歌手' ? !t.artist : t.artist === oldName))
      .map((t) => t.id)
    if (targets.length > 0) {
      await useMusicStore.getState().updateMetaBatch(targets, { artist: newName })
    }
  }

  return (
    <div className="page library-page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header">
        <h2>
          {browsing ? (
            <span className="browse-back" onClick={backToBrowse}>‹ {browseAlbum || browseArtist || browseFolder}</span>
          ) : (
            '音乐库'
          )}
        </h2>
        <div className="library-controls">
          <button
            className="btn btn-secondary add-all-btn"
            style={{ visibility: (search || filterConfig) && filtered.length > 0 ? 'visible' : 'hidden' }}
            onClick={() => addTracks(filtered)}
            title="将当前筛选结果添加到播放列表"
          >
            + 全部添加
          </button>
          <div className="browse-tabs">
            <button className={`browse-tab${viewMode === 'songs' ? ' active' : ''}`} onClick={() => { setViewMode('songs'); backToBrowse() }}>歌曲</button>
            <button className={`browse-tab${viewMode === 'albums' ? ' active' : ''}`} onClick={() => { setViewMode('albums'); backToBrowse() }}>专辑</button>
            <button className={`browse-tab${viewMode === 'artists' ? ' active' : ''}`} onClick={() => { setViewMode('artists'); backToBrowse() }}>歌手</button>
            <button className={`browse-tab${viewMode === 'folders' ? ' active' : ''}`} onClick={() => { setViewMode('folders'); backToBrowse() }}>文件夹</button>
          </div>
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
          <select value={sortKey} onChange={(e) => {
            const opt = SORT_OPTIONS.find((o) => o.value === e.target.value)
            if (opt) {
              setSortField(opt.field)
              setSortDir(opt.dir)
            }
          }} className="filter-select">
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {viewMode === 'folders' ? (
        <div className="folder-view">
          {browseFolder && (
            <div className="folder-path" onClick={() => setBrowseFolder(parentFolder)}>
              <span className="folder-back-arrow">‹</span> {browseFolder}
            </div>
          )}
          {folderData.subdirs.length > 0 && (
            <div className="folder-subdirs">
              {folderData.subdirs.map((d) => (
                <div key={d.key} className="folder-row" onClick={() => { setBrowseFolder(d.key); setSearch('') }}>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
                  </svg>
                  <span className="folder-name">{d.label}</span>
                  <span className="album-meta">{d.count} 首</span>
                </div>
              ))}
            </div>
          )}
          {folderData.files.length > 0 ? (
            <MusicList
              tracks={folderData.files}
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
              onRowClick={handleRowClick}
            />
          ) : folderData.subdirs.length === 0 ? (
            <div className="empty-state"><p>空文件夹</p></div>
          ) : null}
        </div>
      ) : viewMode === 'songs' || browsing ? (
        <MusicList
          tracks={filtered}
          sortField={sortField}
          sortDir={sortDir}
          onSort={handleSort}
          onRowClick={handleRowClick}
        />
      ) : viewMode === 'albums' ? (
        <div className="browse-scroll">
          <div className="album-grid">
            {albums.map((a) => (
              <div key={a.name} className="album-card" onClick={() => { setBrowseAlbum(a.name); setSearch('') }}>
                <AlbumCover album={a.name} tracks={a.tracks} />
                <div className="album-card-info">
                  <span className="album-name">{a.name}</span>
                  <span className="album-meta">{a.tracks.length} 首{a.artist ? ` · ${a.artist}` : ''}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="browse-scroll">
          <div className="artist-list">
            {artists.map((ar) => (
              <div
                key={ar.name}
                className="artist-row"
                onClick={() => { setBrowseArtist(ar.name); setSearch('') }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setArtistMenu({ x: e.clientX, y: e.clientY, name: ar.name })
                }}
              >
                <div className="artist-avatar">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                  </svg>
                </div>
                <span className="artist-name">{ar.name}</span>
                <span className="album-meta">{ar.count} 首</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {artistMenu && (
        <div
          className="context-menu"
          style={{ left: artistMenu.x, top: artistMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="context-menu-item"
            onClick={() => {
              setEditArtistName(artistMenu.name)
              setEditArtistInput(artistMenu.name === '未知歌手' ? '' : artistMenu.name)
              setArtistMenu(null)
            }}
          >
            修改歌手名
          </div>
        </div>
      )}

      {editArtistName !== null && (
        <div className="modal-overlay" onClick={() => setEditArtistName(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 360 }}>
            <h3>修改歌手名</h3>
            <div className="form-group">
              <label>将「{editArtistName}」下所有歌曲的歌手改为</label>
              <input
                type="text"
                value={editArtistInput}
                onChange={(e) => setEditArtistInput(e.target.value)}
                placeholder="新歌手名"
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setEditArtistName(null)}>取消</button>
              <button className="btn btn-primary" onClick={handleRenameArtist}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
