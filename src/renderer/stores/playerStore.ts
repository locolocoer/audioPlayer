import { create } from 'zustand'
import type { MusicFile } from '../../main/types'
import { useMusicStore } from './musicStore'
import { usePlaylistStore } from './playlistStore'

export type PlayMode = 'sequential' | 'shuffle' | 'single' | 'heartbeat'

interface PlayerState {
  currentTrack: MusicFile | null
  pendingTrack: MusicFile | null
  isPlaying: boolean
  isLoading: boolean
  loadError: string | null
  currentTime: number
  duration: number
  volume: number
  playMode: PlayMode
  queue: MusicFile[]
  playlist: MusicFile[]
  audioSrc: string | null
  autoPlayBlocked: boolean
  sleepUntil: number | null

  requestPlay: (track: MusicFile) => void
  setAutoPlayBlocked: (blocked: boolean) => void
  setSleepTimer: (minutes: number | null) => void
  removeQueueItem: (id: number) => void
  reorderQueue: (from: number, to: number) => void
  setQueue: (tracks: MusicFile[]) => void
  playSelection: (tracks: MusicFile[], first?: MusicFile) => void
  pause: () => void
  resume: () => void
  next: () => void
  prev: () => void
  setVolume: (v: number) => void
  setCurrentTime: (t: number) => void
  setDuration: (d: number) => void
  togglePlayMode: () => void
  setPlayMode: (mode: PlayMode) => void
  seek: (time: number) => void
  syncPlaylist: (list: MusicFile[]) => void
  replaceTrack: (oldId: number, newTrack: MusicFile) => void
  onAudioLoaded: () => void
  onAudioError: (error: string) => void
  onAudioEnded: () => void
}

const MODE_ORDER: PlayMode[] = ['sequential', 'shuffle', 'single', 'heartbeat']

function getStoredVolume(): number {
  const saved = localStorage.getItem('player_volume')
  if (saved === null || saved === '') return 0.8
  const v = Number(saved)
  if (!Number.isFinite(v)) return 0.8
  return Math.max(0, Math.min(1, v))
}

