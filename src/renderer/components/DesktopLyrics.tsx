import { useEffect, useState } from 'react'
import { parseLrc, activeLyricIndex } from '../utils/lrc'

interface LrcState { trackId: number; lrcText: string }
interface TimeState { trackId: number; time: number }

interface LyricsStyle {
  fontSize: number
  color: string
  backdrop: number
  align: 'center' | 'left' | 'right'
}

const DEFAULT_STYLE: LyricsStyle = { fontSize: 26, color: '#ffffff', backdrop: 0, align: 'center' }
const COLOR_SWATCHES = ['#ffffff', '#ffe066', '#ff6b6b', '#ff8a80', '#b388ff', '#80ffea', '#69f0ae']

function loadStyle(): LyricsStyle {
  try {
    const raw = localStorage.getItem('desktop_lyrics_style')
    if (raw) return { ...DEFAULT_STYLE, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return DEFAULT_STYLE
}

export default function DesktopLyrics(): JSX.Element {
  const [current, setCurrent] = useState('')
  const [style, setStyle] = useState<LyricsStyle>(loadStyle)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    document.body.style.overflow = 'hidden'
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('desktop_lyrics_style', JSON.stringify(style))
    } catch { /* ignore */ }
  }, [style])

  useEffect(() => {
    let raf = 0
    let cacheTrack = -1
    let lyrics: { time: number; text: string }[] = []

    const tick = (): void => {
      raf = requestAnimationFrame(tick)
      try {
        const lrcRaw = localStorage.getItem('lyrics_sync')
        const timeRaw = localStorage.getItem('lyrics_time')
        let trackId = -1
        let time = 0
        if (lrcRaw) {
          const l: LrcState = JSON.parse(lrcRaw)
          trackId = l.trackId
          if (l.trackId !== cacheTrack) {
            cacheTrack = l.trackId
            lyrics = parseLrc(l.lrcText || '')
          }
        }
        if (timeRaw) {
          const t: TimeState = JSON.parse(timeRaw)
          if (t.trackId === trackId) time = t.time
        }
        const idx = activeLyricIndex(lyrics, time)
        setCurrent(idx >= 0 ? lyrics[idx].text : lyrics.length > 0 ? lyrics[0].text : trackId > 0 ? '暂无歌词' : '')
      } catch { /* ignore */ }
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [])

  const alignStyle = style.align === 'left' ? 'flex-start' : style.align === 'right' ? 'flex-end' : 'center'

  return (
    <div
      className="desktop-lyrics"
      style={{
        alignItems: alignStyle,
        background: `rgba(0, 0, 0, ${style.backdrop})`
      }}
    >
      <div
        className="desktop-lyrics-current"
        style={{ fontSize: style.fontSize, color: style.color, textAlign: style.align }}
      >
        {current}
      </div>

      <div className="desktop-lyrics-tools">
        <button className="desktop-lyrics-btn" title="歌词设置" onClick={() => setSettingsOpen((o) => !o)}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.476.476 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
        </button>
        <button className="desktop-lyrics-btn" title="关闭桌面歌词" onClick={() => window.api.window.lyrics(false)}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>

      {settingsOpen && (
        <div className="desktop-lyrics-settings">
          <div className="dls-row">
            <span className="dls-label">字号</span>
            <button className="dls-btn" onClick={() => setStyle((s) => ({ ...s, fontSize: Math.max(14, s.fontSize - 2) }))}>-</button>
            <span className="dls-value">{style.fontSize}px</span>
            <button className="dls-btn" onClick={() => setStyle((s) => ({ ...s, fontSize: Math.min(48, s.fontSize + 2) }))}>+</button>
          </div>
          <div className="dls-row">
            <span className="dls-label">颜色</span>
            {COLOR_SWATCHES.map((c) => (
              <button key={c} className={`dls-swatch${style.color === c ? ' active' : ''}`} style={{ background: c }} onClick={() => setStyle((s) => ({ ...s, color: c }))} />
            ))}
          </div>
          <div className="dls-row">
            <span className="dls-label">背景</span>
            <input
              type="range"
              min={0}
              max={60}
              step={5}
              value={style.backdrop * 100}
              onChange={(e) => setStyle((s) => ({ ...s, backdrop: Number(e.target.value) / 100 }))}
            />
            <span className="dls-value">{Math.round(style.backdrop * 100)}%</span>
          </div>
          <div className="dls-row">
            <span className="dls-label">对齐</span>
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} className={`dls-btn${style.align === a ? ' active' : ''}`} onClick={() => setStyle((s) => ({ ...s, align: a }))}>
                {a === 'left' ? '左' : a === 'center' ? '中' : '右'}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
