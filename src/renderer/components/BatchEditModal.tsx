import { useState } from 'react'
import Modal from './Modal'
import { useMusicStore } from '../stores/musicStore'
import { useToastStore } from '../stores/toastStore'
import { useT } from '../i18n'
import type { MusicFile } from '../../main/types'

interface BatchEditModalProps {
  tracks: MusicFile[]
  onClose: () => void
}

export default function BatchEditModal({ tracks, onClose }: BatchEditModalProps): JSX.Element {
  const t = useT()
  const updateMetaBatch = useMusicStore((s) => s.updateMetaBatch)
  const addToast = useToastStore((s) => s.addToast)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [album, setAlbum] = useState('')
  const [busy, setBusy] = useState(false)

  const canSave = title.trim() || artist.trim() || album.trim()

  const handleSave = async (): Promise<void> => {
    if (busy || !canSave) return
    setBusy(true)
    const meta: { title?: string; artist?: string; album?: string } = {}
    if (title.trim()) meta.title = title.trim()
    if (artist.trim()) meta.artist = artist.trim()
    if (album.trim()) meta.album = album.trim()
    await updateMetaBatch(tracks.map((x) => x.id), meta)
    setBusy(false)
    addToast(t('music.writebackBatchOk', { n: tracks.length }), 'success')
    onClose()
  }

  return (
    <Modal onClose={onClose} width={400}>
      <h3>{t('track.batchEditTitle', { n: tracks.length })}</h3>
      <p className="batch-edit-hint">{t('track.batchEditHint')}</p>
      <div className="form-group">
        <label>{t('track.title')}</label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('track.batchKeep')} />
      </div>
      <div className="form-group">
        <label>{t('track.artist')}</label>
        <input type="text" value={artist} onChange={(e) => setArtist(e.target.value)} placeholder={t('track.batchKeep')} />
      </div>
      <div className="form-group">
        <label>{t('track.album')}</label>
        <input type="text" value={album} onChange={(e) => setAlbum(e.target.value)} placeholder={t('track.batchKeep')} />
      </div>
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={!canSave || busy}>{t('common.save')}</button>
      </div>
    </Modal>
  )
}
