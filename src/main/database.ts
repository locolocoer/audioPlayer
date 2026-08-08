import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import type { WebDAVConfig, MusicFile, Playlist } from './types'

let db: SqlJsDatabase
let dbPath: string

function saveToDisk(): void {
  if (db) {
    const data = db.export()
    const buffer = Buffer.from(data)
    fs.writeFileSync(dbPath, buffer)
  }
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

  db.run(`
    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      trackIds TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL
    )
  `)

  db.run('CREATE INDEX IF NOT EXISTS idx_music_webdav ON music_files(webdavId)')
  db.run('CREATE INDEX IF NOT EXISTS idx_music_title ON music_files(title)')
  db.run('CREATE INDEX IF NOT EXISTS idx_music_artist ON music_files(artist)')

  saveToDisk()
}

export function getDB(): SqlJsDatabase {
  return db
}

export function closeDatabase(): void {
  if (db) {
    saveToDisk()
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

function queryOne<T>(sql: string, params?: unknown[]): T | undefined {
  const results = queryAll<T>(sql, params)
  return results[0]
}

function queryAll<T>(sql: string, params?: unknown[]): T[] {
  let stmt: { bind?: (params: unknown[]) => boolean; step: () => boolean; getAsObject: () => Record<string, unknown>; free: () => void } | null = null
  try {
    stmt = db.prepare(sql)
    if (params && stmt.bind) {
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
export function saveWebDAVConfig(config: WebDAVConfig): void {
  db.run(
    `INSERT OR REPLACE INTO webdav_configs (id, name, url, username, password, port, enabled, createdAt, sourceType)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [config.id, config.name, config.url, config.username, config.password, config.port, config.enabled ? 1 : 0, config.createdAt, config.sourceType || 'webdav']
  )
  saveToDisk()
}

export function getWebDAVConfigs(): WebDAVConfig[] {
  return queryAll<WebDAVConfig>('SELECT * FROM webdav_configs WHERE enabled = 1')
}

export function deleteWebDAVConfig(id: string): void {
  db.run('DELETE FROM webdav_configs WHERE id = ?', [id])
  db.run('DELETE FROM music_files WHERE webdavId = ?', [id])
  saveToDisk()
}

export function clearAllMusicFiles(): void {
  db.run('DELETE FROM music_files')
  saveToDisk()
}

export function deduplicateMusicFiles(): void {
  db.run(`
    DELETE FROM music_files
    WHERE id NOT IN (
      SELECT MIN(id) FROM music_files GROUP BY webdavId, title
    )
  `)
  saveToDisk()
}

// Music Files
export function insertMusicFile(file: Omit<MusicFile, 'id'>): void {
  db.run(
    `INSERT OR REPLACE INTO music_files (path, filename, size, mtime, title, artist, album, duration, webdavId, scannedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [file.path, file.filename, file.size, file.mtime, file.title, file.artist, file.album, file.duration, file.webdavId, file.scannedAt]
  )
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
  const vals: unknown[] = []
  if (meta.title && (!row.title || row.title === meta.title)) { sets.push('title = ?'); vals.push(meta.title) }
  if (meta.artist && !row.artist) { sets.push('artist = ?'); vals.push(meta.artist) }
  if (meta.album && !row.album) { sets.push('album = ?'); vals.push(meta.album) }
  if (meta.duration && !row.duration) { sets.push('duration = ?'); vals.push(meta.duration) }
  if (sets.length === 0) return
  vals.push(id)
  db.run(`UPDATE music_files SET ${sets.join(', ')} WHERE id = ?`, vals)
  saveToDisk()
}

export function getMusicFiles(webdavId?: string): MusicFile[] {
  if (webdavId) {
    return queryAll<MusicFile>(
      'SELECT * FROM music_files WHERE webdavId = ? AND id IN (SELECT MIN(id) FROM music_files GROUP BY webdavId, title) ORDER BY title',
      [webdavId]
    )
  }
  return queryAll<MusicFile>(
    'SELECT * FROM music_files WHERE id IN (SELECT MIN(id) FROM music_files GROUP BY webdavId, title) ORDER BY title'
  )
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
}

export function updateMusicFileMetadata(webdavId: string, filePath: string, meta: { title?: string; artist?: string; album?: string; duration?: number }): void {
  const sets: string[] = []
  const vals: unknown[] = []
  if (meta.title !== undefined) { sets.push('title = ?'); vals.push(meta.title) }
  if (meta.artist !== undefined) { sets.push('artist = ?'); vals.push(meta.artist) }
  if (meta.album !== undefined) { sets.push('album = ?'); vals.push(meta.album) }
  if (meta.duration !== undefined) { sets.push('duration = ?'); vals.push(meta.duration) }
  if (sets.length === 0) return
  vals.push(webdavId, filePath)
  db.run(`UPDATE music_files SET ${sets.join(', ')} WHERE webdavId = ? AND path = ?`, vals)
  saveToDisk()
}

export function getMusicFileCount(): number {
  const row = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM music_files')
  return row ? row.count : 0
}

export function findAlternativeSources(title: string, webdavId: string): MusicFile[] {
  return queryAll<MusicFile>(
    'SELECT * FROM music_files WHERE title = ? AND webdavId = ? ORDER BY CASE WHEN filename LIKE \'%.mp3\' THEN 0 ELSE 1 END, id',
    [title, webdavId]
  )
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

export function updateMusicFileMeta(id: number, meta: { title?: string; artist?: string; album?: string }): void {
  const sets: string[] = []
  const vals: unknown[] = []
  if (meta.title !== undefined) { sets.push('title = ?'); vals.push(meta.title) }
  if (meta.artist !== undefined) { sets.push('artist = ?'); vals.push(meta.artist) }
  if (meta.album !== undefined) { sets.push('album = ?'); vals.push(meta.album) }
  if (sets.length === 0) return
  vals.push(id)
  db.run(`UPDATE music_files SET ${sets.join(', ')} WHERE id = ?`, vals)
  saveToDisk()
}

// Playlists
export function savePlaylist(playlist: Playlist): void {
  db.run('INSERT OR REPLACE INTO playlists (id, name, trackIds, createdAt) VALUES (?, ?, ?, ?)',
    [playlist.id, playlist.name, playlist.trackIds, playlist.createdAt])
  saveToDisk()
}

export function getPlaylists(): Playlist[] {
  return queryAll<Playlist>('SELECT * FROM playlists ORDER BY createdAt DESC')
}

export function deletePlaylist(id: number): void {
  db.run('DELETE FROM playlists WHERE id = ?', [id])
  saveToDisk()
}
