import { create } from 'zustand'
import type { MusicFile, Playlist } from '../../main/types'
import { usePlayerStore } from './playerStore'
import { t } from '../i18n'

interface PlaylistState {
  playlists: Playlist[]
  // 收藏列表（多列表，activeId 切换）
  activeId: number | null
  playlist: MusicFile[]
  // 播放列表（单一，固定为第一个 kind='playlist'）
  playlistId: number | null
  playlistTracks: MusicFile[]
  loadPlaylists: () => Promise<void>
  createPlaylist: (name: string, kind?: 'playlist' | 'favorite') => Promise<void>
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
  // 播放列表专用（固定单一列表）
  addPlaylistTracks: (tracks: MusicFile[]) => void
  removePlaylistTrack: (id: number) => void
  reorderPlaylist: (from: number, to: number) => void
  reorderManyPlaylist: (ids: number[], toIndex: number) => void
  clearPlaylistTracks: () => void
  persistPlaylistTracks: (tracks: MusicFile[]) => void
  // 播放列表 = 唯一播放队列：点歌时若在列表则定位播放，否则追加到列表并播放
  playInPlaylist: (track: MusicFile) => void
  // 替换播放列表内容（模板播放如心情电台/随机/智能列表用）
  replacePlaylistTracks: (tracks: MusicFile[]) => void
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
  playlistId: null,
  playlistTracks: [],

  loadPlaylists: async () => {
    try {
      let list = await window.api.playlist.list()
      if (list.length === 0) {
        const def: Playlist = {
          id: Date.now(),
          name: t('playlist.defaultName'),
          trackIds: '[]',
          createdAt: new Date().toISOString(),
          kind: 'playlist'
        }
        await window.api.playlist.save(def)
        list = [def]
      }
      // 旧数据迁移：只保留第一个 kind='playlist' 作为播放列表，其余旧歌单自动转为收藏列表（避免数据丢失）
      const pls = list.filter((p) => p.kind === 'playlist')
      if (pls.length > 1) {
        const extra = pls.slice(1).map((p) => ({ ...p, kind: 'favorite' as const }))
        for (const p of extra) {
          await window.api.playlist.save(p)
        }
        list = list.map((p) => (pls.slice(1).some((x) => x.id === p.id) ? { ...p, kind: 'favorite' as const } : p))
      }
      // 播放列表：固定第一个 kind='playlist'
      const playlists = list.filter((p) => p.kind === 'playlist')
      const favorites = list.filter((p) => p.kind === 'favorite')
      const playlistId = playlists.length > 0 ? playlists[0].id : null
      const playlistMeta = playlists[0]
      const playlistTracks = playlistMeta ? await resolveTracks(parseIds(playlistMeta.trackIds)) : []
      // 收藏活动列表：第一个 favorite，或 null
      let activeId = get().activeId
      if (!favorites.some((p) => p.id === activeId)) activeId = favorites.length > 0 ? favorites[0].id : null
      const active = favorites.find((p) => p.id === activeId)
      const tracks = active ? await resolveTracks(parseIds(active.trackIds)) : []
      set({ playlists: list, playlistId, playlistTracks, activeId, playlist: tracks })
      usePlayerStore.getState().syncPlaylist(playlistTracks)
    } catch { /* ignore */ }
  },

  createPlaylist: async (name, kind = 'favorite') => {
    const playlist: Playlist = {
      id: Date.now(),
      name: name || t('playlist.newDefaultName'),
      trackIds: '[]',
      createdAt: new Date().toISOString(),
      kind
    }
    await window.api.playlist.save(playlist)
    if (kind === 'playlist') {
      set((s) => ({ playlists: [...s.playlists, playlist], playlistId: playlist.id, playlistTracks: [] }))
      usePlayerStore.getState().syncPlaylist([])
    } else {
      set((s) => ({ playlists: [...s.playlists, playlist], activeId: playlist.id, playlist: [] }))
    }
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
    let activeId = get().activeId
    if (activeId === id) {
      const favs = remaining.filter((p) => p.kind === 'favorite')
      activeId = favs.length > 0 ? favs[0].id : null
    }
    let playlistId = get().playlistId
    if (playlistId === id) {
      const pls = remaining.filter((p) => p.kind === 'playlist')
      playlistId = pls.length > 0 ? pls[0].id : null
    }
    const active = remaining.find((p) => p.id === activeId)
    const tracks = active ? await resolveTracks(parseIds(active.trackIds)) : []
    const plMeta = remaining.find((p) => p.id === playlistId)
    const plTracks = plMeta ? await resolveTracks(parseIds(plMeta.trackIds)) : []
    set({ playlists: remaining, activeId, playlist: tracks, playlistId, playlistTracks: plTracks })
    usePlayerStore.getState().syncPlaylist(plTracks)
  },

