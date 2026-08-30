import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import type { BindParams, Statement } from 'sql.js'
import path from 'path'
import fs from 'fs'
import { app, safeStorage } from 'electron'
import { t2s } from 'chinese-s2t'
import type { WebDAVConfig, MusicFile, Playlist } from './types'

let db: SqlJsDatabase
let dbPath: string

// 播放历史保留上限：超出后自动裁剪最旧的记录，避免数据库无限膨胀
export const PLAY_HISTORY_MAX = 2000

const titleKeyCache = new Map<string, string>()
function toTitleKey(title: string): string {
  const cacheKey = title
  const cached = titleKeyCache.get(cacheKey)
  if (cached !== undefined) return cached
  const key = t2s(title || '')
  titleKeyCache.set(cacheKey, key)
  return key
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let dirty = false
// 串行化异步写盘，避免并发写乱序覆盖（较早快照后写覆盖较新快照）
let writeChain: Promise<void> = Promise.resolve()

function saveToDisk(): void {
  if (!db) return
  dirty = true
  if (saveTimer) return
  saveTimer = setTimeout(() => flushSaveToDisk(), 250)
}

function flushSaveToDisk(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (!dirty || !db) return
  dirty = false
  const data = db.export()
  // 异步写盘，避免同步写阻塞主进程（切歌时 recordPlay 触发）；写失败时保留 dirty 以便重试
  writeChain = writeChain.then(() => new Promise<void>((resolve) => {
    fs.writeFile(dbPath, Buffer.from(data), (err) => {
      if (err) {
        console.error('[DB] 写盘失败:', err)
        dirty = true
      }
      resolve()
    })
  }))
}

function flushSaveToDiskSync(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (!dirty || !db) return
  dirty = false
  const data = db.export()
  fs.writeFileSync(dbPath, Buffer.from(data))
}

export async function initDatabase(): Promise<void> {
  dbPath = path.join(app.getPath('userData'), 'audioplayer.db')

  const SQL = await initSqlJs()

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }

  db.run('PRAGMA journal_mode=WAL')
  db.run('PRAGMA foreign_keys=ON')

  db.run(`
    CREATE TABLE IF NOT EXISTS webdav_configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      username TEXT NOT NULL,
      password TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 80,
      enabled INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      sourceType TEXT NOT NULL DEFAULT 'webdav'
    )
  `)

  try {
    db.run('ALTER TABLE webdav_configs ADD COLUMN sourceType TEXT NOT NULL DEFAULT \'webdav\'')
  } catch { /* column already exists */ }

  db.run(`
    CREATE TABLE IF NOT EXISTS music_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL,
      filename TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      mtime TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      artist TEXT NOT NULL DEFAULT '',
      album TEXT NOT NULL DEFAULT '',
      duration REAL NOT NULL DEFAULT 0,
      webdavId TEXT NOT NULL,
      scannedAt TEXT NOT NULL,
      favorite INTEGER NOT NULL DEFAULT 0,
      UNIQUE(path, webdavId)
    )
  `)

  try {
    db.run('ALTER TABLE music_files ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0')
  } catch { /* column already exists */ }

  try {
    db.run('ALTER TABLE music_files ADD COLUMN title_key TEXT NOT NULL DEFAULT \'\'')
  } catch { /* column already exists */ }

  try {
    db.run('ALTER TABLE music_files ADD COLUMN playCount INTEGER NOT NULL DEFAULT 0')
  } catch { /* column already exists */ }

  try {
    db.run('ALTER TABLE music_files ADD COLUMN lastPlayed TEXT NOT NULL DEFAULT \'\'')
  } catch { /* column already exists */ }

  try {
    db.run('ALTER TABLE music_files ADD COLUMN rating INTEGER NOT NULL DEFAULT 0')
  } catch { /* column already exists */ }

  db.run(`
    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      trackIds TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'playlist'
    )
  `)

  // 迁移：旧库补充 kind 列
  try {
    const cols = queryAll<{ name: string }>('PRAGMA table_info(playlists)')
    if (!cols.some((c) => c.name === 'kind')) {
      db.run("ALTER TABLE playlists ADD COLUMN kind TEXT NOT NULL DEFAULT 'playlist'")
    }
  } catch { /* ignore */ }

  db.run(`
    CREATE TABLE IF NOT EXISTS source_prefs (
      title_key TEXT PRIMARY KEY,
      trackId INTEGER NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS play_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trackId INTEGER NOT NULL,
      playedAt TEXT NOT NULL
    )
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_play_history_playedAt ON play_history(playedAt)')

  db.run(`
    CREATE TABLE IF NOT EXISTS ai_tags (
      trackId INTEGER PRIMARY KEY,
      tags TEXT NOT NULL DEFAULT '[]',
      updatedAt TEXT NOT NULL DEFAULT ''
    )
  `)

  db.run('CREATE INDEX IF NOT EXISTS idx_music_webdav ON music_files(webdavId)')
  db.run('CREATE INDEX IF NOT EXISTS idx_music_title ON music_files(title)')
  db.run('CREATE INDEX IF NOT EXISTS idx_music_title_key ON music_files(title_key)')
  db.run('CREATE INDEX IF NOT EXISTS idx_music_artist ON music_files(artist)')

  db.run("DELETE FROM music_files WHERE filename LIKE '._%'")

  const missingKeys = queryAll<{ id: number; title: string; filename: string }>(
    'SELECT id, title, filename FROM music_files WHERE title_key = \'\''
  )
  if (missingKeys.length > 0) {
    for (const row of missingKeys) {
      db.run('UPDATE music_files SET title_key = ? WHERE id = ?',
        [toTitleKey(row.title || row.filename), row.id])
    }
  }

  flushSaveToDiskSync()
}

export function getDB(): SqlJsDatabase {
  return db
}

export function closeDatabase(): void {
  if (db) {
    flushSaveToDiskSync()
    db.close()
  }
}

function rowsToObjects<T>(result: { columns: string[]; values: unknown[][] }): T[] {
  return result.values.map((row) => {
    const obj: Record<string, unknown> = {}
    result.columns.forEach((col, idx) => {
      obj[col] = row[idx]
    })
    return obj as T
  })
}

function queryOne<T>(sql: string, params?: BindParams): T | undefined {
  const results = queryAll<T>(sql, params)
  return results[0]
}

function queryAll<T>(sql: string, params?: BindParams): T[] {
  let stmt: Statement | null = null
  try {
    stmt = db.prepare(sql)
    if (params) {
      stmt.bind(params)
    }
    const rows: T[] = []
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as unknown as T)
    }
    return rows
  } finally {
    if (stmt) stmt.free()
  }
}

// WebDAV Configs
function encryptPassword(plain: string): string {
  if (!plain) return plain
  if (plain.startsWith('enc:v1:')) return plain
  if (!safeStorage.isEncryptionAvailable()) return plain
  try {
    return 'enc:v1:' + safeStorage.encryptString(plain).toString('base64')
  } catch {
    return plain
  }
}

function decryptPassword(stored: string): string {
  if (!stored) return stored
  if (!stored.startsWith('enc:v1:')) return stored
  try {
    return safeStorage.decryptString(Buffer.from(stored.slice('enc:v1:'.length), 'base64'))
  } catch {
    return stored
  }
}

export function saveWebDAVConfig(config: WebDAVConfig): void {
  db.run(
    `INSERT OR REPLACE INTO webdav_configs (id, name, url, username, password, port, enabled, createdAt, sourceType)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [config.id, config.name, config.url, config.username, encryptPassword(config.password), config.port, config.enabled ? 1 : 0, config.createdAt, config.sourceType || 'webdav']
  )
  saveToDisk()
}

