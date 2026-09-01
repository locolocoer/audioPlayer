import { create } from 'zustand'
import type { MusicFile, ScanProgress, WebDAVConfig, ScanSettings } from '../../main/types'
import { usePlayerStore } from './playerStore'
import { usePlaylistStore } from './playlistStore'
import { useToastStore } from './toastStore'
import { t } from '../i18n'

let scanProgressUnsub: (() => void) | null = null

interface MusicState {
  tracks: MusicFile[]
  tracksLoaded: boolean
  favorites: MusicFile[]
  configs: WebDAVConfig[]
  scanProgress: ScanProgress | null
  isScanning: boolean
  count: number

  loadConfigs: () => Promise<void>
  loadTracks: (webdavId?: string, force?: boolean) => Promise<void>
  loadFavorites: () => Promise<void>
  loadCount: () => Promise<void>
  setScanProgress: (progress: ScanProgress) => void
  setIsScanning: (v: boolean) => void
  saveConfig: (config: WebDAVConfig) => Promise<void>
  deleteConfig: (id: string) => Promise<void>
  startScan: (config: WebDAVConfig, settings?: ScanSettings) => Promise<void>
  cancelScan: () => Promise<void>
  toggleFavorite: (id: number) => Promise<boolean>
  setRating: (id: number, rating: number) => Promise<void>
  updateMeta: (id: number, meta: { title?: string; artist?: string; album?: string }) => Promise<void>
  updateMetaBatch: (ids: number[], meta: { title?: string; artist?: string; album?: string }) => Promise<void>
  switchTrackSource: (oldTrackId: number, newTrack: MusicFile) => Promise<void>
}

export const useMusicStore = create<MusicState>((set, get) => ({
  tracks: [],
  tracksLoaded: false,
  favorites: [],
  configs: [],
  scanProgress: null,
  isScanning: false,
  count: 0,

  loadConfigs: async () => {
    const configs = await window.api.webdav.list()
    set({ configs })
  },

  loadTracks: async (webdavId?: string, force = false) => {
    if (!force && get().tracksLoaded) return
    const tracks = await window.api.music.list(webdavId)
    set({ tracks, tracksLoaded: true })
  },

  loadCount: async () => {
    const count = await window.api.music.count()
    set({ count })
  },

  setScanProgress: (progress: ScanProgress) => {
    set({ scanProgress: progress, isScanning: progress.status === 'scanning' })
  },

  setIsScanning: (v: boolean) => {
    set({ isScanning: v })
  },

  saveConfig: async (config: WebDAVConfig) => {
    await window.api.webdav.save(config)
    await get().loadConfigs()
  },

  deleteConfig: async (id: string) => {
    await window.api.webdav.delete(id)
    await get().loadConfigs()
    await get().loadTracks(undefined, true)
    await get().loadCount()
  },

  startScan: async (config: WebDAVConfig, scanSettings?: ScanSettings) => {
    if (scanProgressUnsub) scanProgressUnsub()
    scanProgressUnsub = window.api.scan.onProgress((progress) => {
      set({ scanProgress: progress, isScanning: progress.status === 'scanning' })
      if (progress.status === 'completed' || progress.status === 'cancelled') {
        get().loadTracks(undefined, true)
        get().loadCount()
      }
    })
    set({ isScanning: true })
    if (config.sourceType === 'local') {
      await window.api.scan.startLocal(config)
    } else {
      await window.api.scan.start(config, scanSettings)
    }
  },

  cancelScan: async () => {
    await window.api.scan.cancel()
    set({ isScanning: false })
  },

  loadFavorites: async () => {
    try {
      const favorites = await window.api.music.favoriteList()
      set({ favorites })
    } catch {
      // 拉取失败时保留现有收藏，避免 heartbeat 等调用方出现未处理拒绝
    }
  },

  toggleFavorite: async (id: number) => {
    const result = await window.api.music.toggleFavorite(id)
    if (result !== undefined) {
      set((s) => ({
        tracks: s.tracks.map((t) => t.id === id ? { ...t, favorite: result ? 1 : 0 } : t),
        favorites: result ? [...s.favorites, ...s.tracks.filter((t) => t.id === id)] : s.favorites.filter((t) => t.id !== id)
      }))
    }
    return result
  },

  setRating: async (id: number, rating: number) => {
    await window.api.music.setRating(id, rating)
    set((s) => ({
      tracks: s.tracks.map((t) => t.id === id ? { ...t, rating } : t),
      favorites: s.favorites.map((t) => t.id === id ? { ...t, rating } : t)
    }))
  },

  updateMeta: async (id: number, meta) => {
    const res = await window.api.music.updateMeta(id, meta)
    if (res && res.writeback) {
      const wb = res.writeback
      if (wb.attempted) {
        if (wb.ok) useToastStore.getState().addToast(t('music.writebackOk'), 'success')
        else useToastStore.getState().addToast(t('music.writebackFailed', { msg: wb.error || t('music.writebackUnknown') }), 'error')
      }
    }
    set((s) => ({
      tracks: s.tracks.map((t) => t.id === id ? { ...t, ...meta } : t),
      favorites: s.favorites.map((t) => t.id === id ? { ...t, ...meta } : t)
    }))
  },

  updateMetaBatch: async (ids: number[], meta) => {
    if (ids.length === 0) return
    const res = await window.api.music.updateMetaBatch(ids, meta)
    if (res && res.writeback && res.writeback.attempted > 0) {
      if (res.writeback.failed === 0) {
        useToastStore.getState().addToast(t('music.writebackBatchOk', { n: res.writeback.attempted }), 'success')
      } else {
        useToastStore.getState().addToast(t('music.writebackBatchFailed', { failed: res.writeback.failed, total: res.writeback.attempted, msg: res.writeback.error || t('music.writebackUnknown') }), 'error')
      }
    }
    const idSet = new Set(ids)
    set((s) => ({
      tracks: s.tracks.map((t) => idSet.has(t.id) ? { ...t, ...meta } : t),
      favorites: s.favorites.map((t) => idSet.has(t.id) ? { ...t, ...meta } : t)
    }))
  },

  switchTrackSource: async (oldTrackId: number, newTrack: MusicFile) => {
    await window.api.music.setSourcePref(newTrack.title, newTrack.id)
    set((s) => ({
      tracks: s.tracks.map((t) => t.id === oldTrackId ? newTrack : t),
      favorites: s.favorites.map((t) => t.id === oldTrackId ? newTrack : t)
    }))
    usePlayerStore.getState().replaceTrack(oldTrackId, newTrack)
    usePlaylistStore.getState().replaceTrack(oldTrackId, newTrack)
  }
}))
