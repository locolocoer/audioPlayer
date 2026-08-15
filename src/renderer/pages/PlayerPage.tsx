import { useEffect, useState, useRef, useMemo } from 'react'
import { usePlayerStore } from '../stores/playerStore'
import { useMusicStore } from '../stores/musicStore'
import { useLyricsStyleStore } from '../stores/lyricsStyleStore'
import { useSkinStore } from '../stores/skinStore'
import Equalizer from '../components/Equalizer'
import Visualizer from '../components/Visualizer'
import Modal from '../components/Modal'
import { parseLrc, activeLyricIndex } from '../utils/lrc'

const coverCache = new Map<string, string>()
const COVER_CACHE_MAX = 5

export default function PlayerPage(): JSX.Element {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const lyricsFontSize = useLyricsStyleStore((s) => s.fontSize)
  const lyricsAlign = useLyricsStyleStore((s) => s.align)
  const skin = useSkinStore((s) => s.skin)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const [coverUrl, setCoverUrl] = useState('')
  const [lrcText, setLrcText] = useState('')
  const [eqOpen, setEqOpen] = useState(() => localStorage.getItem('eq_panel') === '1')
  const [fullscreenLyrics, setFullscreenLyrics] = useState(false)
  const [searchingLrc, setSearchingLrc] = useState(false)
  const [lrcSearchMsg, setLrcSearchMsg] = useState('')
  const [lrcFromOnline, setLrcFromOnline] = useState(false)
  const [searchDialogOpen, setSearchDialogOpen] = useState(false)
  const [searchTitle, setSearchTitle] = useState('')
  const [searchArtist, setSearchArtist] = useState('')
  const [searchAlbum, setSearchAlbum] = useState('')
  const loadedRef = useRef(0)
  const activeIdxRef = useRef(-1)

  useEffect(() => {
    localStorage.setItem('eq_panel', eqOpen ? '1' : '0')
  }, [eqOpen])

  useEffect(() => {
    if (!fullscreenLyrics) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setFullscreenLyrics(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreenLyrics])

  const lyrics = useMemo(() => parseLrc(lrcText), [lrcText])
  const activeIndex = useMemo(() => activeLyricIndex(lyrics, currentTime), [lyrics, currentTime])
  const litCount = useMemo(() => {
    if (activeIndex < 0) return 0
    const start = lyrics[activeIndex].time
    const next = activeIndex + 1 < lyrics.length ? lyrics[activeIndex + 1].time : start + 5000
    const span = Math.max(0.1, next - start)
    return Math.floor(Math.max(0, Math.min(1, (currentTime - start) / span)) * Array.from(lyrics[activeIndex].text).length)
  }, [lyrics, activeIndex, currentTime])

  const configs = useMusicStore((s) => s.configs)
  const isLocalTrack = currentTrack ? configs.find((c) => c.id === currentTrack.webdavId)?.sourceType === 'local' : false

  const openSearchDialog = (): void => {
    if (!currentTrack) return
    setSearchTitle(currentTrack.title || '')
    setSearchArtist(currentTrack.artist || '')
    setSearchAlbum(currentTrack.album || '')
    setSearchDialogOpen(true)
  }

  const searchOnlineLrc = async (): Promise<void> => {
    if (!currentTrack) return
    setSearchingLrc(true)
    setLrcSearchMsg('')
    const res = await window.api.lrc.search({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.album,
      duration: currentTrack.duration
    })
    setSearchingLrc(false)
    if (res.ok && res.lrc) {
      setLrcText(res.lrc)
      setLrcFromOnline(true)
      setLrcSearchMsg('已找到在线歌词')
    } else {
      setLrcSearchMsg(res.error || '未找到歌词')
      openSearchDialog()
    }
  }

  const saveLrc = async (): Promise<void> => {
    if (!currentTrack || !lrcText) return
    const res = await window.api.player.saveLyrics(currentTrack.webdavId, currentTrack.path, lrcText)
    setLrcSearchMsg(res.ok ? '已保存为 .lrc 文件' : (res.error || '保存失败'))
  }

  const searchWithInfo = async (): Promise<void> => {
    setSearchingLrc(true)
    setLrcSearchMsg('')
    const res = await window.api.lrc.search({
      title: searchTitle,
      artist: searchArtist,
      album: searchAlbum,
      duration: currentTrack?.duration || 0
    })
    setSearchingLrc(false)
    if (res.ok && res.lrc) {
      setLrcText(res.lrc)
      setLrcFromOnline(true)
      setSearchDialogOpen(false)
      setLrcSearchMsg('已找到在线歌词')
    } else {
      setLrcSearchMsg(res.error || '未找到歌词')
    }
  }

  const lyricsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (activeIndex < 0) return
    const el = lyricsRef.current?.querySelector(`[data-idx="${activeIndex}"]`) as HTMLElement
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeIndex])

  useEffect(() => {
    if (activeIndex < 0 || activeIndex === activeIdxRef.current) return
    activeIdxRef.current = activeIndex
  }, [activeIndex])

  useEffect(() => {
    setCoverUrl('')
    setLrcText('')
    setLrcSearchMsg('')
    setLrcFromOnline(false)
    loadedRef.current = 0
    activeIdxRef.current = -1
  }, [currentTrack?.id])

  useEffect(() => {
    if (!currentTrack || loadedRef.current) return
    loadedRef.current = 1

    const track = currentTrack
    const key = `${track.webdavId}:${track.path}`
    const cached = coverCache.get(key)
    if (cached) {
      setCoverUrl(cached)
    } else {
      window.api.player.getCover(track.webdavId, track.path).then((r) => {
        if (r.data && r.data.length > 0) {
          const blob = new Blob([new Uint8Array(r.data)], { type: r.format || 'image/jpeg' })
          const url = URL.createObjectURL(blob)
          if (coverCache.size >= COVER_CACHE_MAX) {
            const firstKey = coverCache.keys().next().value
            if (firstKey !== undefined) {
              const oldUrl = coverCache.get(firstKey)
              if (oldUrl) URL.revokeObjectURL(oldUrl)
              coverCache.delete(firstKey)
            }
          }
          coverCache.set(key, url)
          setCoverUrl(url)
        }
      }).catch(() => {})
    }

    window.api.player.getLrc(track.webdavId, track.path).then((r) => {
      if (r.text) {
        setLrcText(r.text)
        setLrcFromOnline(false)
      }
    }).catch(() => {})
  }, [currentTrack])

  if (!currentTrack) {
    return (
      <div className="page player-page">
        <div className="empty-state">
          <p>未选择歌曲。请从音乐库中选择一首歌曲播放。</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`page player-page${skin !== 'base' ? ` skin-${skin}` : ''}${isPlaying ? ' playing' : ''}`}>
      <div className="player-layout">
        <div className="player-left">
          <div className="player-artwork-large">
            {coverUrl ? (
              <img src={coverUrl} alt="" />
            ) : (
              <div className="artwork-placeholder">
                <svg viewBox="0 0 24 24" width="64" height="64" fill="currentColor">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                </svg>
              </div>
            )}
          </div>
          <div className="player-detail-info">
            <h2>{currentTrack.title || currentTrack.filename}</h2>
            {currentTrack.artist && <p className="player-artist">{currentTrack.artist}</p>}
            {currentTrack.album && <p className="player-album">{currentTrack.album}</p>}
          </div>
        </div>
        <div className="player-right">
          <Visualizer />
          {lyrics.length > 0 ? (
            <>
              <div className="lyrics-container" ref={lyricsRef} style={{ fontSize: lyricsFontSize, textAlign: lyricsAlign }}>
                <div className="lyrics-spacer" />
                {lyrics.map((line, idx) => (
                  <div key={idx} data-idx={idx} className={`lyrics-line${activeIndex === idx ? ' active' : ''}`}>
                    {line.text}
                  </div>
                ))}
                <div className="lyrics-spacer" />
              </div>
              <div className="lyrics-actions">
                {isLocalTrack && lrcFromOnline && (
                  <button className="lyrics-btn" onClick={saveLrc}>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>
                    保存为 .lrc
                  </button>
                )}
                <button className="lyrics-btn" onClick={openSearchDialog}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
                  重新搜索
                </button>
                {lrcSearchMsg && <span className={`lrc-search-msg${lrcSearchMsg.startsWith('已') ? ' success' : ''}`}>{lrcSearchMsg}</span>}
              </div>
            </>
          ) : (
            <div className="lyrics-empty">
              <svg className="lyrics-empty-icon" viewBox="0 0 24 24" width="40" height="40" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
              <span>暂无歌词</span>
              <button className="lyrics-btn primary" onClick={searchOnlineLrc} disabled={searchingLrc || !currentTrack}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
                {searchingLrc ? '搜索中...' : '搜索在线歌词'}
              </button>
              {lrcSearchMsg && <span className={`lrc-search-msg${lrcSearchMsg.startsWith('已') ? ' success' : ''}`}>{lrcSearchMsg}</span>}
            </div>
          )}
        </div>
      </div>
      <div className="eq-section">
        <button className="eq-toggle" onClick={() => setFullscreenLyrics(true)} title="全屏歌词" disabled={lyrics.length === 0}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
          全屏歌词
        </button>
        <button className="eq-toggle" onClick={() => setEqOpen((o) => !o)} title="均衡器">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M12 3c-1.66 0-3 1.34-3 3v6.18c-1.16.41-2 1.51-2 2.82 0 1.66 1.34 3 3 3s3-1.34 3-3c0-1.31-.84-2.41-2-2.82V6c0-.55.45-1 1-1s1 .45 1 1v1h2V6c0-1.66-1.34-3-3-3z"/>
          </svg>
          均衡器
          <span className="eq-chevron">{eqOpen ? '▾' : '▸'}</span>
        </button>
        {eqOpen && <Equalizer />}
      </div>

      {fullscreenLyrics && (
        <div className="fullscreen-lyrics" onClick={() => setFullscreenLyrics(false)}>
          {lyrics.length > 0 ? (
            <div className="fsl-current">
              {Array.from(lyrics[Math.max(0, activeIndex)].text).map((ch, i) => (
                <span key={i} className={i < litCount ? 'fsl-lit' : ''}>{ch === ' ' ? '\u00A0' : ch}</span>
              ))}
            </div>
          ) : (
            <div className="fsl-empty">暂无歌词</div>
          )}
          <div className="fsl-hint">点击或按 ESC 退出</div>
        </div>
      )}

      {searchDialogOpen && (
        <Modal onClose={() => setSearchDialogOpen(false)} width={420}>
          <h3>搜索歌词</h3>
          <div className="form-group">
            <label>歌曲名</label>
            <input type="text" value={searchTitle} onChange={(e) => setSearchTitle(e.target.value)} placeholder="歌曲名" />
          </div>
          <div className="form-group">
            <label>歌手</label>
            <input type="text" value={searchArtist} onChange={(e) => setSearchArtist(e.target.value)} placeholder="歌手" />
          </div>
          <div className="form-group">
            <label>专辑</label>
            <input type="text" value={searchAlbum} onChange={(e) => setSearchAlbum(e.target.value)} placeholder="专辑（可选）" />
          </div>
          {lrcSearchMsg && <div className="test-result error">{lrcSearchMsg}</div>}
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setSearchDialogOpen(false)}>取消</button>
            <button className="btn btn-primary" onClick={searchWithInfo} disabled={searchingLrc || !searchTitle.trim()}>
              {searchingLrc ? '搜索中...' : '搜索'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