function decryptConfig(config: WebDAVConfig): WebDAVConfig {
  return { ...config, password: decryptPassword(config.password) }
}

export function getWebDAVConfigs(): WebDAVConfig[] {
  return queryAll<WebDAVConfig>('SELECT * FROM webdav_configs WHERE enabled = 1').map(decryptConfig)
}

export function getAllWebDAVConfigs(): WebDAVConfig[] {
  return queryAll<WebDAVConfig>('SELECT * FROM webdav_configs').map(decryptConfig)
}

export function deleteWebDAVConfig(id: string): void {
  db.run('DELETE FROM webdav_configs WHERE id = ?', [id])
  db.run('DELETE FROM music_files WHERE webdavId = ?', [id])
  db.run('DELETE FROM source_prefs WHERE trackId NOT IN (SELECT id FROM music_files)')
  saveToDisk()
}

export function clearAllMusicFiles(): void {
  db.run('DELETE FROM music_files')
  db.run('DELETE FROM source_prefs')
  saveToDisk()
}

export function deduplicateMusicFiles(): void {
  // 插入已按 (path, webdavId) 幂等，正常不会产生重复；此处仅清理历史脏数据中的同路径重复行，
  // 不按标题分组，避免误删同名不同曲或扫描器显式添加的替代音源（不同 path）。
  db.run(`
    DELETE FROM music_files
    WHERE id NOT IN (
      SELECT MIN(id) FROM music_files GROUP BY webdavId, path
    )
  `)
  saveToDisk()
}

