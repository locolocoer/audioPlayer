import { create } from 'zustand'
import type { MusicFile } from '../../main/types'
import { useMusicStore } from './musicStore'

export type PlayMode = 'sequential' | 'shuffle' | 'single'

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

  requestPlay: (track: MusicFile) => void
  setQueue: (tracks: MusicFile[]) => void
  pause: () => void
  resume: () => void
  next: () => void
  prev: () => void
  setVolume: (v: number) => void
  setCurrentTime: (t: number) => void
  setDuration: (d: number) => void
  togglePlayMode: () => void
  seek: (time: number) => void
  syncPlaylist: (list: MusicFile[]) => void
  onAudioLoaded: () => void
  onAudioError: (error: string) => void
  onAudioEnded: () => void
}

const MODE_ORDER: PlayMode[] = ['sequential', 'shuffle', 'single']

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  pendingTrack: null,
  isPlaying: false,
  isLoading: false,
  loadError: null,
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  playMode: 'sequential',
  queue: [],
  playlist: [],
  audioSrc: null,

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
      audioSrc: null
    })
  },

  setQueue: (tracks: MusicFile[]) => {
    const state = get()
    if (state.playlist.length > 0) return
    set({ queue: tracks })
  },

  pause: () => set({ isPlaying: false }),
  resume: () => set({ isPlaying: true }),

  next: () => {
    const state = get()
    const effectiveQueue = state.playlist.length > 0
      ? state.playlist
      : state.queue.length > 0
        ? state.queue
        : useMusicStore.getState().tracks
    const { currentTrack, playMode } = state
    if (effectiveQueue.length === 0 || !currentTrack) return
    const idx = effectiveQueue.findIndex((t) => t.id === currentTrack.id)
    let nextIdx: number
    if (playMode === 'shuffle') {
      nextIdx = Math.floor(Math.random() * effectiveQueue.length)
    } else if (playMode === 'single') {
      nextIdx = idx >= 0 ? idx : 0
    } else {
      nextIdx = idx >= 0 ? (idx + 1) % effectiveQueue.length : 0
    }
    get().requestPlay(effectiveQueue[nextIdx])
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

  setVolume: (v: number) => set({ volume: v }),
  setCurrentTime: (t: number) => set({ currentTime: t }),
  setDuration: (d: number) => set({ duration: d }),

  togglePlayMode: () => {
    const current = get().playMode
    const nextIdx = (MODE_ORDER.indexOf(current) + 1) % MODE_ORDER.length
    set({ playMode: MODE_ORDER[nextIdx] })
  },
  seek: (time: number) => {
    set({ currentTime: time })
    window.dispatchEvent(new CustomEvent('audioplayer:seek', { detail: time }))
  },

  syncPlaylist: (list: MusicFile[]) => {
    set({ playlist: list })
  },

  onAudioLoaded: () => {
    set({ isLoading: false, isPlaying: true })
  },

  onAudioError: (error: string) => {
    set({ isLoading: false, loadError: error, isPlaying: false })
  },

  onAudioEnded: () => {
    get().next()
  }
}))
