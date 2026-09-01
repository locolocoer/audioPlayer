import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { scanLocal } from './scanner'
import * as database from './database'
import type { WebDAVConfig, MusicFile } from './types'

// scanLocal 端到端：使用真实临时目录与真实 fs，仅 mock database
vi.mock('./database', () => ({
  insertMusicFile: vi.fn(),
  getExistingFilePaths: vi.fn(() => new Map()),
  deleteMusicFileByPath: vi.fn(),
  deduplicateMusicFiles: vi.fn(),
  findMusicFileByTitle: vi.fn(() => undefined),
  fillEmptyMetaIfEmpty: vi.fn(),
  findAlternativeSources: vi.fn(() => [])
}))

let tempDir: string

function makeConfig(url: string): WebDAVConfig {
  return {
    id: 'local_test', name: '本机', url, username: '', password: '',
    port: 0, enabled: true, createdAt: '2024-01-01', sourceType: 'local'
  }
}

function writeFile(rel: string): string {
  const p = path.join(tempDir, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, Buffer.alloc(1024 * 64, 0)) // 假音频内容
  return p
}

beforeEach(() => {
  vi.clearAllMocks()
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'feiyu-scan-'))
})

afterAll(() => {
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true })
})

describe('scanLocal 本地扫描', () => {
  it('扫描新文件：文件名解析出歌手/标题，支持子目录', async () => {
    writeFile('周杰伦 - 晴天.mp3')
    writeFile('sub/01. 无标题.flac')

    const count = await scanLocal(makeConfig(tempDir), () => {})

    expect(count).toBe(2)
    expect(database.insertMusicFile).toHaveBeenCalledTimes(2)
    const inserted = vi.mocked(database.insertMusicFile).mock.calls.map((c) => c[0] as Omit<MusicFile, 'id'>)
    const song = inserted.find((f) => f.filename === '周杰伦 - 晴天.mp3')
    expect(song?.title).toBe('晴天')
    expect(song?.artist).toBe('周杰伦')
    const plain = inserted.find((f) => f.filename === '01. 无标题.flac')
    expect(plain?.title).toBe('无标题')
  })

  it('忽略非音频文件与 ._ 隐藏文件', async () => {
    writeFile('a.mp3')
    writeFile('b.txt')
    writeFile('._hidden.mp3')

    const count = await scanLocal(makeConfig(tempDir), () => {})
    expect(count).toBe(1)
  })

  it('文件未变化时跳过（mtime/size 相同）', async () => {
    const p = writeFile('a.mp3')
    await scanLocal(makeConfig(tempDir), () => {})
    const inserted = vi.mocked(database.insertMusicFile).mock.calls.map((c) => c[0] as Omit<MusicFile, 'id'>)[0]
    expect(inserted).toBeDefined()

    vi.clearAllMocks()
    // 库中已有相同 mtime/size
    const stat = fs.statSync(p)
    vi.mocked(database.getExistingFilePaths).mockReturnValue(
      new Map([[p, { mtime: inserted.mtime, size: stat.size, id: 1, hasArtist: true, hasAlbum: true, hasDuration: true }]])
    )

    const count = await scanLocal(makeConfig(tempDir), () => {})
    expect(count).toBe(1)
    expect(database.insertMusicFile).not.toHaveBeenCalled()
  })

  it('清理库中已不存在的文件', async () => {
    writeFile('keep.mp3')
    await scanLocal(makeConfig(tempDir), () => {})

    vi.clearAllMocks()
    const keepPath = path.join(tempDir, 'keep.mp3')
    const gonePath = path.join(tempDir, 'gone.mp3')
    const stat = fs.statSync(keepPath)
    vi.mocked(database.getExistingFilePaths).mockReturnValue(
      new Map([
        [keepPath, { mtime: stat.mtime.toISOString(), size: stat.size, id: 1, hasArtist: true, hasAlbum: true, hasDuration: true }],
        [gonePath, { mtime: '2020-01-01', size: 1, id: 2, hasArtist: true, hasAlbum: true, hasDuration: true }]
      ])
    )

    await scanLocal(makeConfig(tempDir), () => {})
    expect(database.deleteMusicFileByPath).toHaveBeenCalledWith('local_test', gonePath)
    expect(database.deleteMusicFileByPath).not.toHaveBeenCalledWith('local_test', keepPath)
  })
})
