import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { WebDAVClient } from 'webdav'
import { scanWebDAV, cancelScan, cleanTitle, parseFileName, isAudioFile } from './scanner'
import * as webdav from './webdav'
import * as database from './database'
import type { WebDAVConfig } from './types'

// scanWebDAV 端到端：mock webdav 与 database，验证扫描/变更检测/替代音源/失败目录/取消逻辑
vi.mock('./webdav', () => ({
  getDirectoryContents: vi.fn(),
  downloadFile: vi.fn(async () => Buffer.from('fake'),)
}))

vi.mock('./database', () => ({
  insertMusicFile: vi.fn(),
  getExistingFilePaths: vi.fn(() => new Map()),
  deleteMusicFileByPath: vi.fn(),
  deduplicateMusicFiles: vi.fn(),
  updateMusicFileMetadata: vi.fn(),
  findMusicFileByTitle: vi.fn(() => undefined),
  fillEmptyMetaIfEmpty: vi.fn(),
  findAlternativeSources: vi.fn(() => [])
}))

const config: WebDAVConfig = {
  id: 'wd_test', name: '测试源', url: 'http://example.com', username: 'u', password: 'p',
  port: 80, enabled: true, createdAt: '2024-01-01', sourceType: 'webdav'
}

const fastSettings = { delayMs: 1, maxRetries: 1, backoffMultiplier: 1 }

function dir(name: string): { filename: string; basename: string; type: 'directory'; size: number; lastmod: string } {
  return { filename: name, basename: name, type: 'directory', size: 0, lastmod: '2024-01-01' }
}

function audio(name: string, lastmod = '2024-01-01'): { filename: string; basename: string; type: 'file'; size: number; lastmod: string } {
  return { filename: name, basename: name, type: 'file', size: 1024 * 1024, lastmod }
}

beforeEach(() => {
  vi.clearAllMocks()
  cancelScan() // 重置 generation，避免跨测试干扰
})

describe('文件名解析纯函数', () => {
  it('cleanTitle 去扩展名与序号前缀', () => {
    expect(cleanTitle('01. 歌曲名.mp3')).toBe('歌曲名')
    expect(cleanTitle('3 - 歌.flac')).toBe('歌')
    expect(cleanTitle('歌.wav')).toBe('歌')
  })

  it('parseFileName 解析 歌手 - 标题（多种分隔符）', () => {
    expect(parseFileName('周杰伦 - 晴天.mp3')).toEqual({ artist: '周杰伦', title: '晴天' })
    expect(parseFileName('五月天 – 倔强.flac')).toEqual({ artist: '五月天', title: '倔强' })
    expect(parseFileName('歌手_歌曲.mp3')).toEqual({ artist: '歌手', title: '歌曲' })
    expect(parseFileName('只有歌名.mp3')).toBeNull()
  })

  it('isAudioFile 识别支持格式并排除 ._ 隐藏文件', () => {
    expect(isAudioFile('a.mp3')).toBe(true)
    expect(isAudioFile('b.FLAC')).toBe(true)
    expect(isAudioFile('c.txt')).toBe(false)
    expect(isAudioFile('._a.mp3')).toBe(false)
  })
})

