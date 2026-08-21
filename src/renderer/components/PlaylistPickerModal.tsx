import { useState } from 'react'
import Modal from './Modal'
import { usePlaylistStore } from '../stores/playlistStore'
import { useToastStore } from '../stores/toastStore'
import { useT } from '../i18n'
import type { MusicFile } from '../../main/types'

interface PlaylistPickerModalProps {
  tracks: MusicFile[]
  onClose: () => void
}

export default function PlaylistPickerModal({ tracks, onClose }: PlaylistPickerModalProps): JSX.Element {
  const t = useT()
  const playlists = usePlaylistStore((s) => s.playlists)
  const createPlaylist = usePlaylistStore((s) => s.createPlaylist)
  const addTracks = usePlaylistStore((s) => s.addTracks)
  const addTracksToPlaylist = usePlaylistStore((s) => s.addTracksToPlaylist)
  const addToast = useToastStore((s) => s.addToast)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  const countOf = (trackIds: string): number => {
    try {
      const parsed = JSON.parse(trackIds)
      return Array.isArray(parsed) ? parsed.length : 0
    } catch {
      return 0
    }
  }

  const pick = async (playlistId: number): Promise<void> => {
    if (busy) return
    setBusy(true)
    const added = await addTracksToPlaylist(playlistId, tracks)
    setBusy(false)
    const meta = playlists.find((p) => p.id === playlistId)
    if (added > 0) {
      addToast(t('playlist.addedTo', { name: meta ? meta.name : '', n: added }), 'success')
    } else {
      addToast(t('playlist.alreadyIn'), 'info')
    }
    onClose()
  }

  const createAndAdd = async (): Promise<void> => {
    if (busy || !newName.trim()) return
    setBusy(true)
    await createPlaylist(newName.trim())
    addTracks(tracks)
    setBusy(false)
    addToast(t('playlist.createdAndAdded', { name: newName.trim(), n: tracks.length }), 'success')
    onClose()
  }

  return (
    <Modal onClose={onClose} width={340}>
      <h3>{t('playlist.addToTitle', { n: tracks.length })}</h3>
      <div className="playlist-picker-list">
        {playlists.map((p) => (
          <div key={p.id} className="playlist-picker-item" onClick={() => pick(p.id)}>
            <span className="playlist-picker-name">{p.name}</span>
            <span className="album-meta">{t('playlist.songCount', { count: countOf(p.trackIds) })}</span>
          </div>
        ))}
      </div>
      <div className="playlist-picker-new">
        <input
          type="text"
          className="filter-select"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t('playlist.newNamePlaceholder')}
          onKeyDown={(e) => { if (e.key === 'Enter') createAndAdd() }}
          autoFocus
        />
        <button className="btn btn-primary" onClick={createAndAdd} disabled={!newName.trim()}>{t('playlist.createAndAdd')}</button>
      </div>
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
      </div>
    </Modal>
  )
}
