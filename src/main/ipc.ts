import { ipcMain, BrowserWindow, dialog, app, shell } from 'electron'
import NodeID3 from 'node-id3'
import { t2s } from 'chinese-s2t'
import { createWebDAVClient, testConnection } from './webdav'
import { scanWebDAV, cancelScan, scanLocal } from './scanner'
import { setupFolderWatchers } from './folderWatch'
import { writeTagsToLocalMp3 } from './tags'
import { mt } from './i18n'
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
  setRating,
  getMusicFileById,
  getRecentMusicFiles,
  getDBPath,
  getDuplicateGroups,
  getStatsReport,
  getPlayTrend,
  getPlayHistory,
  deleteMusicFileByPath,
  getAiTags,
  saveAiTags
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

  ipcMain.handle('music:rating', async (_event, id: number, rating: number) => {
    return setRating(id, rating)
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

  ipcMain.handle('music:playHistory', async (_event, limit?: number) => {
    return getPlayHistory(limit || 500)
  })

  ipcMain.handle('music:recordPlay', async (_event, id: number) => {
    recordPlay(id)
    return true
  })

  // 音频技术信息（采样率/位深/码率/编码器）：仅本地文件支持
  ipcMain.handle('music:audioInfo', async (_event, configId: string, filePath: string) => {
    try {
      const config = getAllWebDAVConfigs().find((c) => c.id === configId)
      if (!config || config.sourceType !== 'local') {
        return { ok: false, error: 'remote' }
      }
      const musicMetadata = await import('music-metadata')
      const metadata = await musicMetadata.parseFile(filePath, { skipCovers: true })
      const f = metadata.format
      return {
        ok: true,
        info: {
          container: f.container || '',
          codec: f.codec || '',
          sampleRate: f.sampleRate || 0,
          bitsPerSample: f.bitsPerSample || 0,
          bitrate: f.bitrate || 0,
          channels: f.numberOfChannels || 0
        }
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
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
            if (!firstError) firstError = r.error || mt('tag.writeFailed')
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

  // 歌单导出：保存为可分享的 JSON 文件
  ipcMain.handle('playlist:export', async (_event, payload: { playlist: Playlist; tracks: MusicFile[] }) => {
    try {
      const data = {
        app: 'feiyu-music',
        format: 1,
        name: payload.playlist.name,
        createdAt: payload.playlist.createdAt,
        tracks: payload.tracks.map((t) => ({
          title: t.title || t.filename,
          artist: t.artist || '',
          album: t.album || ''
        }))
      }
      const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: '导出歌单',
        defaultPath: `${payload.playlist.name.replace(/[\\/:*?"<>|]/g, '_')}.feiyu-playlist.json`,
        filters: [{ name: '飞鱼歌单', extensions: ['json'] }]
      })
      if (canceled || !filePath) return { ok: false, error: 'canceled' }
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
      return { ok: true, path: filePath }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // 歌单导入：读取分享的 JSON 歌单
  ipcMain.handle('playlist:import', async () => {
    try {
      const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
      const { canceled, filePaths } = await dialog.showOpenDialog(win, {
        title: '导入歌单',
        filters: [{ name: '飞鱼歌单', extensions: ['json'] }],
        properties: ['openFile']
      })
      if (canceled || filePaths.length === 0) return { ok: false, error: 'canceled' }
      const raw = fs.readFileSync(filePaths[0], 'utf-8')
      const parsed = JSON.parse(raw)
      if (!parsed || parsed.app !== 'feiyu-music' || !Array.isArray(parsed.tracks)) {
        return { ok: false, error: 'invalid' }
      }
      return {
        ok: true,
        name: String(parsed.name || '导入的歌单'),
        tracks: parsed.tracks
          .filter((t: unknown) => !!t && typeof t === 'object' && typeof (t as { title?: unknown }).title === 'string')
          .map((t: { title: string; artist?: unknown; album?: unknown }) => ({
            title: t.title,
            artist: typeof t.artist === 'string' ? t.artist : '',
            album: typeof t.album === 'string' ? t.album : ''
          }))
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
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
      filters: [{ name: mt('dialog.sqlite'), extensions: ['db'] }]
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

  // 删除曲库中的单曲（重复歌曲管理用）
  ipcMain.handle('music:deleteTrack', async (_event, id: number) => {
    const row = getMusicFileById(id)
    if (!row) return false
    deleteMusicFileByPath(row.webdavId, row.path)
    return true
  })

  // AI 标签：查询 / 批量保存
  ipcMain.handle('music:getAiTags', async () => {
    return getAiTags()
  })
  ipcMain.handle('music:saveAiTags', async (_e, batch: { trackId: number; tags: string[] }[]) => {
    saveAiTags(Array.isArray(batch) ? batch : [])
    return true
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
      if (!config || config.sourceType !== 'local') return { ok: false, error: mt('lrc.localOnly') }
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
      if (!config || config.sourceType !== 'local') return { ok: false, error: mt('cover.localOnly') }
      if (!filePath.toLowerCase().endsWith('.mp3')) return { ok: false, error: mt('cover.mp3Only') }
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
      if (!res.ok) return { ok: false, error: mt('cover.downloadFailed') }
      const imageBuffer = Buffer.from(await res.arrayBuffer())
      const mime = res.headers.get('content-type') || 'image/jpeg'
      const result = await NodeID3.update({ image: { mime, imageBuffer, description: 'cover', type: { id: 3 } } }, filePath)
      return result ? { ok: true } : { ok: false, error: mt('tag.writeFailed') }
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
      title: mt('dialog.chooseFolder')
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const folderPath = result.filePaths[0]
    const name = folderPath.split(/[/\\]/).pop() || folderPath
    return { path: folderPath, name }
  })

  ipcMain.handle('shell:showItemInFolder', async (_event, filePath: string) => {
    try {
      if (typeof filePath === 'string' && filePath) {
        shell.showItemInFolder(filePath)
        return true
      }
      return false
    } catch {
      return false
    }
  })

  ipcMain.handle('lrc:search', async (_event, track: { title: string; artist: string; album: string; duration: number }) => {
    try {
      const params = new URLSearchParams()
      if (track.title) params.set('track_name', track.title)
      if (track.artist) params.set('artist_name', track.artist)
      if (track.album) params.set('album_name', track.album)
      const url = `https://lrclib.net/api/search?${params.toString()}`
      const res = await fetch(url, {
        headers: { 'User-Agent': 'FeiYuMusic/1.0.0 (https://github.com/locolocoer/audioPlayer)' },
        signal: AbortSignal.timeout(10000)
      })
      if (!res.ok) return { ok: false, lrc: '', error: `HTTP ${res.status}` }
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        const best = data[0]
        const lrc = t2s(best.syncedLyrics || best.plainLyrics || '')
        if (lrc) return { ok: true, lrc }
      }
      return { ok: false, lrc: '', error: mt('lrc.notFound') }
    } catch (err) {
      return { ok: false, lrc: '', error: err instanceof Error ? err.message : String(err) }
    }
  })
}