  selectPlaylist: async (id) => {
    if (get().activeId === id) return
    const active = get().playlists.find((p) => p.id === id)
    const tracks = active ? await resolveTracks(parseIds(active.trackIds)) : []
    set({ activeId: id, playlist: tracks })
  },

  persistTracks: (tracks: MusicFile[]) => {
    const activeId = get().activeId
    if (activeId === null) return
    const meta = get().playlists.find((p) => p.id === activeId)
    window.api.playlist.save({
      id: activeId,
      name: meta ? meta.name : t('playlist.newDefaultName'),
      trackIds: JSON.stringify(tracks.map((t) => t.id)),
      createdAt: meta ? meta.createdAt : new Date().toISOString(),
      kind: meta ? meta.kind : 'favorite'
    }).catch(() => {})
  },

  // 收藏列表操作（activeId）
  addTrack: (track: MusicFile) => {
    const state = get()
    if (state.activeId === null) return
    if (state.playlist.some((t) => t.id === track.id)) return
    const updated = [...state.playlist, track]
    set({ playlist: updated })
    get().persistTracks(updated)
  },

  addTracks: (tracks: MusicFile[]) => {
    const state = get()
    if (state.activeId === null) return
    const existingIds = new Set(state.playlist.map((t) => t.id))
    const newTracks = tracks.filter((t) => !existingIds.has(t.id))
    if (newTracks.length === 0) return
    const updated = [...state.playlist, ...newTracks]
    set({ playlist: updated })
    get().persistTracks(updated)
  },

  removeTrack: (id: number) => {
    const updated = get().playlist.filter((t) => t.id !== id)
    set({ playlist: updated })
    get().persistTracks(updated)
  },

  replaceTrack: (oldId: number, newTrack: MusicFile) => {
    const updated = get().playlist.map((t) => t.id === oldId ? newTrack : t)
    if (!updated.every((t, i) => t.id === get().playlist[i]?.id)) {
      set({ playlist: updated })
      get().persistTracks(updated)
    }
    // 同步固定播放列表（音源切换修复也应作用于播放列表）
    const plUpdated = get().playlistTracks.map((t) => t.id === oldId ? newTrack : t)
    if (!plUpdated.every((t, i) => t.id === get().playlistTracks[i]?.id)) {
      set({ playlistTracks: plUpdated })
      usePlayerStore.getState().syncPlaylist(plUpdated)
      get().persistPlaylistTracks(plUpdated)
    }
  },

  reorder: (from: number, to: number) => {
    const list = get().playlist
    if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return
    const updated = [...list]
    const [moved] = updated.splice(from, 1)
    updated.splice(to, 0, moved)
    set({ playlist: updated })
    get().persistTracks(updated)
  },

  reorderMany: (ids: number[], toIndex: number) => {
    const list = get().playlist
    if (ids.length === 0 || toIndex < 0 || toIndex >= list.length) return
    const idSet = new Set(ids)
    const target = list[toIndex]
    if (target && idSet.has(target.id)) return
    const moving = list.filter((t) => idSet.has(t.id))
    if (moving.length === 0) return
    const rest = list.filter((t) => !idSet.has(t.id))
    let insertAt = 0
    for (let i = 0; i < toIndex; i++) {
      if (!idSet.has(list[i].id)) insertAt++
    }
    const updated = [...rest.slice(0, insertAt), ...moving, ...rest.slice(insertAt)]
    set({ playlist: updated })
    get().persistTracks(updated)
  },

  clearPlaylist: () => {
    set({ playlist: [] })
    get().persistTracks([])
  },

  isInPlaylist: (id: number) => {
    return get().playlist.some((t) => t.id === id)
  },