// Music Files
export function insertMusicFile(file: Omit<MusicFile, 'id'>): void {
  const titleKey = toTitleKey(file.title || file.filename)
  const existing = queryOne<{ id: number }>(
    'SELECT id FROM music_files WHERE path = ? AND webdavId = ?',
    [file.path, file.webdavId]
  )
  if (existing) {
    // 已存在则 UPDATE，保留 id、favorite、playCount、lastPlayed 等关联数据
    db.run(
      `UPDATE music_files
       SET filename = ?, size = ?, mtime = ?, title = ?, title_key = ?, artist = ?, album = ?, duration = ?, scannedAt = ?
       WHERE id = ?`,
      [file.filename, file.size, file.mtime, file.title, titleKey, file.artist, file.album, file.duration, file.scannedAt, existing.id]
    )
  } else {
    db.run(
      `INSERT INTO music_files (path, filename, size, mtime, title, title_key, artist, album, duration, webdavId, scannedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [file.path, file.filename, file.size, file.mtime, file.title, titleKey, file.artist, file.album, file.duration, file.webdavId, file.scannedAt]
    )
  }
  saveToDisk()
}

export function findMusicFileByTitle(title: string, webdavId: string): MusicFile | undefined {
  return queryOne<MusicFile>(
    'SELECT * FROM music_files WHERE title = ? AND webdavId = ? LIMIT 1',
    [title, webdavId]
  )
}

export function replaceMusicFileSource(id: number, newPath: string, newFilename: string, newSize: number, newMtime: string, newScannedAt: string): void {
  db.run(
    'UPDATE music_files SET path = ?, filename = ?, size = ?, mtime = ?, scannedAt = ? WHERE id = ?',
    [newPath, newFilename, newSize, newMtime, newScannedAt, id]
  )
  saveToDisk()
}

export function fillEmptyMetaIfEmpty(id: number, meta: { title?: string; artist?: string; album?: string; duration?: number }): void {
  const row = queryOne<{ title: string; artist: string; album: string; duration: number }>(
    'SELECT title, artist, album, duration FROM music_files WHERE id = ?', [id]
  )
  if (!row) return
  const sets: string[] = []
  const vals: BindParams = []
  if (meta.title && !row.title) { sets.push('title = ?', 'title_key = ?'); vals.push(meta.title, toTitleKey(meta.title)) }
  if (meta.artist && !row.artist) { sets.push('artist = ?'); vals.push(meta.artist) }
  if (meta.album && !row.album) { sets.push('album = ?'); vals.push(meta.album) }
  if (meta.duration && !row.duration) { sets.push('duration = ?'); vals.push(meta.duration) }
  if (sets.length === 0) return
  vals.push(id)
  db.run(`UPDATE music_files SET ${sets.join(', ')} WHERE id = ?`, vals)
  saveToDisk()
}

export function getMusicFiles(webdavId?: string): MusicFile[] {
  const rows = webdavId
    ? queryAll<MusicFile>('SELECT * FROM music_files WHERE webdavId = ?', [webdavId])
    : queryAll<MusicFile>('SELECT * FROM music_files')

  const byKey = new Map<string, MusicFile>()
  for (const row of rows) {
    const key = row.title_key || row.title || row.filename
    const cur = byKey.get(key)
    if (!cur || row.id < cur.id) byKey.set(key, row)
  }

  if (!webdavId) {
    const prefs = getSourcePrefs()
    if (prefs.size > 0) {
      for (const row of rows) {
        const key = row.title_key || row.title || row.filename
        if (prefs.get(key) === row.id) byKey.set(key, row)
      }
    }
  }

  return Array.from(byKey.values()).sort((a, b) => {
    const ta = String(a.title_key || a.title || a.filename || '')
    const tb = String(b.title_key || b.title || b.filename || '')
    return ta.localeCompare(tb, 'zh')
  })
}

export function getExistingFilePaths(webdavId: string): Map<string, { mtime: string; size: number; id: number; hasArtist: boolean; hasAlbum: boolean; hasDuration: boolean }> {
  const rows = queryAll<{ path: string; mtime: string; size: number; id: number; artist: string; album: string; duration: number }>(
    'SELECT id, path, mtime, size, artist, album, duration FROM music_files WHERE webdavId = ?',
    [webdavId]
  )
  const map = new Map<string, { mtime: string; size: number; id: number; hasArtist: boolean; hasAlbum: boolean; hasDuration: boolean }>()
  for (const row of rows) {
    map.set(row.path, {
      mtime: row.mtime,
      size: row.size,
      id: row.id,
      hasArtist: !!(row.artist && row.artist.length > 0),
      hasAlbum: !!(row.album && row.album.length > 0),
      hasDuration: row.duration > 0
    })
  }
  return map
}

export function deleteMusicFileByPath(webdavId: string, filePath: string): void {
  db.run('DELETE FROM music_files WHERE webdavId = ? AND path = ?', [webdavId, filePath])
  saveToDisk()
}

export function updateMusicFileMetadata(webdavId: string, filePath: string, meta: { title?: string; artist?: string; album?: string; duration?: number }): void {
  const sets: string[] = []
  const vals: BindParams = []
  if (meta.title !== undefined) { sets.push('title = ?', 'title_key = ?'); vals.push(meta.title, toTitleKey(meta.title)) }
  if (meta.artist !== undefined) { sets.push('artist = ?'); vals.push(meta.artist) }
  if (meta.album !== undefined) { sets.push('album = ?'); vals.push(meta.album) }
  if (meta.duration !== undefined) { sets.push('duration = ?'); vals.push(meta.duration) }
  if (sets.length === 0) return
  vals.push(webdavId, filePath)
  db.run(`UPDATE music_files SET ${sets.join(', ')} WHERE webdavId = ? AND path = ?`, vals)
  saveToDisk()
}

export function getMusicFilesByIds(ids: number[]): MusicFile[] {
  if (ids.length === 0) return []
  const result: MusicFile[] = []
  const CHUNK = 500
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const placeholders = chunk.map(() => '?').join(',')
    result.push(...queryAll<MusicFile>(`SELECT * FROM music_files WHERE id IN (${placeholders})`, chunk))
  }
  return result
}

export function getMusicFileById(id: number): MusicFile | undefined {
  return queryOne<MusicFile>('SELECT * FROM music_files WHERE id = ?', [id])
}

export function getDBPath(): string {
  return dbPath
}

export function getDuplicateGroups(): { title: string; trackCount: number; tracks: MusicFile[] }[] {
  const rows = queryAll<MusicFile>('SELECT * FROM music_files')
  const map = new Map<string, MusicFile[]>()
  for (const r of rows) {
    const key = r.title_key || r.title || r.filename
    const list = map.get(key)
    if (list) list.push(r)
    else map.set(key, [r])
  }
  return Array.from(map.entries())
    .filter(([, list]) => list.length > 1)
    .map(([, list]) => ({
      title: list[0].title || list[0].filename,
      trackCount: list.length,
      tracks: list
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'zh'))
}

export function getRecentMusicFiles(limit: number): MusicFile[] {
  return queryAll<MusicFile>(
    `SELECT * FROM music_files
     WHERE lastPlayed != ''
     ORDER BY lastPlayed DESC
     LIMIT ?`,
    [Math.max(1, Math.min(500, limit))]
  )
}

export function getMusicFileCount(): number {
  const row = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM (
       SELECT 1 FROM music_files
       GROUP BY COALESCE(NULLIF(title_key, ''), NULLIF(title, ''), filename)
     )`
  )
  return row ? row.count : 0
}

export function findAlternativeSources(title: string, webdavId: string): MusicFile[] {
  return queryAll<MusicFile>(
    `SELECT * FROM music_files WHERE title_key = ?
     ORDER BY CASE WHEN webdavId = ? THEN 0 ELSE 1 END,
              CASE WHEN filename LIKE '%.mp3' THEN 0 ELSE 1 END,
              id`,
    [toTitleKey(title), webdavId]
  )
}

export function getSourcePrefs(): Map<string, number> {
  const rows = queryAll<{ title_key: string; trackId: number }>('SELECT title_key, trackId FROM source_prefs')
  const map = new Map<string, number>()
  for (const row of rows) map.set(row.title_key, row.trackId)
  return map
}

export function setSourcePref(title: string, trackId: number): void {
  db.run('INSERT OR REPLACE INTO source_prefs (title_key, trackId, updatedAt) VALUES (?, ?, ?)',
    [toTitleKey(title), trackId, new Date().toISOString()])
  saveToDisk()
}

export function toggleFavorite(id: number): boolean {
  const row = queryOne<{ favorite: number }>('SELECT favorite FROM music_files WHERE id = ?', [id])
  if (!row) return false
  const next = row.favorite ? 0 : 1
  db.run('UPDATE music_files SET favorite = ? WHERE id = ?', [next, id])
  saveToDisk()
  return next === 1
}

export function getFavoriteFiles(): MusicFile[] {
  return queryAll<MusicFile>('SELECT * FROM music_files WHERE favorite = 1 ORDER BY title')
}

export function setRating(id: number, rating: number): boolean {
  const r = Math.max(0, Math.min(5, Math.round(rating)))
  db.run('UPDATE music_files SET rating = ? WHERE id = ?', [r, id])
  saveToDisk()
  return true
}

export function recordPlay(id: number): void {
  const now = new Date().toISOString()
  db.run('UPDATE music_files SET playCount = playCount + 1, lastPlayed = ? WHERE id = ?', [now, id])
  db.run('INSERT INTO play_history (trackId, playedAt) VALUES (?, ?)', [id, now])
  // 裁剪超出上限的最旧记录（表最大 PLAY_HISTORY_MAX 行，开销可忽略）
  db.run(
    'DELETE FROM play_history WHERE id NOT IN (SELECT id FROM play_history ORDER BY playedAt DESC LIMIT ?)',
    [PLAY_HISTORY_MAX]
  )
  saveToDisk()
}

export function getPlayHistory(limit: number): { playedAt: string; track: MusicFile }[] {
  const rows = queryAll<{ playedAt: string; trackId: number }>(
    'SELECT playedAt, trackId FROM play_history ORDER BY playedAt DESC LIMIT ?',
    [Math.max(1, Math.min(1000, limit))]
  )
  const ids = [...new Set(rows.map((r) => r.trackId))]
  if (ids.length === 0) return []
  const placeholders = ids.map(() => '?').join(',')
  const tracks = queryAll<MusicFile>(`SELECT * FROM music_files WHERE id IN (${placeholders})`, ids)
  const map = new Map(tracks.map((t) => [t.id, t]))
  return rows
    .map((r) => ({ playedAt: r.playedAt, track: map.get(r.trackId) }))
    .filter((x): x is { playedAt: string; track: MusicFile } => !!x.track)
}

export function getStatsReport(): {
  totalPlays: number
  playedCount: number
  totalMinutes: number
  topSongs: MusicFile[]
  topArtists: { artist: string; plays: number }[]
  topAlbums: { album: string; plays: number }[]
} {
  const totalPlays = queryOne<{ c: number }>('SELECT COALESCE(SUM(playCount), 0) as c FROM music_files')?.c || 0
  const playedCount = queryOne<{ c: number }>('SELECT COUNT(*) as c FROM music_files WHERE playCount > 0')?.c || 0
  const totalMinutes = queryOne<{ c: number }>('SELECT COALESCE(SUM(playCount * duration), 0) as c FROM music_files')?.c || 0
  const topSongs = queryAll<MusicFile>('SELECT * FROM music_files WHERE playCount > 0 ORDER BY playCount DESC, lastPlayed DESC LIMIT 10')
  const topArtists = queryAll<{ artist: string; plays: number }>(
    'SELECT artist, SUM(playCount) as plays FROM music_files WHERE playCount > 0 AND artist != \'\' GROUP BY artist ORDER BY plays DESC LIMIT 10'
  )
  const topAlbums = queryAll<{ album: string; plays: number }>(
    'SELECT album, SUM(playCount) as plays FROM music_files WHERE playCount > 0 AND album != \'\' GROUP BY album ORDER BY plays DESC LIMIT 10'
  )
  return { totalPlays, playedCount, totalMinutes, topSongs, topArtists, topAlbums }
}

export function getPlayTrend(days: number): { date: string; plays: number }[] {
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const rows = queryAll<{ playedAt: string }>(
    'SELECT playedAt FROM play_history WHERE playedAt >= ?',
    [since]
  )
  const map = new Map<string, number>()
  for (const r of rows) {
    const d = new Date(r.playedAt)
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    map.set(date, (map.get(date) || 0) + 1)
  }
  return Array.from(map.entries())
    .map(([date, plays]) => ({ date, plays }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function updateMusicFileMeta(id: number, meta: { title?: string; artist?: string; album?: string }): void {
  const sets: string[] = []
  const vals: BindParams = []
  if (meta.title !== undefined) { sets.push('title = ?', 'title_key = ?'); vals.push(meta.title, toTitleKey(meta.title)) }
  if (meta.artist !== undefined) { sets.push('artist = ?'); vals.push(meta.artist) }
  if (meta.album !== undefined) { sets.push('album = ?'); vals.push(meta.album) }
  if (sets.length === 0) return
  vals.push(id)
  db.run(`UPDATE music_files SET ${sets.join(', ')} WHERE id = ?`, vals)
  saveToDisk()
}

// Playlists
export function savePlaylist(playlist: Playlist): void {
  db.run('INSERT OR REPLACE INTO playlists (id, name, trackIds, createdAt, kind) VALUES (?, ?, ?, ?, ?)',
    [playlist.id, playlist.name, playlist.trackIds, playlist.createdAt, playlist.kind || 'playlist'])
  saveToDisk()
}

export function getPlaylists(): Playlist[] {
  return queryAll<Playlist>('SELECT * FROM playlists ORDER BY createdAt DESC')
}

export function deletePlaylist(id: number): void {
  db.run('DELETE FROM playlists WHERE id = ?', [id])
  saveToDisk()
}

// AI 标签
export function getAiTags(): { trackId: number; tags: string[] }[] {
  const rows = queryAll<{ trackId: number; tags: string }>('SELECT trackId, tags FROM ai_tags')
  return rows.map((r) => {
    try {
      const parsed = JSON.parse(r.tags)
      return { trackId: r.trackId, tags: Array.isArray(parsed) ? parsed.map(String) : [] }
    } catch {
      return { trackId: r.trackId, tags: [] }
    }
  })
}

export function saveAiTags(batch: { trackId: number; tags: string[] }[]): void {
  const now = new Date().toISOString()
  for (const item of batch) {
    db.run(
      'INSERT OR REPLACE INTO ai_tags (trackId, tags, updatedAt) VALUES (?, ?, ?)',
      [item.trackId, JSON.stringify(item.tags.slice(0, 8)), now]
    )
  }
  saveToDisk()
}
