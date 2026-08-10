import { create } from 'zustand'
import type { MusicFile } from '../../main/types'
import { usePlayerStore } from './playerStore'

interface PlaylistState {
  playlist: MusicFile[]
  loadPlaylist: () => Promise<void>
  addTrack: (track: MusicFile) => void
  addTracks: (tracks: MusicFile[]) => void
  removeTrack: (id: number) => void
  replaceTrack: (oldId: number, newTrack: MusicFile) => void
  reorder: (from: number, to: number) => void
  clearPlaylist: () => void
  isInPlaylist: (id: number) => boolean
}

const PLAYLIST_ID = 1

function persistPlaylist(playlist: MusicFile[]): void {
  window.api.playlist.save({
    id: PLAYLIST_ID,
    name: '播放列表',
    trackIds: JSON.stringify(playlist.map((t) => t.id)),
    createdAt: new Date().toISOString()
  }).catch(() => {})
}

export const usePlaylistStore = create<PlaylistState>((set, get) => ({
  playlist: [],

  loadPlaylist: async () => {
    try {
      const savedList = await window.api.playlist.list()
      const saved = savedList.find((p) => p.id === PLAYLIST_ID) || savedList[0]
      let ids: number[] = []
      if (saved && saved.trackIds) {
        try {
          const parsed = JSON.parse(saved.trackIds)
          if (Array.isArray(parsed)) {
            ids = parsed.map((n: unknown) => Number(n)).filter((n: number) => Number.isFinite(n))
          }
        } catch { /* ignore */ }
      }
      let tracks: MusicFile[] = []
      if (ids.length > 0) {
        const fetched = await window.api.music.byIds(ids)
        const idMap = new Map(fetched.map((t) => [t.id, t]))
        tracks = ids.map((id) => idMap.get(id)).filter((t): t is MusicFile => !!t)
      }
      set({ playlist: tracks })
      usePlayerStore.getState().syncPlaylist(tracks)
    } catch { /* ignore */ }
  },

  addTrack: (track: MusicFile) => {
    const state = get()
    if (state.playlist.some((t) => t.id === track.id)) return
    const updated = [...state.playlist, track]
    set({ playlist: updated })
    usePlayerStore.getState().syncPlaylist(updated)
    persistPlaylist(updated)
  },

  addTracks: (tracks: MusicFile[]) => {
    const state = get()
    const existingIds = new Set(state.playlist.map((t) => t.id))
    const newTracks = tracks.filter((t) => !existingIds.has(t.id))
    if (newTracks.length === 0) return
    const updated = [...state.playlist, ...newTracks]
    set({ playlist: updated })
    usePlayerStore.getState().syncPlaylist(updated)
    persistPlaylist(updated)
  },

  removeTrack: (id: number) => {
    const updated = get().playlist.filter((t) => t.id !== id)
    set({ playlist: updated })
    usePlayerStore.getState().syncPlaylist(updated)
    persistPlaylist(updated)
  },

  replaceTrack: (oldId: number, newTrack: MusicFile) => {
    const updated = get().playlist.map((t) => t.id === oldId ? newTrack : t)
    if (updated.every((t, i) => t.id === get().playlist[i]?.id)) return
    set({ playlist: updated })
    usePlayerStore.getState().syncPlaylist(updated)
    persistPlaylist(updated)
  },

  reorder: (from: number, to: number) => {
    const list = get().playlist
    if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return
    const updated = [...list]
    const [moved] = updated.splice(from, 1)
    updated.splice(to, 0, moved)
    set({ playlist: updated })
    usePlayerStore.getState().syncPlaylist(updated)
    persistPlaylist(updated)
  },

  clearPlaylist: () => {
    set({ playlist: [] })
    usePlayerStore.getState().syncPlaylist([])
    persistPlaylist([])
  },

  isInPlaylist: (id: number) => {
    return get().playlist.some((t) => t.id === id)
  }
}))
