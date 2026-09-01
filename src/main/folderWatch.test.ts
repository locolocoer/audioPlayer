import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import { setupFolderWatchers, closeFolderWatchers } from './folderWatch'
import * as database from './database'
import * as scanner from './scanner'
import type { WebDAVConfig } from './types'

// folderWatch：mock fs.watch / database / scanner，用 fake timers 验证防抖重扫与重试定时器管理
const watchCallbacks = new Map<string, (event: string, filename: string) => void>()
const errorCallbacks = new Map<string, () => void>()
const closedWatchers: unknown[] = []

const watchMock = fs.watch as unknown as ReturnType<typeof vi.fn>

function defaultWatchImpl(_path: string, _opts: unknown, cb: (event: string, filename: string) => void): unknown {
  watchCallbacks.set(String(_path), cb)
  return {
    on: vi.fn((ev: string, c: () => void) => {
      if (ev === 'error') errorCallbacks.set(String(_path), c)
      return { close: vi.fn() }
    }),
    close: vi.fn(() => closedWatchers.push('closed'))
  }
}

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => true),
    watch: vi.fn()
  }
}))

vi.mock('./database', () => ({
  getAllWebDAVConfigs: vi.fn(() => [])
}))

vi.mock('./scanner', () => ({
  scanLocal: vi.fn(async () => 0)
}))

function localConfig(url: string): WebDAVConfig {
  return {
    id: 'local_' + url, name: url, url, username: '', password: '',
    port: 0, enabled: true, createdAt: '2024-01-01', sourceType: 'local'
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  watchMock.mockImplementation(defaultWatchImpl)
  vi.useFakeTimers()
  watchCallbacks.clear()
  errorCallbacks.clear()
  closedWatchers.length = 0
})

afterEach(() => {
  closeFolderWatchers()
  vi.useRealTimers()
})

describe('folderWatch 文件夹监控', () => {
  it('为本地源创建 watcher，文件变更防抖 2s 后重扫一次', async () => {
    vi.mocked(database.getAllWebDAVConfigs).mockReturnValue([localConfig('Y:/audio')])
    setupFolderWatchers()

    expect(watchMock).toHaveBeenCalledWith('Y:/audio', expect.anything(), expect.any(Function))

    const cb = watchCallbacks.get('Y:/audio')!
    cb('rename', 'song.mp3')
    cb('change', 'song.mp3') // 防抖窗口内连续变更
    expect(scanner.scanLocal).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(2000)
    expect(scanner.scanLocal).toHaveBeenCalledTimes(1)
  })

  it('fs.watch 创建失败时 30s 后重试', async () => {
    let attempts = 0
    watchMock.mockImplementation(() => {
      attempts++
      if (attempts === 1) throw new Error('ENOENT')
      watchCallbacks.set('Z:/offline', vi.fn())
      return { on: vi.fn(), close: vi.fn() }
    })
    vi.mocked(database.getAllWebDAVConfigs).mockReturnValue([localConfig('Z:/offline')])

    setupFolderWatchers()
    expect(attempts).toBe(1)

    await vi.advanceTimersByTimeAsync(30000)
    expect(attempts).toBe(2) // 30s 后重建 watcher
  })

  it('watcher error 断开后 10s 重试，旧 watcher 被关闭', async () => {
    vi.mocked(database.getAllWebDAVConfigs).mockReturnValue([localConfig('Y:/audio')])
    setupFolderWatchers()

    const errCb = errorCallbacks.get('Y:/audio')!
    errCb()
    expect(closedWatchers.length).toBe(1) // 断开时关闭旧 watcher

    await vi.advanceTimersByTimeAsync(10000)
    // 重建后再次注册 watcher
    expect(watchCallbacks.has('Y:/audio')).toBe(true)
  })

  it('closeFolderWatchers 清理全部定时器与 watcher，之后不再触发重扫', async () => {
    vi.mocked(database.getAllWebDAVConfigs).mockReturnValue([localConfig('Y:/audio')])
    setupFolderWatchers()

    // 制造一个待触发的重扫定时器
    watchCallbacks.get('Y:/audio')!('change', 'x.mp3')
    closeFolderWatchers()
    expect(closedWatchers.length).toBeGreaterThanOrEqual(1)

    await vi.advanceTimersByTimeAsync(10000)
    expect(scanner.scanLocal).not.toHaveBeenCalled()
  })
})
