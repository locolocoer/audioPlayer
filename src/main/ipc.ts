import { ipcMain, BrowserWindow, dialog, app } from 'electron'
import NodeID3 from 'node-id3'
import { createWebDAVClient, testConnection } from './webdav'
import { scanWebDAV, cancelScan, scanLocal } from './scanner'
import { setupFolderWatchers } from './folderWatch'
import { writeTagsToLocalMp3 } from './tags'
import {
  saveWebDAVConfig,
  getWebDAVConfigs,
  getAllWebDAVConfigs,
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
  recordPlay,
  getMusicFileById,
  getRecentMusicFiles,
  getDBPath,
  getDuplicateGroups,
  getStatsReport,
  getPlayTrend
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
    const row = getMusicFileById(id)
    let writeback: { attempted: boolean; ok: boolean; error?: string } = { attempted: false, ok: true }
    if (row) {
      const config = getAllWebDAVConfigs().find((c) => c.id === row.webdavId)
      if (config && config.sourceType === 'local') {
        const r = await writeTagsToLocalMp3(row.path, meta)
        writeback = { attempted: true, ok: r.ok, error: r.error }
      }
    }
    return { ok: true, writeback }
  })

  ipcMain.handle('music:recent', async (_event, limit?: number) => {
    return getRecentMusicFiles(limit || 200)
  })

  ipcMain.handle('music:recordPlay', async (_event, id: number) => {
    recordPlay(id)
    return true
  })

  ipcMain.handle('music:updateMetaBatch', async (_event, ids: number[], meta: { title?: string; artist?: string; album?: string }) => {
    let attempted = 0
    let failed = 0
    let firstError = ''
    for (const id of ids) {
      updateMusicFileMeta(id, meta)
      const row = getMusicFileById(id)
      if (row) {
        const config = getAllWebDAVConfigs().find((c) => c.id === row.webdavId)
        if (config && config.sourceType === 'local') {
          attempted++
          const r = await writeTagsToLocalMp3(row.path, meta)
          if (!r.ok) {
            failed++
            if (!firstError) firstError = r.error || '写入失败'
          }
        }
      }
    }
    return { ok: true, writeback: { attempted, failed, error: firstError } }
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

  ipcMain.handle('cache:info', async () => {
    const tempDir = path.join(os.tmpdir(), 'audioplayer-cache')
    try {
      if (!fs.existsSync(tempDir)) return { size: 0, files: [] }
      const files = fs.readdirSync(tempDir).map((name) => {
        const p = path.join(tempDir, name)
        let size = 0
        try { size = fs.statSync(p).size } catch { /* ignore */ }
        return { name, size }
      })
      const size = files.reduce((a, b) => a + b.size, 0)
      return { size, files }
    } catch {
      return { size: 0, files: [] }
    }
  })

  ipcMain.handle('cache:removeFile', async (_event, name: string) => {
    const tempDir = path.join(os.tmpdir(), 'audioplayer-cache')
    try {
      const safe = path.basename(name)
      const p = path.join(tempDir, safe)
      if (fs.existsSync(p)) fs.unlinkSync(p)
      return true
    } catch {
      return false
    }
  })

  // Backup
  ipcMain.handle('backup:export', async () => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    if (!win) return { ok: false, error: 'no window' }
    const defaultPath = path.join(app.getPath('documents'), `feiyu-music-backup-${new Date().toISOString().slice(0, 10)}.db`)
    const result = await dialog.showSaveDialog(win, {
      defaultPath,
      filters: [{ name: 'SQLite 数据库', extensions: ['db'] }]
    })
    if (result.canceled || !result.filePath) return { ok: false, error: 'cancelled' }
    try {
      fs.copyFileSync(getDBPath(), result.filePath)
      return { ok: true, path: result.filePath }
    } catch (err) {
      return { ok: false, error: (err instanceof Error ? err.message : String(err)) }
    }
  })

  // Duplicates
  ipcMain.handle('music:duplicates', async () => {
    return getDuplicateGroups()
  })

  // Stats
  ipcMain.handle('stats:report', async () => {
    return getStatsReport()
  })

  ipcMain.handle('stats:trend', async (_event, days?: number) => {
    return getPlayTrend(days || 30)
  })

  // MusicBrainz enrich
  ipcMain.handle('music:enrich', async (_event, id: number) => {
    const row = getMusicFileById(id)
    if (!row) return { ok: false }
    try {
      const name = (row.title || row.filename.replace(/\.[^.]+$/, '')).replace(/"/g, '')
      const artist = (row.artist || '').replace(/"/g, '')
      const query = `recording:"${name}"` + (artist ? ` AND artist:"${artist}"` : '')
      const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=1`
      const res = await fetch(url, {
        headers: { 'User-Agent': 'FeiYuMusic/0.7.0 (feiyu-music.local)' },
        signal: AbortSignal.timeout(10000)
      })
      if (!res.ok) return { ok: false }
      const data = await res.json()
      const rec = data && data.recordings && data.recordings[0]
      if (!rec) return { ok: false }
      const meta: { title?: string; artist?: string; album?: string } = {}
      if (rec.title) meta.title = rec.title
      const credit = rec['artist-credit']
      if (credit && credit[0] && (credit[0].name || credit[0].artist?.name)) {
        meta.artist = credit[0].name || credit[0].artist.name
      }
      const release = rec.releases && rec.releases[0]
      if (release && release.title) meta.album = release.title
      updateMusicFileMeta(id, meta)
      const config = getAllWebDAVConfigs().find((c) => c.id === row.webdavId)
      if (config && config.sourceType === 'local') {
        await writeTagsToLocalMp3(row.path, meta)
      }
      return { ok: true, meta }
    } catch {
      return { ok: false }
    }
  })

  // Save lyrics / cover
  ipcMain.handle('player:saveLyrics', async (_event, configId: string, filePath: string, text: string) => {
    try {
      const config = getAllWebDAVConfigs().find((c) => c.id === configId)
      if (!config || config.sourceType !== 'local') return { ok: false, error: '仅本地文件支持保存歌词' }
      const lrcPath = filePath.replace(/\.[^.]+$/, '.lrc')
      fs.writeFileSync(lrcPath, text, 'utf-8')
      return { ok: true, path: lrcPath }
    } catch (err) {
      return { ok: false, error: (err instanceof Error ? err.message : String(err)) }
    }
  })

  ipcMain.handle('player:saveCover', async (_event, configId: string, filePath: string, url: string) => {
    try {
      const config = getAllWebDAVConfigs().find((c) => c.id === configId)
      if (!config || config.sourceType !== 'local') return { ok: false, error: '仅本地文件支持保存封面' }
      if (!filePath.toLowerCase().endsWith('.mp3')) return { ok: false, error: '仅 MP3 支持写回封面' }
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
      if (!res.ok) return { ok: false, error: '封面下载失败' }
      const imageBuffer = Buffer.from(await res.arrayBuffer())
      const mime = res.headers.get('content-type') || 'image/jpeg'
      const result = await NodeID3.update({ image: { mime, imageBuffer, description: 'cover', type: { id: 3 } } }, filePath)
      return result ? { ok: true } : { ok: false, error: '写入失败' }
    } catch (err) {
      return { ok: false, error: (err instanceof Error ? err.message : String(err)) }
    }
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
