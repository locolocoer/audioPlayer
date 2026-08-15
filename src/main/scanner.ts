import type { WebDAVClient } from 'webdav'
import { getDirectoryContents, downloadFile } from './webdav'
import { insertMusicFile, getExistingFilePaths, deleteMusicFileByPath, deduplicateMusicFiles, updateMusicFileMetadata, findMusicFileByTitle, fillEmptyMetaIfEmpty, findAlternativeSources } from './database'
import { SUPPORTED_EXTENSIONS } from './types'
import type { ScanProgress, MusicFile, WebDAVConfig, ScanSettings } from './types'
import { DEFAULT_SCAN_SETTINGS } from './types'

const MAX_META_DOWNLOAD = 30 * 1024 * 1024

let activeGeneration = 0

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function retryGetDirectoryContents(client: WebDAVClient, dirPath: string, settings: ScanSettings): ReturnType<typeof getDirectoryContents> {
  for (let attempt = 0; attempt < settings.maxRetries; attempt++) {
    try {
      return await getDirectoryContents(client, dirPath)
    } catch (err) {
      const errObj = err as Error & { code?: string }
      const codeStr = errObj.code || ''
      const msgStr = errObj.message || ''
      const isRetryable = codeStr === 'ECONNRESET' || codeStr === 'ETIMEDOUT' || msgStr.includes('ECONNRESET') || msgStr.includes('ETIMEDOUT')

      console.log(`[Scan] attempt ${attempt + 1}/${settings.maxRetries} failed for ${dirPath}: code=${codeStr}`)

      if (isRetryable && attempt < settings.maxRetries - 1) {
        const baseMs = settings.delayMs * Math.pow(settings.backoffMultiplier, attempt)
        const jitter = baseMs * (0.5 + Math.random() * 0.5)
        const waitMs = Math.round(jitter)
        console.log(`[Scan] retrying in ${(waitMs / 1000).toFixed(1)}s (base=${(baseMs / 1000).toFixed(1)}s)...`)
        await delay(waitMs)
        continue
      }
      throw err
    }
  }
  return []
}

function cleanTitle(filename: string): string {
  let title = filename.replace(/\.[^.]+$/, '')
  title = title.replace(/^\d+[\.\s\-_]+/, '')
  title = title.trim()
  return title || filename
}

function parseFileName(filename: string): { title: string; artist: string } | null {
  const name = filename.replace(/\.[^.]+$/, '')
  const separators = [' - ', ' – ', ' — ', '--', '-', '_']
  for (const sep of separators) {
    if (name.includes(sep)) {
      const idx = name.indexOf(sep)
      let left = name.substring(0, idx).trim()
      let right = name.substring(idx + sep.length).trim()
      left = left.replace(/^\d+[\.\s\-_]*/, '').trim()
      right = right.replace(/^\d+[\.\s\-_]*/, '').trim()
      if (left.length >= 2 && right.length >= 2) {
        return { artist: left, title: right }
      }
    }
  }
  return null
}

function isAudioFile(filename: string): boolean {
  if (filename.startsWith('._')) return false
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'))
  return SUPPORTED_EXTENSIONS.includes(ext)
}

async function parseRemoteMetadata(client: WebDAVClient, fileSize: number, filePath: string): Promise<{ title: string; artist: string; album: string; duration: number }> {
  if (fileSize > MAX_META_DOWNLOAD) {
    return { title: '', artist: '', album: '', duration: 0 }
  }
  try {
    const buffer = await downloadFile(client, filePath)
    if (buffer.length < 1024) return { title: '', artist: '', album: '', duration: 0 }

    const musicMetadata = await import('music-metadata')
    const metadata = await musicMetadata.parseBuffer(buffer, { mimeType: 'audio/mpeg' })
    const common = metadata.common
    return {
      title: common.title || '',
      artist: common.artist || common.albumartist || '',
      album: common.album || '',
      duration: metadata.format.duration || 0
    }
  } catch {
    return { title: '', artist: '', album: '', duration: 0 }
  }
}

