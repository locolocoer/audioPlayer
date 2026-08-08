import { create } from 'zustand'
import type { MusicFile, ScanProgress, WebDAVConfig, ScanSettings } from '../../main/types'

interface MusicState {
  tracks: MusicFile[]
  favorites: MusicFile[]
  configs: WebDAVConfig[]
  scanProgress: ScanProgress | null
  isScanning: boolean
  count: number

  loadConfigs: () => Promise<void>
  loadTracks: (webdavId?: string) => Promise<void>
  loadFavorites: () => Promise<void>
  loadCount: () => Promise<void>
  setScanProgress: (progress: ScanProgress) => void
  setIsScanning: (v: boolean) => void
  saveConfig: (config: WebDAVConfig) => Promise<void>
  deleteConfig: (id: string) => Promise<void>
  startScan: (config: WebDAVConfig, settings?: ScanSettings) => Promise<void>
  cancelScan: () => Promise<void>
  toggleFavorite: (id: number) => Promise<boolean>
  updateMeta: (id: number, meta: { title?: string; artist?: string; album?: string }) => Promise<void>
}

export const useMusicStore = create<MusicState>((set, get) => ({
  tracks: [],
  favorites: [],
  configs: [],
  scanProgress: null,
  isScanning: false,
  count: 0,

  loadConfigs: async () => {
    const configs = await window.api.webdav.list()
    set({ configs })
  },

  loadTracks: async (webdavId?: string) => {
    const tracks = await window.api.music.list(webdavId)
    set({ tracks })
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
    await get().loadCount()
  },

  startScan: async (config: WebDAVConfig, scanSettings?: ScanSettings) => {
    const unsubscribe = window.api.scan.onProgress((progress) => {
      set({ scanProgress: progress, isScanning: progress.status === 'scanning' })
      if (progress.status === 'completed' || progress.status === 'cancelled') {
        get().loadTracks()
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
    const favorites = await window.api.music.favoriteList()
    set({ favorites })
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

  updateMeta: async (id: number, meta) => {
    await window.api.music.updateMeta(id, meta)
    set((s) => ({
      tracks: s.tracks.map((t) => t.id === id ? { ...t, ...meta } : t),
      favorites: s.favorites.map((t) => t.id === id ? { ...t, ...meta } : t)
    }))
  }
}))
