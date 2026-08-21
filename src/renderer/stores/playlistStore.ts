import { create } from 'zustand'
import type { MusicFile, Playlist } from '../../main/types'
import { usePlayerStore } from './playerStore'
import { t } from '../i18n'

interface PlaylistState {
  playlists: Playlist[]
  activeId: number | null
  playlist: MusicFile[]
  loadPlaylists: () => Promise<void>
  createPlaylist: (name: string) => Promise<void>
  renamePlaylist: (id: number, name: string) => Promise<void>
  deletePlaylist: (id: number) => Promise<void>
  selectPlaylist: (id: number) => Promise<void>
  addTrack: (track: MusicFile) => void
  addTracks: (tracks: MusicFile[]) => void
  removeTrack: (id: number) => void
  replaceTrack: (oldId: number, newTrack: MusicFile) => void
  reorder: (from: number, to: number) => void
  reorderMany: (ids: number[], toIndex: number) => void
  clearPlaylist: () => void
  isInPlaylist: (id: number) => boolean
  persistTracks: (tracks: MusicFile[]) => void
  addTracksToPlaylist: (playlistId: number, tracks: MusicFile[]) => Promise<number>
}

function parseIds(trackIds: string): number[] {
  try {
    const parsed = JSON.parse(trackIds)
    if (Array.isArray(parsed)) {
      return parsed.map((n: unknown) => Number(n)).filter((n: number) => Number.isFinite(n))
    }
  } catch { /* ignore */ }
  return []
}

async function resolveTracks(ids: number[]): Promise<MusicFile[]> {
  if (ids.length === 0) return []
  const fetched = await window.api.music.byIds(ids)
  const idMap = new Map(fetched.map((t) => [t.id, t]))
  return ids.map((id) => idMap.get(id)).filter((t): t is MusicFile => !!t)
}