export async function scanWebDAV(
  config: WebDAVConfig,
  client: WebDAVClient,
  onProgress: (progress: ScanProgress) => void,
  scanSettings?: ScanSettings
): Promise<number> {
  const gen = activeGeneration
  const settings = scanSettings || DEFAULT_SCAN_SETTINGS
  const existingFiles = getExistingFilePaths(config.id)
  const scannedPaths = new Set<string>()

  let scannedCount = 0
  let totalCount = 0

  async function scanDirectory(dirPath: string): Promise<void> {
    if (gen !== activeGeneration) return

    onProgress({ currentPath: dirPath, scannedCount, totalCount, status: 'scanning' })

    await delay(settings.delayMs)
    if (gen !== activeGeneration) return

    const contents = await retryGetDirectoryContents(client, dirPath, settings)
      .catch((err) => {
        console.log(`[Scan] skipping dir ${dirPath}: ${err}`)
        return []
      })

    for (const item of contents) {
      if (gen !== activeGeneration) return

      const fullPath = dirPath === '/' ? `/${item.basename}` : `${dirPath}/${item.basename}`

      if (item.type === 'directory') {
        if (item.basename === '__MACOSX') continue
        totalCount++
        await scanDirectory(fullPath)
      } else if (isAudioFile(item.basename)) {
        totalCount++
        scannedPaths.add(fullPath)

        const existing = existingFiles.get(fullPath)
        const fileUnchanged = existing && existing.mtime === item.lastmod && existing.size === item.size
        const needsEnrich = existing && (!existing.hasArtist || !existing.hasAlbum || !existing.hasDuration)

        if (fileUnchanged && !needsEnrich) {
          scannedCount++
          continue
        }

        let title: string
        let artist: string
        let album: string
        let durationNum: number

        if (fileUnchanged && needsEnrich) {
          const remoteMeta = await parseRemoteMetadata(client, item.size, fullPath)
          if (remoteMeta.title || remoteMeta.artist || remoteMeta.album) {
            title = remoteMeta.title || cleanTitle(item.basename)
            artist = remoteMeta.artist
            album = remoteMeta.album
            durationNum = remoteMeta.duration
          } else {
            const fileMeta = parseFileName(item.basename)
            title = fileMeta?.title || cleanTitle(item.basename)
            artist = fileMeta?.artist || ''
            album = ''
            durationNum = 0
          }

          updateMusicFileMetadata(config.id, fullPath, {
            title: title || undefined,
            artist: artist || undefined,
            album: album || undefined,
            duration: durationNum || undefined
          })
          scannedCount++
          continue
        }

        const remoteMeta = await parseRemoteMetadata(client, item.size, fullPath)
        if (remoteMeta.title || remoteMeta.artist || remoteMeta.album) {
          title = remoteMeta.title || cleanTitle(item.basename)
          artist = remoteMeta.artist
          album = remoteMeta.album
          durationNum = remoteMeta.duration
        } else {
          const fileMeta = parseFileName(item.basename)
          title = fileMeta?.title || cleanTitle(item.basename)
          artist = fileMeta?.artist || ''
          album = ''
          durationNum = 0
        }

        const musicFile: Omit<MusicFile, 'id'> = {
          path: fullPath,
          filename: item.basename,
          size: item.size,
          mtime: item.lastmod,
          title,
          artist,
          album,
          duration: durationNum,
          webdavId: config.id,
          scannedAt: new Date().toISOString(),
          favorite: 0
        }

        try {
          const isMp3 = item.basename.toLowerCase().endsWith('.mp3')
          const existingSame = findMusicFileByTitle(title, config.id)
          if (existingSame && isMp3) {
            const sources = findAlternativeSources(title, config.id)
            const hasThisSource = sources.some((s) => s.path === fullPath)
            if (!hasThisSource) {
              insertMusicFile(musicFile)
              fillEmptyMetaIfEmpty(existingSame.id, { title, artist, album, duration: durationNum })
              console.log(`[Scan] 新增音源: "${item.basename}" (歌曲: "${title}")`)
            }
          } else {
            insertMusicFile(musicFile)
          }
        } catch { /* skip */ }
        scannedCount++
      }
    }
  }

  await scanDirectory('/')

  for (const existingPath of existingFiles.keys()) {
    if (!scannedPaths.has(existingPath)) {
      deleteMusicFileByPath(config.id, existingPath)
    }
  }

  deduplicateMusicFiles()

  const status = gen !== activeGeneration ? 'cancelled' : 'completed'
  onProgress({ currentPath: '', scannedCount, totalCount, status })

  return scannedCount
}

