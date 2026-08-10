import { contextBridge, ipcRenderer } from 'electron'
import type { WebDAVConfig, MusicFile, ScanProgress, Playlist, ScanSettings } from '../main/types'

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
    favoriteList: (): Promise<MusicFile[]> => ipcRenderer.invoke('music:favorite:list'),
    updateMeta: (id: number, meta: { title?: string; artist?: string; album?: string }): Promise<boolean> =>
      ipcRenderer.invoke('music:updateMeta', id, meta),
    updateMetaBatch: (ids: number[], meta: { title?: string; artist?: string; album?: string }): Promise<boolean> =>
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
  window: {
    mini: (open: boolean): Promise<boolean> => ipcRenderer.invoke('window:mini', open),
    lyrics: (open: boolean): Promise<boolean> => ipcRenderer.invoke('window:lyrics', open)
  },
  log: (level: string, ...args: unknown[]): void => {
    ipcRenderer.send('log', level, ...args)
  },
  chooseFolder: (): Promise<{ path: string; name: string } | null> =>
    ipcRenderer.invoke('dialog:chooseFolder')
}

contextBridge.exposeInMainWorld('api', api)

export type AudioPlayerAPI = typeof api