export const usePlaylistStore = create<PlaylistState>((set, get) => ({
  playlists: [],
  activeId: null,
  playlist: [],

  loadPlaylists: async () => {
    try {
      let list = await window.api.playlist.list()
      if (list.length === 0) {
        const def: Playlist = {
          id: Date.now(),
          name: t('playlist.defaultName'),
          trackIds: '[]',
          createdAt: new Date().toISOString()
        }
        await window.api.playlist.save(def)
        list = [def]
      }
      let activeId = get().activeId
      if (!list.some((p) => p.id === activeId)) activeId = list[0].id
      const active = list.find((p) => p.id === activeId)
      const tracks = active ? await resolveTracks(parseIds(active.trackIds)) : []
      set({ playlists: list, activeId, playlist: tracks })
      usePlayerStore.getState().syncPlaylist(tracks)
    } catch { /* ignore */ }
  },

  createPlaylist: async (name) => {
    const playlist: Playlist = {
      id: Date.now(),
      name: name || t('playlist.newDefaultName'),
      trackIds: '[]',
      createdAt: new Date().toISOString()
    }
    await window.api.playlist.save(playlist)
    set((s) => ({ playlists: [...s.playlists, playlist], activeId: playlist.id, playlist: [] }))
    usePlayerStore.getState().syncPlaylist([])
  },

  renamePlaylist: async (id, name) => {
    const meta = get().playlists.find((p) => p.id === id)
    if (!meta) return
    const updated = { ...meta, name }
    await window.api.playlist.save(updated)
    set((s) => ({ playlists: s.playlists.map((p) => (p.id === id ? updated : p)) }))
  },

  deletePlaylist: async (id) => {
    await window.api.playlist.delete(id)
    const remaining = get().playlists.filter((p) => p.id !== id)
    let activeId = get().activeId === id ? (remaining.length > 0 ? remaining[0].id : null) : get().activeId
    const active = remaining.find((p) => p.id === activeId)
    const tracks = active ? await resolveTracks(parseIds(active.trackIds)) : []
    set({ playlists: remaining, activeId, playlist: tracks })
    usePlayerStore.getState().syncPlaylist(tracks)
  },

  selectPlaylist: async (id) => {
    if (get().activeId === id) return
    const active = get().playlists.find((p) => p.id === id)
    const tracks = active ? await resolveTracks(parseIds(active.trackIds)) : []
    set({ activeId: id, playlist: tracks })
    usePlayerStore.getState().syncPlaylist(tracks)
  },

  persistTracks: (tracks: MusicFile[]) => {
    const activeId = get().activeId
    if (activeId === null) return
    const meta = get().playlists.find((p) => p.id === activeId)
    window.api.playlist.save({
      id: activeId,
      name: meta ? meta.name : t('playlist.defaultName'),
      trackIds: JSON.stringify(tracks.map((t) => t.id)),
      createdAt: meta ? meta.createdAt : new Date().toISOString()
    }).catch(() => {})
  },

  addTrack: (track: MusicFile) => {
    const state = get()
    if (state.playlist.some((t) => t.id === track.id)) return
    const updated = [...state.playlist, track]
    set({ playlist: updated })
    usePlayerStore.getState().syncPlaylist(updated)
    get().persistTracks(updated)
  },

  addTracks: (tracks: MusicFile[]) => {
    const state = get()
    const existingIds = new Set(state.playlist.map((t) => t.id))
    const newTracks = tracks.filter((t) => !existingIds.has(t.id))
    if (newTracks.length === 0) return
    const updated = [...state.playlist, ...newTracks]
    set({ playlist: updated })
    usePlayerStore.getState().syncPlaylist(updated)
    get().persistTracks(updated)
  },

  removeTrack: (id: number) => {
    const updated = get().playlist.filter((t) => t.id !== id)
    set({ playlist: updated })
    usePlayerStore.getState().syncPlaylist(updated)
    get().persistTracks(updated)
  },

  replaceTrack: (oldId: number, newTrack: MusicFile) => {
    const updated = get().playlist.map((t) => t.id === oldId ? newTrack : t)
    if (updated.every((t, i) => t.id === get().playlist[i]?.id)) return
    set({ playlist: updated })
    usePlayerStore.getState().syncPlaylist(updated)
    get().persistTracks(updated)
  },

  reorder: (from: number, to: number) => {
    const list = get().playlist
    if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return
    const updated = [...list]
    const [moved] = updated.splice(from, 1)
    updated.splice(to, 0, moved)
    set({ playlist: updated })
    usePlayerStore.getState().syncPlaylist(updated)
    get().persistTracks(updated)
  },

  reorderMany: (ids: number[], toIndex: number) => {
    const list = get().playlist
    if (ids.length === 0 || toIndex < 0 || toIndex >= list.length) return
    const idSet = new Set(ids)
    // 目标行本身在选中组内：不移动
    const target = list[toIndex]
    if (target && idSet.has(target.id)) return
    const moving = list.filter((t) => idSet.has(t.id))
    if (moving.length === 0) return
    const rest = list.filter((t) => !idSet.has(t.id))
    // rest 中原始索引 < toIndex 的项数即插入位置
    let insertAt = 0
    for (let i = 0; i < toIndex; i++) {
      if (!idSet.has(list[i].id)) insertAt++
    }
    const updated = [...rest.slice(0, insertAt), ...moving, ...rest.slice(insertAt)]
    set({ playlist: updated })
    usePlayerStore.getState().syncPlaylist(updated)
    get().persistTracks(updated)
  },

  clearPlaylist: () => {
    set({ playlist: [] })
    usePlayerStore.getState().syncPlaylist([])
    get().persistTracks([])
  },

  isInPlaylist: (id: number) => {
    return get().playlist.some((t) => t.id === id)
  },

  // 加入指定歌单（不切换当前活动歌单），返回实际新增数量
  addTracksToPlaylist: async (playlistId: number, tracks: MusicFile[]) => {
    const meta = get().playlists.find((p) => p.id === playlistId)
    if (!meta || tracks.length === 0) return 0
    const existingIds = parseIds(meta.trackIds)
    const existingSet = new Set(existingIds)
    const newTracks = tracks.filter((t) => !existingSet.has(t.id))
    if (newTracks.length === 0) return 0
    const updated = { ...meta, trackIds: JSON.stringify([...existingIds, ...newTracks.map((t) => t.id)]) }
    await window.api.playlist.save(updated)
    set((s) => ({
      playlists: s.playlists.map((p) => (p.id === playlistId ? updated : p))
    }))
    if (get().activeId === playlistId) {
      const merged = [...get().playlist, ...newTracks]
      set({ playlist: merged })
      usePlayerStore.getState().syncPlaylist(merged)
    }
    return newTracks.length
  }
}))