export function cancelScan(): void {
  activeGeneration++
}

export async function scanLocal(
  config: WebDAVConfig,
  onProgress: (progress: ScanProgress) => void
): Promise<number> {
  const gen = activeGeneration
  const folderPath = config.url
  const existingFiles = getExistingFilePaths(config.id)
  const scannedPaths = new Set<string>()
  let scannedCount = 0
  let totalCount = 0

  const fsLocal = await import('fs')
  const pathLocal = await import('path')

  async function walk(dir: string): Promise<void> {
    if (gen !== activeGeneration) return
    onProgress({ currentPath: dir, scannedCount, totalCount, status: 'scanning' })

    let entries: import('fs').Dirent[]
    try {
      entries = await fsLocal.promises.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (gen !== activeGeneration) return
      const fullPath = pathLocal.join(dir, entry.name)

      if (entry.isDirectory()) {
        if (entry.name === '__MACOSX') continue
        totalCount++
        await walk(fullPath)
      } else if (entry.isFile() && isAudioFile(entry.name)) {
        totalCount++
        scannedPaths.add(fullPath)

        const stat = await fsLocal.promises.stat(fullPath)
        const existing = existingFiles.get(fullPath)
        if (existing && existing.mtime === stat.mtime.toISOString() && existing.size === stat.size) {
          scannedCount++
          continue
        }

        const remoteMeta = await parseLocalMetadata(fullPath)
        let title = remoteMeta.title || ''
        let artist = remoteMeta.artist || ''
        const album = remoteMeta.album || ''
        const duration = remoteMeta.duration || 0

        if (!title && !artist) {
          const fileMeta = parseFileName(entry.name)
          if (fileMeta) {
            title = fileMeta.title
            artist = fileMeta.artist
          }
        }
        if (!title) title = cleanTitle(entry.name)

        const musicFile: Omit<MusicFile, 'id'> = {
          path: fullPath,
          filename: entry.name,
          size: stat.size,
          mtime: stat.mtime.toISOString(),
          title,
          artist,
          album,
          duration,
          webdavId: config.id,
          scannedAt: new Date().toISOString(),
          favorite: 0
        }

        try {
          const isMp3 = entry.name.toLowerCase().endsWith('.mp3')
          const existingSame = findMusicFileByTitle(title, config.id)
          if (existingSame && isMp3) {
            const sources = findAlternativeSources(title, config.id)
            const hasThisSource = sources.some((s) => s.path === fullPath)
            if (!hasThisSource) {
              insertMusicFile(musicFile)
              fillEmptyMetaIfEmpty(existingSame.id, { title, artist, album, duration })
              console.log(`[Scan] 新增本地音源: "${entry.name}" (歌曲: "${title}")`)
            }
          } else {
            insertMusicFile(musicFile)
          }
        } catch { /* skip */ }
        scannedCount++
      }
    }
  }

  await walk(folderPath)

  for (const existingPath of existingFiles.keys()) {
    if (!scannedPaths.has(existingPath)) {
      deleteMusicFileByPath(config.id, existingPath)
    }
  }

  deduplicateMusicFiles()
  const status = gen !== activeGeneration ? 'cancelled' : 'completed'
  onProgress({ currentPath: '', scannedCount, totalCount, status })
  return scannedCount
}

async function parseLocalMetadata(filePath: string): Promise<{ title: string; artist: string; album: string; duration: number }> {
  try {
    const musicMetadata = await import('music-metadata')
    const metadata = await musicMetadata.parseFile(filePath, { skipCovers: true })
    const common = metadata.common
    return {
      title: common.title || '',
      artist: common.artist || common.albumartist || '',
      album: common.album || '',
      duration: metadata.format.duration || 0
    }
  } catch {
    return { title: '', artist: '', album: '', duration: 0 }
  }
}

export async function parseMetadata(filePath: string): Promise<{ title: string; artist: string; album: string; duration: number }> {
  try {
    const musicMetadata = await import('music-metadata')
    const { parseFile } = musicMetadata
    const metadata = await parseFile(filePath)
    const common = metadata.common
    return {
      title: common.title || '',
      artist: common.artist || '',
      album: common.album || '',
      duration: metadata.format.duration || 0
    }
  } catch {
    return { title: '', artist: '', album: '', duration: 0 }
  }
}
