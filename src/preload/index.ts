import { contextBridge, ipcRenderer } from 'electron'
import type { WebDAVConfig, MusicFile, ScanProgress, Playlist, ScanSettings, AppInfo, UpdateStatus } from '../main/types'

const api = {
  webdav: {
    test: (config: WebDAVConfig): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('webdav:test', config),
    save: (config: WebDAVConfig): Promise<boolean> => ipcRenderer.invoke('webdav:save', config),
    list: (): Promise<WebDAVConfig[]> => ipcRenderer.invoke('webdav:list'),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('webdav:delete', id)
  },
  scan: {
    start: (config: WebDAVConfig, settings?: ScanSettings): Promise<number> => ipcRenderer.invoke('scan:start', config, settings),
    startLocal: (config: WebDAVConfig): Promise<number> => ipcRenderer.invoke('scan:local:start', config),
    cancel: (): Promise<boolean> => ipcRenderer.invoke('scan:cancel'),
    onProgress: (callback: (progress: ScanProgress) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: ScanProgress): void => callback(progress)
      ipcRenderer.on('scan:progress', handler)
      return () => ipcRenderer.removeListener('scan:progress', handler)
    },
    onAutoComplete: (callback: (configId: string) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, configId: string): void => callback(configId)
      ipcRenderer.on('scan:autoComplete', handler)
      return () => ipcRenderer.removeListener('scan:autoComplete', handler)
    }
  },
  music: {
    list: (webdavId?: string): Promise<MusicFile[]> => ipcRenderer.invoke('music:list', webdavId),
    byIds: (ids: number[]): Promise<MusicFile[]> => ipcRenderer.invoke('music:byIds', ids),
    count: (): Promise<number> => ipcRenderer.invoke('music:count'),
    toggleFavorite: (id: number): Promise<boolean> => ipcRenderer.invoke('music:favorite:toggle', id),
    setRating: (id: number, rating: number): Promise<boolean> => ipcRenderer.invoke('music:rating', id, rating),
    favoriteList: (): Promise<MusicFile[]> => ipcRenderer.invoke('music:favorite:list'),
    updateMeta: (id: number, meta: { title?: string; artist?: string; album?: string }): Promise<{ ok: boolean; writeback: { attempted: boolean; ok: boolean; error?: string } }> =>
      ipcRenderer.invoke('music:updateMeta', id, meta),
    updateMetaBatch: (ids: number[], meta: { title?: string; artist?: string; album?: string }): Promise<{ ok: boolean; writeback: { attempted: number; failed: number; error?: string } }> =>
      ipcRenderer.invoke('music:updateMetaBatch', ids, meta),
    duplicates: (): Promise<{ title: string; trackCount: number; tracks: MusicFile[] }[]> =>
      ipcRenderer.invoke('music:duplicates'),
    enrich: (id: number): Promise<{ ok: boolean; meta?: { title?: string; artist?: string; album?: string } }> =>
      ipcRenderer.invoke('music:enrich', id),
    recordPlay: (id: number): Promise<boolean> =>
      ipcRenderer.invoke('music:recordPlay', id),
    recent: (limit?: number): Promise<MusicFile[]> =>
      ipcRenderer.invoke('music:recent', limit),
    alternatives: (title: string, webdavId: string): Promise<MusicFile[]> =>
      ipcRenderer.invoke('music:alternatives', title, webdavId),
    setSourcePref: (title: string, trackId: number): Promise<boolean> =>
      ipcRenderer.invoke('music:setSourcePref', title, trackId)
  },
  playlist: {
    save: (playlist: Playlist): Promise<boolean> => ipcRenderer.invoke('playlist:save', playlist),
    list: (): Promise<Playlist[]> => ipcRenderer.invoke('playlist:list'),
    delete: (id: number): Promise<boolean> => ipcRenderer.invoke('playlist:delete', id)
  },
  player: {
    getAudioPath: (configId: string, filePath: string): Promise<{ localUrl?: string; error?: string }> =>
      ipcRenderer.invoke('player:getAudioPath', configId, filePath),
    getCover: (configId: string, filePath: string): Promise<{ data: number[]; format: string }> =>
      ipcRenderer.invoke('player:getCover', configId, filePath),
    getLrc: (configId: string, filePath: string): Promise<{ text: string }> =>
      ipcRenderer.invoke('player:getLrc', configId, filePath),
    getFallbackAudio: (configId: string, filePath: string): Promise<{ localUrl?: string; error?: string }> =>
      ipcRenderer.invoke('player:getFallbackAudio', configId, filePath),
    saveLyrics: (configId: string, filePath: string, text: string): Promise<{ ok: boolean; path?: string; error?: string }> =>
      ipcRenderer.invoke('player:saveLyrics', configId, filePath, text),
    saveCover: (configId: string, filePath: string, url: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('player:saveCover', configId, filePath, url),
    sendCommand: (cmd: string): Promise<boolean> => ipcRenderer.invoke('player:sendCommand', cmd),
    onCommand: (callback: (cmd: string) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, cmd: string): void => callback(cmd)
      ipcRenderer.on('player:command', handler)
      return () => ipcRenderer.removeListener('player:command', handler)
    },
    sendLyrics: (trackId: number, lrcText: string): void => ipcRenderer.send('lyrics:sync', trackId, lrcText),
    sendLyricsTime: (trackId: number, time: number): void => ipcRenderer.send('lyrics:time', trackId, time),
    onLyricsSync: (callback: (payload: { trackId: number; lrcText: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { trackId: number; lrcText: string }): void => callback(payload)
      ipcRenderer.on('lyrics:sync-broadcast', handler)
      return () => ipcRenderer.removeListener('lyrics:sync-broadcast', handler)
    },
    onLyricsTime: (callback: (payload: { trackId: number; time: number }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { trackId: number; time: number }): void => callback(payload)
      ipcRenderer.on('lyrics:time-broadcast', handler)
      return () => ipcRenderer.removeListener('lyrics:time-broadcast', handler)
    }
  },
  cache: {
    clear: (): Promise<boolean> => ipcRenderer.invoke('cache:clear'),
    info: (): Promise<{ size: number; files: { name: string; size: number }[] }> => ipcRenderer.invoke('cache:info'),
    removeFile: (name: string): Promise<boolean> => ipcRenderer.invoke('cache:removeFile', name)
  },
  backup: {
    export: (): Promise<{ ok: boolean; path?: string; error?: string }> => ipcRenderer.invoke('backup:export')
  },
  app: {
    info: (): Promise<AppInfo> => ipcRenderer.invoke('app:info'),
    getAutoLaunch: (): Promise<boolean> => ipcRenderer.invoke('app:getAutoLaunch'),
    setAutoLaunch: (enabled: boolean): Promise<boolean> => ipcRenderer.invoke('app:setAutoLaunch', enabled),
    getCloseBehavior: (): Promise<string> => ipcRenderer.invoke('app:getCloseBehavior'),
    setCloseBehavior: (v: string): Promise<string> => ipcRenderer.invoke('app:setCloseBehavior', v),
    getLang: (): Promise<string> => ipcRenderer.invoke('app:getLang'),
    setLang: (v: string): Promise<string> => ipcRenderer.invoke('app:setLang', v),
    onLangChange: (callback: (lang: string) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, lang: string): void => callback(lang)
      ipcRenderer.on('i18n:lang', handler)
      return () => ipcRenderer.removeListener('i18n:lang', handler)
    }
  },
  updater: {
    check: (): Promise<boolean> => ipcRenderer.invoke('update:check'),
    install: (): Promise<boolean> => ipcRenderer.invoke('update:install'),
    onStatus: (callback: (status: UpdateStatus) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, status: UpdateStatus): void => callback(status)
      ipcRenderer.on('update:status', handler)
      return () => ipcRenderer.removeListener('update:status', handler)
    }
  },
  stats: {
    report: (): Promise<{
      totalPlays: number
      playedCount: number
      totalMinutes: number
      topSongs: MusicFile[]
      topArtists: { artist: string; plays: number }[]
      topAlbums: { album: string; plays: number }[]
    }> => ipcRenderer.invoke('stats:report'),
    trend: (days?: number): Promise<{ date: string; plays: number }[]> => ipcRenderer.invoke('stats:trend', days)
  },
  window: {
    mini: (open: boolean): Promise<boolean> => ipcRenderer.invoke('window:mini', open),
    lyrics: (open: boolean): Promise<boolean> => ipcRenderer.invoke('window:lyrics', open),
    setFullscreen: (fullscreen: boolean): Promise<boolean> => ipcRenderer.invoke('window:setFullscreen', fullscreen),
    minimize: (): Promise<boolean> => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: (): Promise<boolean> => ipcRenderer.invoke('window:toggleMaximize'),
    close: (): Promise<boolean> => ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
    onMaximizedChange: (callback: (maximized: boolean) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, maximized: boolean): void => callback(maximized)
      ipcRenderer.on('window:maximized', handler)
      return () => ipcRenderer.removeListener('window:maximized', handler)
    }
  },
  log: (level: string, ...args: unknown[]): void => {
    ipcRenderer.send('log', level, ...args)
  },
  chooseFolder: (): Promise<{ path: string; name: string } | null> =>
    ipcRenderer.invoke('dialog:chooseFolder'),
  shell: {
    showItemInFolder: (path: string): Promise<boolean> => ipcRenderer.invoke('shell:showItemInFolder', path)
  },
  lrc: {
    search: (track: { title: string; artist: string; album: string; duration: number }): Promise<{ ok: boolean; lrc: string; error?: string }> =>
      ipcRenderer.invoke('lrc:search', track)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type AudioPlayerAPI = typeof api
