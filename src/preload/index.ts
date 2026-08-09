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
      ipcRenderer.invoke('player:getLrc', configId, filePath)
  },
  cache: {
    clear: (): Promise<boolean> => ipcRenderer.invoke('cache:clear')
  },
  log: (level: string, ...args: unknown[]): void => {
    ipcRenderer.send('log', level, ...args)
  },
  chooseFolder: (): Promise<{ path: string; name: string } | null> =>
    ipcRenderer.invoke('dialog:chooseFolder')
}

contextBridge.exposeInMainWorld('api', api)

export type AudioPlayerAPI = typeof api
