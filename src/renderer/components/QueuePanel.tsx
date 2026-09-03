import { useMemo, useRef } from 'react'
import { useUiStore } from '../stores/uiStore'
import { usePlayerStore } from '../stores/playerStore'
import { usePlaylistStore } from '../stores/playlistStore'
import { useVirtualWindow } from '../hooks/useVirtualWindow'
import type { MusicFile } from '../../main/types'
import { useT } from '../i18n'

const ROW_HEIGHT = 52

export default function QueuePanel(): JSX.Element | null {
  const t = useT()
  const queueOpen = useUiStore((s) => s.queueOpen)
  const setQueueOpen = useUiStore((s) => s.setQueueOpen)
  const queue = usePlayerStore((s) => (s.playlist.length > 0 ? s.playlist : s.queue))
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const removeQueueItem = usePlayerStore((s) => s.removeQueueItem)
  const reorderQueue = usePlayerStore((s) => s.reorderQueue)
  const dragIndexRef = useRef(-1)

  const { displayQueue, startIndex } = useMemo(() => {
    const curIdx = currentTrack ? queue.findIndex((t) => t.id === currentTrack.id) : -1
    const start = curIdx >= 0 ? curIdx : 0
    return { displayQueue: queue.slice(start), startIndex: start }
  }, [queue, currentTrack])

  const { containerRef, onScroll, start, end, topPad, bottomPad } = useVirtualWindow(displayQueue.length, ROW_HEIGHT)

  if (!queueOpen) return null

  const play = (track: MusicFile): void => {
    usePlayerStore.getState().requestPlay(track)
    setQueueOpen(false)
  }

  const clearQueue = (): void => {
    const st = usePlayerStore.getState()
    if (st.playlist.length > 0) {
      usePlaylistStore.getState().clearPlaylistTracks()
    } else {
      st.setQueue([])
    }
  }

  return (
    <>
      <div className="queue-overlay" onClick={() => setQueueOpen(false)} />
      <aside className="queue-panel">
        <div className="queue-header">
          <h3>{t('queue.title')}</h3>
          <div className="queue-header-actions">
            <button className="btn btn-sm" onClick={clearQueue} disabled={queue.length === 0} title={t('queue.clear')}>
              {t('queue.clear')}
            </button>
            <button className="btn-icon" onClick={() => setQueueOpen(false)} title={t('common.close')}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
          </div>
        </div>
        <div className="queue-list" ref={containerRef} onScroll={onScroll}>
          {topPad > 0 && <div style={{ height: topPad }} />}
          {displayQueue.slice(start, end).map((track, i) => {
            const idx = start + i
            const fullIdx = startIndex + idx
            return (
              <div
                key={track.id}
                className={`queue-item${currentTrack?.id === track.id ? ' active' : ''}`}
                onClick={() => play(track)}
                draggable
                onDragStart={(e) => { dragIndexRef.current = fullIdx; e.dataTransfer.effectAllowed = 'move' }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                onDrop={(e) => {
                  e.preventDefault()
                  const from = dragIndexRef.current
                  dragIndexRef.current = -1
                  if (from >= 0 && from !== fullIdx) reorderQueue(from, fullIdx)
                }}
                onContextMenu={(e) => { e.preventDefault(); removeQueueItem(track.id) }}
              >
                <span className="queue-idx">{startIndex + idx + 1}</span>
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
            )
          })}
          {bottomPad > 0 && <div style={{ height: bottomPad }} />}
          {displayQueue.length === 0 && <div className="queue-empty">{t('queue.empty')}</div>}
        </div>
      </aside>
    </>
  )
}
