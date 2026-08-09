import { useEffect, useState, useRef, useMemo } from 'react'
import { usePlayerStore } from '../stores/playerStore'

function parseLrc(lrcText: string): { time: number; text: string }[] {
  const lines = lrcText.split('\n')
  const result: { time: number; text: string }[] = []
  const tagRe = /^\[(\d+):(\d+(?:\.\d+)?)\](.*)/
  for (const line of lines) {
    const match = line.match(tagRe)
    if (match) {
      const min = parseInt(match[1], 10)
      const sec = parseFloat(match[2])
      const text = match[3].trim()
      if (text) result.push({ time: min * 60 + sec, text })
    }
  }
  return result.sort((a, b) => a.time - b.time)
}

const coverCache = new Map<string, string>()
const COVER_CACHE_MAX = 5

export default function PlayerPage(): JSX.Element {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const [coverUrl, setCoverUrl] = useState('')
  const [lrcText, setLrcText] = useState('')
  const loadedRef = useRef(0)
  const activeIdxRef = useRef(-1)

  const lyrics = useMemo(() => parseLrc(lrcText), [lrcText])
  const activeIndex = useMemo(() => {
    for (let i = lyrics.length - 1; i >= 0; i--) {
      if (currentTime >= lyrics[i].time) return i
    }
    return -1
  }, [lyrics, currentTime])

  const lyricsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (activeIndex < 0) return
    const el = lyricsRef.current?.children[activeIndex] as HTMLElement
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeIndex])

  useEffect(() => {
    if (activeIndex < 0 || activeIndex === activeIdxRef.current) return
    activeIdxRef.current = activeIndex
  }, [activeIndex])

  useEffect(() => {
    setCoverUrl('')
    setLrcText('')
    loadedRef.current = 0
    activeIdxRef.current = -1
  }, [currentTrack?.id])

  useEffect(() => {
    if (!currentTrack || loadedRef.current) return
    loadedRef.current = 1

    const key = `${currentTrack.webdavId}:${currentTrack.path}`
    const cached = coverCache.get(key)
    if (cached) {
      setCoverUrl(cached)
    } else {
      window.api.player.getCover(currentTrack.webdavId, currentTrack.path).then((r) => {
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

    window.api.player.getLrc(currentTrack.webdavId, currentTrack.path).then((r) => {
      console.log('[Lrc] received:', r.text ? `${r.text.length} chars` : 'empty')
      if (r.text) setLrcText(r.text)
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
    <div className="page player-page">
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
          {lyrics.length > 0 ? (
            <div className="lyrics-container" ref={lyricsRef}>
              {lyrics.map((line, idx) => (
                <div key={idx} className={`lyrics-line${activeIndex === idx ? ' active' : ''}`}>
                  {line.text}
                </div>
              ))}
            </div>
          ) : (
            <div className="lyrics-empty">暂无歌词</div>
          )}
        </div>
      </div>
    </div>
  )
}