describe('scanWebDAV 扫描逻辑', () => {
  it('正常扫描：音频入库、目录递归、返回数量', async () => {
    vi.mocked(webdav.getDirectoryContents).mockImplementation(async (client: WebDAVClient, p: string) => {
      if (p === '/') return [dir('专辑1'), audio('周杰伦 - 晴天.mp3')]
      if (p === '/专辑1') return [audio('01. 歌.flac')]
      return []
    })

    const progress: string[] = []
    const count = await scanWebDAV(config, {} as WebDAVClient, (p) => progress.push(p.status), fastSettings)

    expect(count).toBe(2)
    expect(database.insertMusicFile).toHaveBeenCalledTimes(2)
    const inserted = vi.mocked(database.insertMusicFile).mock.calls.map((c) => c[0])
    // 文件名解析：'周杰伦 - 晴天.mp3' → artist=周杰伦, title=晴天
    const first = inserted.find((f) => f.filename === '周杰伦 - 晴天.mp3')
    expect(first?.title).toBe('晴天')
    expect(first?.artist).toBe('周杰伦')
    expect(progress[progress.length - 1]).toBe('completed')
  })

  it('文件未变化（mtime/size 相同）时跳过插入', async () => {
    vi.mocked(webdav.getDirectoryContents).mockResolvedValue([audio('a.mp3', '2024-01-01')])
    vi.mocked(database.getExistingFilePaths).mockReturnValue(
      new Map([['/a.mp3', { mtime: '2024-01-01', size: 1024 * 1024, id: 1, hasArtist: true, hasAlbum: true, hasDuration: true }]])
    )

    const count = await scanWebDAV(config, {} as WebDAVClient, () => {}, fastSettings)
    expect(count).toBe(1)
    expect(database.insertMusicFile).not.toHaveBeenCalled()
  })

  it('同名不同路径的 mp3 作为替代音源插入，不覆盖原记录', async () => {
    vi.mocked(webdav.getDirectoryContents).mockResolvedValue([audio('b.mp3')])
    // 曲库已有同标题不同路径的歌曲
    vi.mocked(database.findMusicFileByTitle).mockReturnValue({ id: 9, path: '/a.mp3' } as never)
    vi.mocked(database.findAlternativeSources).mockReturnValue([])

    await scanWebDAV(config, {} as WebDAVClient, () => {}, fastSettings)
    expect(database.insertMusicFile).toHaveBeenCalledTimes(1)
    expect(database.fillEmptyMetaIfEmpty).toHaveBeenCalledWith(9, expect.anything())
  })

  it('已存在同一音源时不重复插入', async () => {
    vi.mocked(webdav.getDirectoryContents).mockResolvedValue([audio('b.mp3')])
    vi.mocked(database.findMusicFileByTitle).mockReturnValue({ id: 9, path: '/a.mp3' } as never)
    // 替代音源列表已包含 /b.mp3
    vi.mocked(database.findAlternativeSources).mockReturnValue([{ path: '/b.mp3' } as never])

    await scanWebDAV(config, {} as WebDAVClient, () => {}, fastSettings)
    expect(database.insertMusicFile).not.toHaveBeenCalled()
  })

  it('目录列举失败时标记 failedDir，清理阶段不删该子树（防误删回归）', async () => {
    // 根目录成功，但 /挂起 目录列举失败
    vi.mocked(webdav.getDirectoryContents).mockImplementation(async (_c: WebDAVClient, p: string) => {
      if (p === '/挂起') throw new Error('ECONNRESET')
      if (p === '/') return [dir('挂起')]
      return []
    })
    // 库中已有 /挂起/old.mp3（该目录本次列举失败）
    vi.mocked(database.getExistingFilePaths).mockReturnValue(
      new Map([['/挂起/old.mp3', { mtime: '2020-01-01', size: 1, id: 5, hasArtist: true, hasAlbum: true, hasDuration: true }]])
    )

    await scanWebDAV(config, {} as WebDAVClient, () => {}, fastSettings)
    expect(database.deleteMusicFileByPath).not.toHaveBeenCalled()
  })

  it('正常扫描后清理已消失的文件', async () => {
    vi.mocked(webdav.getDirectoryContents).mockResolvedValue([audio('keep.mp3')])
    vi.mocked(database.getExistingFilePaths).mockReturnValue(
      new Map([
        ['/keep.mp3', { mtime: '2020-01-01', size: 1, id: 1, hasArtist: true, hasAlbum: true, hasDuration: true }],
        ['/gone.mp3', { mtime: '2020-01-01', size: 1, id: 2, hasArtist: true, hasAlbum: true, hasDuration: true }]
      ])
    )

    await scanWebDAV(config, {} as WebDAVClient, () => {}, fastSettings)
    // keep.mp3 本次扫描到（unscanned? 不——它在根目录返回里，会重新扫描）
    // gone.mp3 未出现在扫描结果中 → 被清理
    expect(database.deleteMusicFileByPath).toHaveBeenCalledWith('wd_test', '/gone.mp3')
    expect(database.deleteMusicFileByPath).not.toHaveBeenCalledWith('wd_test', '/keep.mp3')
  })

  it('取消扫描时不执行清理，进度标记 cancelled', async () => {
    let cancelled = false
    // 第一次列举时触发取消
    vi.mocked(webdav.getDirectoryContents).mockImplementation(async (_c: WebDAVClient, p: string) => {
      if (!cancelled) {
        cancelled = true
        cancelScan()
      }
      if (p === '/') return [audio('gone.mp3')]
      return []
    })
    vi.mocked(database.getExistingFilePaths).mockReturnValue(
      new Map([['/gone.mp3', { mtime: '2020-01-01', size: 1, id: 2, hasArtist: true, hasAlbum: true, hasDuration: true }]])
    )

    let status = ''
    await scanWebDAV(config, {} as WebDAVClient, (p) => { status = p.status }, fastSettings)
    expect(status).toBe('cancelled')
    expect(database.deleteMusicFileByPath).not.toHaveBeenCalled()
  })
})
