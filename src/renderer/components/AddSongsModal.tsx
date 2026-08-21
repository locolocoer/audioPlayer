import { useEffect, useState, useMemo } from 'react'
import Modal from './Modal'
import { useVirtualWindow } from '../hooks/useVirtualWindow'
import { useMusicStore } from '../stores/musicStore'
import { usePlaylistStore } from '../stores/playlistStore'
import { useToastStore } from '../stores/toastStore'
import { useT } from '../i18n'

const ROW_HEIGHT = 52

interface AddSongsModalProps {
  onClose: () => void
}

export default function AddSongsModal({ onClose }: AddSongsModalProps): JSX.Element {
  const t = useT()
  const allTracks = useMusicStore((s) => s.tracks)
  const playlist = usePlaylistStore((s) => s.playlist)
  const addTracksToPlaylist = usePlaylistStore((s) => s.addTracksToPlaylist)
  const addToast = useToastStore((s) => s.addToast)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)

  // 排除已在当前歌单中的歌曲
  const available = useMemo(() => {
    const existing = new Set(playlist.map((x) => x.id))
    return allTracks.filter((x) => !existing.has(x.id))
  }, [allTracks, playlist])

  const filtered = useMemo(() => {
    if (!search) return available
    const q = search.toLowerCase()
    return available.filter((x) =>
      x.title.toLowerCase().includes(q) ||
      x.artist.toLowerCase().includes(q) ||
      x.album.toLowerCase().includes(q)
    )
  }, [available, search])

  const win = useVirtualWindow(filtered.length, ROW_HEIGHT)

  const toggle = (id: number): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = (): void => {
    setSelected((prev) => {
      if (prev.size === filtered.length) return new Set()
      return new Set(filtered.map((x) => x.id))
    })
  }

  const confirmAdd = async (): Promise<void> => {
    if (busy || selected.size === 0) return
    setBusy(true)
    const tracks = allTracks.filter((x) => selected.has(x.id))
    const added = await addTracksToPlaylist(usePlaylistStore.getState().activeId ?? -1, tracks)
    setBusy(false)
    if (added > 0) {
      addToast(t('playlist.addedTo', { name: usePlaylistStore.getState().playlists.find((p) => p.id === usePlaylistStore.getState().activeId)?.name || '', n: added }), 'success')
    }
    onClose()
  }

  useEffect(() => {
    setSelected(new Set())
    setSearch('')
  }, [onClose])

  return (
    <Modal onClose={onClose} width={520}>
      <h3>{t('playlist.addSongsTitle')}</h3>
      <div className="add-songs-bar">
        <input
          type="text"
          className="search-input"
          placeholder={t('library.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn btn-secondary" onClick={toggleAll}>
          {selected.size === filtered.length && filtered.length > 0 ? t('list.selectNone') : t('list.selectAll')}
        </button>
        <span className="album-meta">{t('list.selected', { n: selected.size })}</span>
      </div>
      <div className="add-songs-scroll" ref={win.containerRef} onScroll={win.onScroll}>
        {win.topPad > 0 && <div style={{ height: win.topPad }} />}
        {filtered.slice(win.start, win.end).map((x) => (
          <div key={x.id} className="add-songs-row" onClick={() => toggle(x.id)}>
            <input
              type="checkbox"
              className="row-check"
              checked={selected.has(x.id)}
              onChange={() => toggle(x.id)}
              onClick={(e) => e.stopPropagation()}
            />
            <div className="add-songs-info">
              <span className="add-songs-title">{x.title || x.filename}</span>
              <span className="album-meta">{x.artist || t('common.unknown')}{x.album ? ` · ${x.album}` : ''}</span>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="empty-state"><p>{t('playlist.allAdded')}</p></div>
        )}
        {win.bottomPad > 0 && <div style={{ height: win.bottomPad }} />}
      </div>
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn btn-primary" onClick={confirmAdd} disabled={selected.size === 0 || busy}>
          {t('playlist.addSelected', { n: selected.size })}
        </button>
      </div>
    </Modal>
  )
}
