import { useCallback, useState, useEffect, useRef } from 'react'
import { usePlayerStore } from '../stores/playerStore'

function formatTime(secs: number): string {
  if (!secs || !isFinite(secs)) return '0:00'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const coverCache = new Map<string, string>()

function BarCover({ track }: { track: { webdavId: string; path: string } }): JSX.Element {
  const [coverUrl, setCoverUrl] = useState('')
  const loadingRef = useRef(false)

  useEffect(() => {
    setCoverUrl('')
    loadingRef.current = false
  }, [track.webdavId, track.path])

  useEffect(() => {
    if (loadingRef.current) return
    loadingRef.current = true
    const key = `${track.webdavId}:${track.path}`
    const cached = coverCache.get(key)
    if (cached) {
      setCoverUrl(cached)
      return
    }
    window.api.player.getCover(track.webdavId, track.path).then((r) => {
      if (r.data && r.data.length > 0) {
        const blob = new Blob([new Uint8Array(r.data)], { type: r.format || 'image/jpeg' })
        const url = URL.createObjectURL(blob)
        if (coverCache.size >= 5) {
          const first = coverCache.keys().next().value
          const old = coverCache.get(first)
          if (old) URL.revokeObjectURL(old)
          coverCache.delete(first)
        }
        coverCache.set(key, url)
        setCoverUrl(url)
      }
    }).catch(() => {})
  }, [track.webdavId, track.path])

  if (coverUrl) return <img src={coverUrl} alt="" />
  return (
    <div className="artwork-placeholder-small">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
      </svg>
    </div>
  )
}

export default function PlayerBar(): JSX.Element {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const isLoading = usePlayerStore((s) => s.isLoading)
  const loadError = usePlayerStore((s) => s.loadError)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const volume = usePlayerStore((s) => s.volume)
  const playMode = usePlayerStore((s) => s.playMode)

  const handleTogglePlay = useCallback(() => {
    const store = usePlayerStore.getState()
    if (store.isPlaying) store.pause()
    else store.resume()
  }, [])

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    usePlayerStore.getState().setVolume(parseFloat(e.target.value))
  }, [])

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const bar = e.currentTarget
    const rect = bar.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    const store = usePlayerStore.getState()
    if (store.duration) {
      store.seek(Math.max(0, Math.min(store.duration, pct * store.duration)))
    }
  }, [])

  if (!currentTrack) return <div />

  return (
    <div className="player-bar">
      <div className="player-bar-track">
        <div className="track-artwork">
          <BarCover track={currentTrack} />
        </div>
        <div className="track-info">
          <span className="track-title">{currentTrack.title || currentTrack.filename}</span>
          <span className="track-artist">
            {isLoading ? '加载中...' : loadError ? `错误: ${loadError}` : (currentTrack.artist || '未知歌手')}
          </span>
        </div>
      </div>

      <div className="player-bar-center">
        <div className="control-buttons">
          <button className="btn-icon" onClick={() => usePlayerStore.getState().togglePlayMode()} title={playMode === 'sequential' ? '顺序播放' : playMode === 'shuffle' ? '随机播放' : '单曲循环'}>
            {playMode === 'sequential' ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M4 6h2v12H4V6zm14 0l-8 6 8 6V6z"/></svg>
            ) : playMode === 'shuffle' ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
            )}
          </button>
          <button className="btn-icon" onClick={() => usePlayerStore.getState().prev()} disabled={isLoading}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
          </button>
          <button className="btn-icon btn-play" onClick={handleTogglePlay} disabled={isLoading}>
            {isLoading ? (
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/></svg>
            ) : isPlaying ? (
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            )}
          </button>
          <button className="btn-icon" onClick={() => usePlayerStore.getState().next()} disabled={isLoading}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
          </button>
        </div>
        <div className="progress-area">
          <span className="time">{formatTime(currentTime)}</span>
          <div className="progress-bar" onClick={handleProgressClick}>
            <div className="progress-fill" style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }} />
          </div>
          <span className="time">{formatTime(duration)}</span>
        </div>
      </div>

      <div className="player-bar-end">
        <div className="volume-control">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            {volume === 0 ? (
              <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
            ) : (
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
            )}
          </svg>
          <input type="range" min="0" max="1" step="0.05" value={volume} onChange={handleVolumeChange} />
        </div>
      </div>
    </div>
  )
}
