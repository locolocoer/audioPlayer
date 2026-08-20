import { useEffect, useState, useMemo, useCallback } from 'react'
import { usePlayerStore } from '../stores/playerStore'
import { useT } from '../i18n'
import type { MusicFile } from '../../main/types'

interface HistoryEntry {
  playedAt: string
  track: MusicFile
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDuration(secs: number): string {
  if (!secs) return '--:--'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function HistoryPage(): JSX.Element {
  const t = useT()
  const { requestPlay, setQueue } = usePlayerStore()
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api.music.playHistory(500).then((list) => {
      setEntries(list)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const groups = useMemo(() => {
    const map = new Map<string, HistoryEntry[]>()
    for (const e of entries) {
      const k = dayKey(e.playedAt)
      const arr = map.get(k) || []
      arr.push(e)
      map.set(k, arr)
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([day, list]) => ({ day, list }))
  }, [entries])

  const dayLabel = (day: string): string => {
    const today = dayKey(new Date().toISOString())
    const yesterday = dayKey(new Date(Date.now() - 86400000).toISOString())
    if (day === today) return t('history.today')
    if (day === yesterday) return t('history.yesterday')
    const d = new Date(day + 'T00:00:00')
    return `${d.getMonth() + 1}月${d.getDate()}日`
  }

  const playEntry = useCallback((entry: HistoryEntry) => {
    setQueue(entries.map((e) => e.track))
    requestPlay(entry.track)
  }, [entries, requestPlay, setQueue])

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header">
        <h2>{t('nav.history')}</h2>
        <div className="library-controls">
          <span className="album-meta">{t('history.total', { count: entries.length })}</span>
          <span className="album-meta" style={{ marginLeft: 8 }}>{t('history.retention', { n: 2000 })}</span>
        </div>
      </div>
      {loading ? (
        <div className="empty-state"><p>{t('common.loading')}</p></div>
      ) : entries.length === 0 ? (
        <div className="empty-state"><p>{t('history.empty')}</p></div>
      ) : (
        <div className="history-scroll">
          {groups.map((g) => (
            <div key={g.day} className="history-group">
              <div className="history-day">{dayLabel(g.day)}</div>
              {g.list.map((e, i) => (
                <div key={`${e.playedAt}-${i}`} className="history-row" onClick={() => playEntry(e)}>
                  <span className="history-time">{formatTime(e.playedAt)}</span>
                  <div className="history-info">
                    <span className="history-title">{e.track.title || e.track.filename}</span>
                    <span className="album-meta">
                      {e.track.artist || t('common.unknown')}
                      {e.track.album ? ` · ${e.track.album}` : ''}
                    </span>
                  </div>
                  <span className="album-meta">{formatDuration(e.track.duration)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
