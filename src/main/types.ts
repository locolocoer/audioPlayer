export interface WebDAVConfig {
  id: string
  name: string
  url: string
  username: string
  password: string
  port: number
  enabled: boolean
  createdAt: string
  sourceType: 'webdav' | 'local'
}

export interface MusicFile {
  id: number
  path: string
  filename: string
  size: number
  mtime: string
  title: string
  artist: string
  album: string
  duration: number
  webdavId: string
  scannedAt: string
  favorite: number
  title_key?: string
  playCount?: number
  lastPlayed?: string
}

export interface Playlist {
  id: number
  name: string
  trackIds: string
  createdAt: string
}

export interface ScanProgress {
  currentPath: string
  scannedCount: number
  totalCount: number
  status: 'scanning' | 'completed' | 'cancelled'
}

export interface PlayerState {
  currentTrack: MusicFile | null
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  playMode: 'sequential' | 'shuffle' | 'single'
}

export interface ScanSettings {
  delayMs: number
  maxRetries: number
  backoffMultiplier: number
}

export const DEFAULT_SCAN_SETTINGS: ScanSettings = {
  delayMs: 5000,
  maxRetries: 3,
  backoffMultiplier: 2
}

export const SUPPORTED_EXTENSIONS = ['.mp3', '.flac', '.ogg', '.aac', '.m4a', '.wma']