function getStoredMode(): PlayMode {
  const m = localStorage.getItem('player_playMode')
  if (m === 'sequential' || m === 'shuffle' || m === 'single' || m === 'heartbeat') return m
  return 'sequential'
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  pendingTrack: null,
  isPlaying: false,
  isLoading: false,
  loadError: null,
  currentTime: 0,
  duration: 0,
  volume: getStoredVolume(),
  playMode: getStoredMode(),
  queue: [],
  playlist: [],
  audioSrc: null,
  autoPlayBlocked: false,
  sleepUntil: null,

  requestPlay: (track: MusicFile) => {
    const state = get()
    const effectiveQueue = state.playlist.length > 0
      ? state.playlist
      : state.queue.length > 0
        ? state.queue
        : useMusicStore.getState().tracks
    set({
      queue: effectiveQueue,
      pendingTrack: track,
      currentTrack: track,
      loadError: null,
      audioSrc: null,
      autoPlayBlocked: false,
      isLoading: true
    })
    localStorage.setItem('resume_track_id', String(track.id))
  },

  setAutoPlayBlocked: (blocked: boolean) => {
    set({ autoPlayBlocked: blocked })
  },

  setSleepTimer: (minutes: number | null) => {
    if (minutes === null) set({ sleepUntil: null })
    else set({ sleepUntil: Date.now() + minutes * 60000 })
  },

  removeQueueItem: (id: number) => {
    const s = get()
    if (s.playlist.length > 0) {
      usePlaylistStore.getState().removeTrack(id)
      return
    }
    set({ queue: s.queue.filter((t) => t.id !== id) })
  },

  reorderQueue: (from: number, to: number) => {
    const s = get()
    if (s.playlist.length > 0) {
      usePlaylistStore.getState().reorder(from, to)
      return
    }
    const q = s.queue
    if (from < 0 || from >= q.length || to < 0 || to >= q.length || from === to) return
    const updated = [...q]
    const [moved] = updated.splice(from, 1)
    updated.splice(to, 0, moved)
    set({ queue: updated })
  },

  setQueue: (tracks: MusicFile[]) => {
    const state = get()
    if (state.playlist.length > 0) return
    set({ queue: tracks })
  },

  playSelection: (tracks: MusicFile[], first?: MusicFile) => {
    if (tracks.length === 0) return
    set({ queue: tracks, playlist: [] })
    get().requestPlay(first || tracks[0])
  },

  pause: () => {
    set({ isPlaying: false })
    localStorage.setItem('resume_playing', '0')
  },
  resume: () => {
    set({ isPlaying: true })
    localStorage.setItem('resume_playing', '1')
  },

  next: async () => {
    const state = get()
    const effectiveQueue = state.playlist.length > 0
      ? state.playlist
      : state.queue.length > 0
        ? state.queue
        : useMusicStore.getState().tracks
    const { currentTrack, playMode } = state
    if (effectiveQueue.length === 0 || !currentTrack) return
    const idx = effectiveQueue.findIndex((t) => t.id === currentTrack.id)
    let nextTrack: MusicFile
    if (playMode === 'heartbeat') {
      let favs = useMusicStore.getState().favorites
      if (favs.length === 0) {
        await useMusicStore.getState().loadFavorites()
        favs = useMusicStore.getState().favorites
      }
      const pool = favs.length > 0 ? favs.filter((f) => f.id !== currentTrack.id) : []
      if (pool.length > 0) {
        const weights = pool.map((f) => (f.playCount || 0) + 1)
        const total = weights.reduce((a, b) => a + b, 0)
        let r = Math.random() * total
        let pick = pool[pool.length - 1]
        for (let i = 0; i < pool.length; i++) {
          r -= weights[i]
          if (r <= 0) {
            pick = pool[i]
            break
          }
        }
        nextTrack = pick
      } else {
        nextTrack = effectiveQueue[Math.floor(Math.random() * effectiveQueue.length)]
      }
    } else if (playMode === 'shuffle') {
      const pool = effectiveQueue.length > 1
        ? effectiveQueue.filter((t) => t.id !== currentTrack.id)
        : effectiveQueue
      nextTrack = pool[Math.floor(Math.random() * pool.length)]
    } else if (playMode === 'single') {
      nextTrack = effectiveQueue[idx >= 0 ? idx : 0]
    } else {
      nextTrack = effectiveQueue[idx >= 0 ? (idx + 1) % effectiveQueue.length : 0]
    }
    get().requestPlay(nextTrack)
  },

  prev: () => {
    const state = get()
    const effectiveQueue = state.playlist.length > 0
      ? state.playlist
      : state.queue.length > 0
        ? state.queue
        : useMusicStore.getState().tracks
    const { currentTrack } = state
    if (effectiveQueue.length === 0 || !currentTrack) return
    const idx = effectiveQueue.findIndex((t) => t.id === currentTrack.id)
    const prevIdx = idx > 0 ? idx - 1 : effectiveQueue.length - 1
    get().requestPlay(effectiveQueue[prevIdx])
  },

  setVolume: (v: number) => {
    localStorage.setItem('player_volume', String(v))
    set({ volume: v })
  },
  setCurrentTime: (t: number) => set({ currentTime: t }),
  setDuration: (d: number) => set({ duration: d }),

  togglePlayMode: () => {
    const current = get().playMode
    const nextIdx = (MODE_ORDER.indexOf(current) + 1) % MODE_ORDER.length
    get().setPlayMode(MODE_ORDER[nextIdx])
  },

  setPlayMode: (mode: PlayMode) => {
    localStorage.setItem('player_playMode', mode)
    if (mode === 'heartbeat') {
      useMusicStore.getState().loadFavorites()
    }
    set({ playMode: mode })
  },
  seek: (time: number) => {
    const t = Number.isFinite(time) ? Math.max(0, time) : 0
    set({ currentTime: t })
    window.dispatchEvent(new CustomEvent('audioplayer:seek', { detail: t }))
  },

  syncPlaylist: (list: MusicFile[]) => {
    set({ playlist: list })
  },

  replaceTrack: (oldId: number, newTrack: MusicFile) => {
    set((s) => ({
      currentTrack: s.currentTrack?.id === oldId ? newTrack : s.currentTrack,
      pendingTrack: s.pendingTrack?.id === oldId ? newTrack : s.pendingTrack,
      queue: s.queue.map((t) => t.id === oldId ? newTrack : t),
      playlist: s.playlist.map((t) => t.id === oldId ? newTrack : t)
    }))
  },

  onAudioLoaded: () => {
    set((s) => ({ isLoading: false, isPlaying: !s.autoPlayBlocked, loadError: null }))
  },

  onAudioError: (error: string) => {
    set({ isLoading: false, loadError: error, isPlaying: false })
  },

  onAudioEnded: () => {
    get().next()
  }
}))
