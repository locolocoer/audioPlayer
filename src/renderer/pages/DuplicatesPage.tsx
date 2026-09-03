import { useEffect, useState, useCallback } from 'react'
import { usePlaylistStore } from '../stores/playlistStore'
import { useMusicStore } from '../stores/musicStore'
import { useToastStore } from '../stores/toastStore'
import { useT } from '../i18n'
import type { MusicFile } from '../../main/types'

interface DuplicateGroup {
  title: string
  trackCount: number
  tracks: MusicFile[]
}

function formatDuration(secs: number): string {
  if (!secs) return '--:--'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatSize(size: number): string {
  if (!size) return '--'
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function extOf(filename: string): string {
  const i = filename.lastIndexOf('.')
  return i >= 0 ? filename.slice(i + 1).toUpperCase() : ''
}

export default function DuplicatesPage(): JSX.Element {
  const t = useT()
  const configs = useMusicStore((s) => s.configs)
  const addToast = useToastStore((s) => s.addToast)
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const reload = useCallback((): void => {
    window.api.music.duplicates().then((list) => {
      setGroups(list)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const sourceName = (webdavId: string): string => {
    const c = configs.find((x) => x.id === webdavId)
    if (c) return c.name || c.url
    return webdavId
  }

  const playTrack = (track: MusicFile): void => {
    usePlaylistStore.getState().playInPlaylist(track)
  }

  const setDefault = async (track: MusicFile): Promise<void> => {
    await window.api.music.setSourcePref(track.title, track.id)
    addToast(t('duplicates.defaultSet', { name: track.title }), 'success')
  }

  const removeTrack = async (group: DuplicateGroup, track: MusicFile): Promise<void> => {
    if (busy) return
    if (group.tracks.length <= 1) return
    setBusy(true)
    const ok = await window.api.music.deleteTrack(track.id)
    setBusy(false)
    if (ok) {
      addToast(t('duplicates.deleted', { title: track.title || track.filename }), 'success')
      reload()
    } else {
      addToast(t('duplicates.deleteFail'), 'error')
    }
  }

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header">
        <h2>{t('nav.duplicates')}</h2>
        <div className="library-controls">
          <span className="album-meta">{t('duplicates.groups', { n: groups.length })}</span>
        </div>
      </div>
      {loading ? (
        <div className="empty-state"><p>{t('common.loading')}</p></div>
      ) : groups.length === 0 ? (
        <div className="empty-state"><p>{t('duplicates.empty')}</p></div>
      ) : (
        <div className="duplicates-scroll">
          {groups.map((g) => (
            <div key={g.title} className="duplicate-group">
              <div className="duplicate-group-title">
                <span className="duplicate-title">{g.title}</span>
                <span className="album-meta">{t('duplicates.versions', { n: g.trackCount })}</span>
              </div>
              {g.tracks.map((tr) => (
                <div key={tr.id} className="duplicate-row" onClick={() => playTrack(tr)}>
                  <div className="duplicate-info">
                    <span className="duplicate-artist">{tr.artist || t('common.unknown')}</span>
                    <span className="album-meta">{sourceName(tr.webdavId)}</span>
                  </div>
                  <span className="album-meta">{extOf(tr.filename)}</span>
                  <span className="album-meta">{formatDuration(tr.duration)}</span>
                  <span className="album-meta">{formatSize(tr.size)}</span>
                  <div className="duplicate-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-sm" title={t('duplicates.setDefault')} onClick={() => setDefault(tr)}>{t('duplicates.setDefault')}</button>
                    <button
                      className="btn btn-sm btn-secondary"
                      disabled={g.tracks.length <= 1}
                      title={g.tracks.length <= 1 ? t('duplicates.keepOne') : undefined}
                      onClick={() => removeTrack(g, tr)}
                    >{t('common.delete')}</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
