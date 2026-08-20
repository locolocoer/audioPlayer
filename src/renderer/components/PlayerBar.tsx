import { useCallback, useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlayerStore } from '../stores/playerStore'
import { useMusicStore } from '../stores/musicStore'
import { useUiStore } from '../stores/uiStore'
import { useT } from '../i18n'
import { getCoverCached, setCoverCached, coverCacheKey } from '../utils/coverCache'

function formatTime(secs: number): string {
  if (!secs || !isFinite(secs)) return '0:00'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const RATES = [1, 1.25, 1.5, 2, 0.75, 0.5]

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
    const key = coverCacheKey(track)
    const cached = getCoverCached(key)
    if (cached) {
      setCoverUrl(cached)
      return
    }
    window.api.player.getCover(track.webdavId, track.path).then((r) => {
      if (r.data && r.data.length > 0) {
        const blob = new Blob([new Uint8Array(r.data)], { type: r.format || 'image/jpeg' })
        const url = URL.createObjectURL(blob)
        setCoverCached(key, url)
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
  const t = useT()
  const navigate = useNavigate()
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const isLoading = usePlayerStore((s) => s.isLoading)
  const loadError = usePlayerStore((s) => s.loadError)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const volume = usePlayerStore((s) => s.volume)
  const playbackRate = usePlayerStore((s) => s.playbackRate)
  const setPlaybackRate = usePlayerStore((s) => s.setPlaybackRate)
  const playMode = usePlayerStore((s) => s.playMode)
  const loopA = usePlayerStore((s) => s.loopA)
  const loopB = usePlayerStore((s) => s.loopB)
  const sleepUntil = usePlayerStore((s) => s.sleepUntil)
  const sleepAction = usePlayerStore((s) => s.sleepAction)
  const setSleepTimer = usePlayerStore((s) => s.setSleepTimer)
  const setSleepAction = usePlayerStore((s) => s.setSleepAction)
  const favorites = useMusicStore((s) => s.favorites)
  const loadFavorites = useMusicStore((s) => s.loadFavorites)
  const tracks = useMusicStore((s) => s.tracks)
  const toggleQueue = useUiStore((s) => s.toggleQueue)
  const [sleepOpen, setSleepOpen] = useState(false)
  const [lyricsOn, setLyricsOn] = useState(() => localStorage.getItem('desktop_lyrics') === '1')
  const [sleepNow, setSleepNow] = useState(() => Date.now())
  const [sleepCustom, setSleepCustom] = useState('')
  const [sleepActionPicker, setSleepActionPicker] = useState(false)
  const sleepMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      if (sleepMenuRef.current && !sleepMenuRef.current.contains(e.target as Node)) setSleepOpen(false)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  useEffect(() => {
    if (!sleepUntil) return
    setSleepNow(Date.now())
    const id = setInterval(() => setSleepNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [sleepUntil])

  const sleepRemaining = sleepUntil ? Math.max(0, Math.round((sleepUntil - sleepNow) / 1000)) : 0

  const commitSleepCustom = (): void => {
    if (!sleepCustom) return
    const m = Math.max(1, Math.min(720, Math.round(Number(sleepCustom) || 0)))
    setSleepTimer(m, sleepAction)
    setSleepCustom('')
    setSleepOpen(false)
  }

  useEffect(() => {
    if (lyricsOn) window.api.window.lyrics(true)
  }, [lyricsOn])

  useEffect(() => {
    loadFavorites()
  }, [loadFavorites])

  const toggleDesktopLyrics = (): void => {
    const next = !lyricsOn
    setLyricsOn(next)
    localStorage.setItem('desktop_lyrics', next ? '1' : '0')
    window.api.window.lyrics(next)
  }

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

  const handleToggleFavorite = useCallback(() => {
    const track = usePlayerStore.getState().currentTrack
    if (!track) return
    useMusicStore.getState().toggleFavorite(track.id)
  }, [])

  const isFav = currentTrack ? favorites.some((f) => f.id === currentTrack.id) : false
  const currentRating = currentTrack ? (tracks.find((t) => t.id === currentTrack.id)?.rating || 0) : 0

  if (!currentTrack) return <div />

  return (
    <div className="player-bar">
      <div className="player-bar-track">
        <div className="track-artwork" onClick={() => navigate('/player')} title={t('nav.playing')} role="button">
          <BarCover track={currentTrack} />
        </div>
        <div className="track-info">
          <span className="track-title">{currentTrack.title || currentTrack.filename}</span>
          <span className="track-artist">
            {isLoading ? t('common.loading') : loadError ? t('player.error', { msg: loadError }) : (currentTrack.artist || t('player.unknownArtist'))}
          </span>
          <span className="track-rating" style={{ display: 'inline-flex', gap: 2, fontSize: 13, cursor: 'pointer' }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n} onClick={(e) => { e.stopPropagation(); useMusicStore.getState().setRating(currentTrack.id, n) }} style={{ color: currentRating >= n ? '#f5a623' : 'rgba(128,128,128,0.4)' }} title={t('player.star', { n })}>
                ★
              </span>
            ))}
          </span>
        </div>
      </div>

      <div className="player-bar-center">
        <div className="control-buttons">
          <button className="btn-icon btn-rate" onClick={() => { const idx = RATES.indexOf(playbackRate); setPlaybackRate(RATES[idx >= 0 ? (idx + 1) % RATES.length : 0]) }} title={t('player.speed')} style={{ fontSize: 12, fontWeight: 600, minWidth: 40 }}>
            {playbackRate}x
          </button>
          <button className={`btn-icon btn-loop${loopA !== null ? ' active' : ''}`} onClick={() => { const st = usePlayerStore.getState(); if (st.loopA === null) { st.setLoop(st.currentTime, null) } else if (st.loopB === null) { if (st.currentTime > st.loopA + 0.5) { st.setLoop(st.loopA, st.currentTime) } else { st.setLoop(null, null) } } else { st.setLoop(null, null) } }} title={t('player.loopTitle')} style={{ fontSize: 11, fontWeight: 600, minWidth: 40, color: loopA !== null ? 'var(--accent)' : undefined }}>
            {loopB !== null ? 'A-B' : loopA !== null ? 'A·--' : 'A-B'}
          </button>
          <button className="btn-icon" onClick={() => usePlayerStore.getState().togglePlayMode()} title={playMode === 'sequential' ? t('player.modeSequential') : playMode === 'shuffle' ? t('player.modeShuffle') : playMode === 'single' ? t('player.modeSingle') : t('player.modeHeartbeat')}>
            {playMode === 'sequential' ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
            ) : playMode === 'shuffle' ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>
            ) : playMode === 'single' ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zM11 9h2v6h-2z"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="currentColor" opacity="0.35"/>
                <path d="M7 11h3l1.5-3 2 5 1.5-2H17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
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
          <button className="btn-icon" onClick={handleToggleFavorite} style={{ color: isFav ? '#e94560' : undefined }} title={isFav ? t('player.unfavorite') : t('player.favorite')}>
            {isFav ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z"/></svg>
            )}
          </button>
          <button className="btn-icon" onClick={toggleQueue} title={t('player.queue')}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>
          </button>
          <div className="sleep-wrap" ref={sleepMenuRef}>
            <button className="btn-icon" onClick={(e) => { e.stopPropagation(); setSleepOpen((o) => !o) }} title={t('player.sleep')}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                {sleepUntil ? (
                  <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/>
                ) : (
                  <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0-5C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
                )}
              </svg>
            </button>
            <button className={`btn-icon${lyricsOn ? ' active' : ''}`} onClick={toggleDesktopLyrics} title={t('player.desktopLyrics')} style={{ color: lyricsOn ? 'var(--accent)' : undefined }}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
              </svg>
            </button>
            {sleepOpen && (
              <div className="sleep-menu">
                <div className="sleep-menu-title">
                  {sleepUntil
                    ? t('player.sleepRemaining', { time: `${Math.floor(sleepRemaining / 60)}:${String(sleepRemaining % 60).padStart(2, '0')}` })
                    : t('player.sleep')}
                </div>
                {[15, 30, 45, 60, 90].map((m) => (
                  <div key={m} className="sleep-menu-item" onClick={() => { setSleepTimer(m, sleepAction); setSleepOpen(false) }}>
                    {t('player.minutes', { m })}
                  </div>
                ))}
                <div className="sleep-menu-custom">
                  <input
                    type="number"
                    min={1}
                    max={720}
                    className="eq-preset-input"
                    value={sleepCustom}
                    onChange={(e) => setSleepCustom(e.target.value)}
                    placeholder={t('player.sleepCustom')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && sleepCustom) commitSleepCustom()
                    }}
                  />
                  <button className="btn btn-sm" onClick={commitSleepCustom}>{t('common.ok')}</button>
                </div>
                <div className="sleep-menu-item" onClick={() => { setSleepActionPicker((o) => !o); setSleepOpen(true) }}>
                  {sleepAction === 'quit' ? t('player.sleepQuit') : t('player.sleepPause')} ▾
                </div>
                {sleepActionPicker && (
                  <div className="sleep-menu-sub">
                    <div className={`sleep-menu-item${sleepAction === 'pause' ? ' active' : ''}`} onClick={() => setSleepAction('pause')}>
                      {t('player.sleepPause')}
                    </div>
                    <div className={`sleep-menu-item${sleepAction === 'quit' ? ' active' : ''}`} onClick={() => setSleepAction('quit')}>
                      {t('player.sleepQuit')}
                    </div>
                  </div>
                )}
                <div className="sleep-menu-item danger" onClick={() => { setSleepTimer(null); setSleepOpen(false) }}>
                  {t('common.close')}
                </div>
              </div>
            )}
          </div>
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
