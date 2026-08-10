import { useMemo } from 'react'
import { useUiStore } from '../stores/uiStore'
import { usePlayerStore } from '../stores/playerStore'
import type { MusicFile } from '../../main/types'

const MAX_ROWS = 300

export default function QueuePanel(): JSX.Element | null {
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
          <h3>接下来播放</h3>
          <button className="btn-icon" onClick={() => setQueueOpen(false)} title="关闭">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>
        <div className="queue-list">
          {view.map((t, i) => (
            <div
              key={t.id}
              className={`queue-item${currentTrack?.id === t.id ? ' active' : ''}`}
              onClick={() => play(t)}
            >
              <span className="queue-idx">{startIndex + i + 1}</span>
              <div className="queue-info">
                <span className="queue-title">{t.title || t.filename}</span>
                <span className="queue-artist">{t.artist || '未知'}</span>
              </div>
              <button
                className="btn-icon queue-remove"
                onClick={(e) => { e.stopPropagation(); removeQueueItem(t.id) }}
                title="从队列移除"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
              </button>
            </div>
          ))}
          {total > view.length && (
            <div className="queue-more">… 共 {total} 首，从当前曲目起显示前 {view.length} 首</div>
          )}
          {total === 0 && <div className="queue-empty">队列为空</div>}
        </div>
      </aside>
    </>
  )
}
