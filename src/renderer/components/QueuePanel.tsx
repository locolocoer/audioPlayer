import { useMemo } from 'react'
import { useUiStore } from '../stores/uiStore'
import { usePlayerStore } from '../stores/playerStore'
import type { MusicFile } from '../../main/types'
import { useT } from '../i18n'

const MAX_ROWS = 300

export default function QueuePanel(): JSX.Element | null {
  const t = useT()
  const queueOpen = useUiStore((s) => s.queueOpen)
  const setQueueOpen = useUiStore((s) => s.setQueueOpen)
  const queue = usePlayerStore((s) => (s.playlist.length > 0 ? s.playlist : s.queue))
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const removeQueueItem = usePlayerStore((s) => s.removeQueueItem)

  const { view, startIndex, total } = useMemo(() => {
    const total = queue.length
    if (total === 0) return { view: [], startIndex: 0, total: 0 }
    const curIdx = currentTrack ? queue.findIndex((t) => t.id === currentTrack.id) : -1
    const start = curIdx >= 0 ? curIdx : 0
    return { view: queue.slice(start, start + MAX_ROWS), startIndex: start, total }
  }, [queue, currentTrack])

  if (!queueOpen) return null

  const play = (track: MusicFile): void => {
    usePlayerStore.getState().requestPlay(track)
    setQueueOpen(false)
  }

  return (
    <>
      <div className="queue-overlay" onClick={() => setQueueOpen(false)} />
      <aside className="queue-panel">
        <div className="queue-header">
          <h3>{t('queue.title')}</h3>
          <button className="btn-icon" onClick={() => setQueueOpen(false)} title={t('common.close')}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>
        <div className="queue-list">
          {view.map((track, i) => (
            <div
              key={track.id}
              className={`queue-item${currentTrack?.id === track.id ? ' active' : ''}`}
              onClick={() => play(track)}
            >
              <span className="queue-idx">{startIndex + i + 1}</span>
              <div className="queue-info">
                <span className="queue-title">{track.title || track.filename}</span>
                <span className="queue-artist">{track.artist || t('common.unknown')}</span>
              </div>
              <button
                className="btn-icon queue-remove"
                onClick={(e) => { e.stopPropagation(); removeQueueItem(track.id) }}
                title={t('queue.remove')}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
              </button>
            </div>
          ))}
          {total > view.length && (
            <div className="queue-more">{t('queue.more', { total, view: view.length })}</div>
          )}
          {total === 0 && <div className="queue-empty">{t('queue.empty')}</div>}
        </div>
      </aside>
    </>
  )
}