  // 加入指定列表（不切换活动列表），返回实际新增数量
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
    if (get().playlistId === playlistId) {
      const merged = [...get().playlistTracks, ...newTracks]
      set({ playlistTracks: merged })
      usePlayerStore.getState().syncPlaylist(merged)
    }
    if (get().activeId === playlistId) {
      const merged = [...get().playlist, ...newTracks]
      set({ playlist: merged })
    }
    return newTracks.length
  },

  // ===== 播放列表（固定单一）=====
  persistPlaylistTracks: (tracks: MusicFile[]) => {
    const playlistId = get().playlistId
    if (playlistId === null) return
    const meta = get().playlists.find((p) => p.id === playlistId)
    window.api.playlist.save({
      id: playlistId,
      name: meta ? meta.name : t('playlist.defaultName'),
      trackIds: JSON.stringify(tracks.map((t) => t.id)),
      createdAt: meta ? meta.createdAt : new Date().toISOString(),
      kind: 'playlist'
    }).catch(() => {})
  },

  addPlaylistTracks: (tracks: MusicFile[]) => {
    const state = get()
    if (state.playlistId === null) return
    const existingIds = new Set(state.playlistTracks.map((t) => t.id))
    const newTracks = tracks.filter((t) => !existingIds.has(t.id))
    if (newTracks.length === 0) return
    const updated = [...state.playlistTracks, ...newTracks]
    set({ playlistTracks: updated })
    usePlayerStore.getState().syncPlaylist(updated)
    get().persistPlaylistTracks(updated)
  },

  removePlaylistTrack: (id: number) => {
    const updated = get().playlistTracks.filter((t) => t.id !== id)
    set({ playlistTracks: updated })
    usePlayerStore.getState().syncPlaylist(updated)
    get().persistPlaylistTracks(updated)
  },

  reorderPlaylist: (from: number, to: number) => {
    const list = get().playlistTracks
    if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return
    const updated = [...list]
    const [moved] = updated.splice(from, 1)
    updated.splice(to, 0, moved)
    set({ playlistTracks: updated })
    usePlayerStore.getState().syncPlaylist(updated)
    get().persistPlaylistTracks(updated)
  },

  reorderManyPlaylist: (ids: number[], toIndex: number) => {
    const list = get().playlistTracks
    if (ids.length === 0 || toIndex < 0 || toIndex >= list.length) return
    const idSet = new Set(ids)
    const target = list[toIndex]
    if (target && idSet.has(target.id)) return
    const moving = list.filter((t) => idSet.has(t.id))
    if (moving.length === 0) return
    const rest = list.filter((t) => !idSet.has(t.id))
    let insertAt = 0
    for (let i = 0; i < toIndex; i++) {
      if (!idSet.has(list[i].id)) insertAt++
    }
    const updated = [...rest.slice(0, insertAt), ...moving, ...rest.slice(insertAt)]
    set({ playlistTracks: updated })
    usePlayerStore.getState().syncPlaylist(updated)
    get().persistPlaylistTracks(updated)
  },

  clearPlaylistTracks: () => {
    set({ playlistTracks: [] })
    usePlayerStore.getState().syncPlaylist([])
    get().persistPlaylistTracks([])
  },

  // 播放列表 = 唯一播放队列：点歌时若在列表则定位播放，否则追加到列表并播放
  playInPlaylist: (track: MusicFile) => {
    const st = get()
    if (st.playlistTracks.some((t) => t.id === track.id)) {
      usePlayerStore.getState().playFromPlaylist(st.playlistTracks, track)
    } else {
      // 加入播放列表（内部会 syncPlaylist 到播放器），再以更新后的列表定位播放
      st.addPlaylistTracks([track])
      usePlayerStore.getState().playFromPlaylist(get().playlistTracks, track)
    }
  },

  // 替换播放列表内容（模板播放如心情电台/随机专辑/智能列表/收藏播放等）
  replacePlaylistTracks: (tracks: MusicFile[]) => {
    const st = get()
    if (st.playlistId === null) return
    set({ playlistTracks: tracks })
    usePlayerStore.getState().syncPlaylist(tracks)
    get().persistPlaylistTracks(tracks)
  }
}))
