import { create } from 'zustand'
import type { MusicFile } from '../../main/types'
import { usePlayerStore } from './playerStore'

interface PlaylistState {
  playlist: MusicFile[]
  addTrack: (track: MusicFile) => void
  addTracks: (tracks: MusicFile[]) => void
  removeTrack: (id: number) => void
  clearPlaylist: () => void
  isInPlaylist: (id: number) => boolean
}

export const usePlaylistStore = create<PlaylistState>((set, get) => ({
  playlist: [],

  addTrack: (track: MusicFile) => {
    const state = get()
    if (state.playlist.some((t) => t.id === track.id)) return
    const updated = [...state.playlist, track]
    set({ playlist: updated })
    usePlayerStore.getState().syncPlaylist(updated)
  },

  addTracks: (tracks: MusicFile[]) => {
    const state = get()
    const existingIds = new Set(state.playlist.map((t) => t.id))
    const newTracks = tracks.filter((t) => !existingIds.has(t.id))
    if (newTracks.length === 0) return
    const updated = [...state.playlist, ...newTracks]
    set({ playlist: updated })
    usePlayerStore.getState().syncPlaylist(updated)
  },

  removeTrack: (id: number) => {
    const updated = get().playlist.filter((t) => t.id !== id)
    set({ playlist: updated })
    usePlayerStore.getState().syncPlaylist(updated)
  },

  clearPlaylist: () => {
    set({ playlist: [] })
    usePlayerStore.getState().syncPlaylist([])
  },

  isInPlaylist: (id: number) => {
    return get().playlist.some((t) => t.id === id)
  }
}))
