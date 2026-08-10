import { ipcMain, BrowserWindow, dialog } from 'electron'
import { createWebDAVClient, testConnection } from './webdav'
import { scanWebDAV, cancelScan, scanLocal } from './scanner'
import { setupFolderWatchers } from './folderWatch'
import {
  saveWebDAVConfig,
  getWebDAVConfigs,
  deleteWebDAVConfig,
  getMusicFiles,
  getMusicFilesByIds,
  getMusicFileCount,
  clearAllMusicFiles,
  savePlaylist,
  getPlaylists,
  deletePlaylist,
  toggleFavorite,
  getFavoriteFiles,
  updateMusicFileMeta,
  findAlternativeSources,
  setSourcePref,
  recordPlay
} from './database'
import type { WebDAVConfig, MusicFile, ScanProgress, Playlist, ScanSettings } from './types'
import fs from 'fs'
import path from 'path'
import os from 'os'

let currentScanClient: ReturnType<typeof createWebDAVClient> | null = null

export function registerIpcHandlers(): void {
  // WebDAV Config
  ipcMain.handle('webdav:test', async (_event, config: WebDAVConfig) => {
    return testConnection(config)
  })

  ipcMain.handle('webdav:save', async (_event, config: WebDAVConfig) => {
    saveWebDAVConfig(config)
    setupFolderWatchers()
    return true
  })

  ipcMain.handle('webdav:list', async () => {
    return getWebDAVConfigs()
  })

  ipcMain.handle('webdav:delete', async (_event, id: string) => {
    deleteWebDAVConfig(id)
    setupFolderWatchers()
    return true
  })

  // Scan
  ipcMain.handle('scan:start', async (event, config: WebDAVConfig, scanSettings?: ScanSettings) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const client = createWebDAVClient(config)
    currentScanClient = client

    const count = await scanWebDAV(config, client, (progress: ScanProgress) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('scan:progress', progress)
      }
    }, scanSettings)

    return count
  })

  ipcMain.handle('scan:cancel', async () => {
    cancelScan()
    return true
  })

  ipcMain.handle('scan:local:start', async (event, config: WebDAVConfig) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const count = await scanLocal(config, (progress: ScanProgress) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('scan:progress', progress)
      }
    })
    return count
  })

  // Music Files
  ipcMain.handle('music:list', async (_event, webdavId?: string) => {
    return getMusicFiles(webdavId)
  })

  ipcMain.handle('music:byIds', async (_event, ids: number[]) => {
    return getMusicFilesByIds(ids)
  })

  ipcMain.handle('music:count', async () => {
    return getMusicFileCount()
  })

  ipcMain.handle('music:favorite:toggle', async (_event, id: number) => {
    return toggleFavorite(id)
  })

  ipcMain.handle('music:favorite:list', async () => {
    return getFavoriteFiles()
  })

  ipcMain.handle('music:updateMeta', async (_event, id: number, meta: { title?: string; artist?: string; album?: string }) => {
    updateMusicFileMeta(id, meta)
    return true
  })

  ipcMain.handle('music:recordPlay', async (_event, id: number) => {
    recordPlay(id)
    return true
  })

  ipcMain.handle('music:alternatives', async (_event, title: string, webdavId: string) => {
    return findAlternativeSources(title, webdavId)
  })

  ipcMain.handle('music:setSourcePref', async (_event, title: string, trackId: number) => {
    setSourcePref(title, trackId)
    return true
  })

  // Playlist
  ipcMain.handle('playlist:save', async (_event, playlist: Playlist) => {
    savePlaylist(playlist)
    return true
  })

  ipcMain.handle('playlist:list', async () => {
    return getPlaylists()
  })

  ipcMain.handle('playlist:delete', async (_event, id: number) => {
    deletePlaylist(id)
    return true
  })

  // Cache
  ipcMain.handle('cache:clear', async () => {
    clearAllMusicFiles()
    const tempDir = path.join(os.tmpdir(), 'audioplayer-cache')
    try {
      if (fs.existsSync(tempDir)) {
        const files = fs.readdirSync(tempDir)
        for (const file of files) {
          fs.unlinkSync(path.join(tempDir, file))
        }
      }
    } catch { /* ignore */ }
    return true
  })

  // Log from renderer to terminal
  ipcMain.on('log', (_event, level: string, ...args: unknown[]) => {
    const prefix = `[Renderer:${level}]`
    if (level === 'error') {
      console.error(prefix, ...args)
    } else {
      console.log(prefix, ...args)
    }
  })

  ipcMain.handle('dialog:chooseFolder', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: '选择本地音乐文件夹'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const folderPath = result.filePaths[0]
    const name = folderPath.split(/[/\\]/).pop() || folderPath
    return { path: folderPath, name }
  })
}
