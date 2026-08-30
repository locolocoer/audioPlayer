import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { safeStorage } from 'electron'
import {
  initDatabase, closeDatabase, getDB,
  insertMusicFile, getMusicFileById, getMusicFiles, getMusicFileCount,
  deduplicateMusicFiles, getDuplicateGroups,
  toggleFavorite, setRating, recordPlay, getPlayHistory, getStatsReport,
  savePlaylist, getPlaylists, deletePlaylist,
  saveAiTags, getAiTags,
  saveWebDAVConfig, getWebDAVConfigs, getAllWebDAVConfigs, deleteWebDAVConfig,
  setSourcePref, findAlternativeSources,
  updateMusicFileMeta, fillEmptyMetaIfEmpty,
  PLAY_HISTORY_MAX
} from './database'
import { TEST_USERDATA } from '../test/setup-unit'
import type { MusicFile, WebDAVConfig, Playlist } from './types'

function file(id: number, pathStr: string, over: Partial<Omit<MusicFile, 'id'>> = {}): Omit<MusicFile, 'id'> {
  return {
    path: pathStr,
    filename: path.basename(pathStr),
    size: 1000 + id,
    mtime: '2024-01-01T00:00:00Z',
    title: `歌曲${id}`,
    artist: '歌手',
    album: '专辑',
    duration: 200,
    webdavId: 'local_test',
    scannedAt: '2024-01-01T00:00:00Z',
    ...over
  } as Omit<MusicFile, 'id'>
}

function config(id: string, over: Partial<WebDAVConfig> = {}): WebDAVConfig {
  return {
    id, name: `源${id}`, url: 'http://example.com', username: 'u', password: 'secret',
    port: 80, enabled: true, createdAt: '2024-01-01', sourceType: 'webdav', ...over
  }
}

beforeAll(async () => {
  fs.mkdirSync(TEST_USERDATA, { recursive: true })
  await initDatabase()
})

beforeEach(() => {
  const dbx = getDB()
  dbx.run('DELETE FROM music_files')
  dbx.run('DELETE FROM playlists')
  dbx.run('DELETE FROM play_history')
  dbx.run('DELETE FROM source_prefs')
  dbx.run('DELETE FROM ai_tags')
  dbx.run('DELETE FROM webdav_configs')
  // 重置自增序列，保证每个测试内 id 从 1 开始
  dbx.run("DELETE FROM sqlite_sequence WHERE name IN ('music_files', 'playlists', 'play_history')")
})

afterAll(async () => {
  // 等 saveToDisk 防抖（250ms）触发完，避免 db 关闭后还有排队的 export
  await new Promise((r) => setTimeout(r, 350))
  closeDatabase()
})

describe('insertMusicFile 幂等插入', () => {
  it('新文件插入并返回自增 id', () => {
    insertMusicFile(file(1, 'Y:/audio/a.mp3'))
    const row = getMusicFileById(1)
    expect(row).toBeDefined()
    expect(row?.path).toBe('Y:/audio/a.mp3')
    expect(row?.title_key).toBe('歌曲1')
  })

  it('同路径重插走 UPDATE：保留 id、收藏、播放次数', () => {
    insertMusicFile(file(1, 'Y:/audio/a.mp3'))
    toggleFavorite(1)
    recordPlay(1)
    insertMusicFile(file(1, 'Y:/audio/a.mp3', { size: 9999, mtime: '2025-01-01' }))
    const row = getMusicFileById(1)
    expect(row?.id).toBe(1)
    expect(row?.size).toBe(9999)
    expect(row?.favorite).toBe(1)
    expect(row?.playCount).toBe(1)
    expect(getMusicFileCount()).toBe(1)
  })
})

describe('deduplicateMusicFiles 只清同路径重复（防误删回归）', () => {
  it('无重复数据时 dedup 不影响任何曲目', () => {
    insertMusicFile(file(1, 'Y:/audio/x.mp3'))
    insertMusicFile(file(2, 'Y:/audio/y.mp3'))
    deduplicateMusicFiles()
    expect(getMusicFileCount()).toBe(2)
  })

  it('不同路径的替代音源（同标题）不会被误删', () => {
    const dbx = getDB()
    insertMusicFile(file(1, 'Y:/audio/orig.flac'))
    dbx.run(
      `INSERT INTO music_files (path, filename, size, mtime, title, title_key, artist, album, duration, webdavId, scannedAt)
       VALUES ('Y:/audio/alt.mp3', 'alt.mp3', 100, '2024-01-01', '歌曲1', '歌曲1', '歌手', '专辑', 200, 'local_test', '2024-01-01')`
    )
    deduplicateMusicFiles()
    const rows = getDB().exec('SELECT COUNT(*) as c FROM music_files')[0].values[0][0]
    expect(rows).toBe(2) // 两条都保留（path 不同，是合法替代音源）
  })
})

describe('getMusicFiles 按标题去重与音源偏好', () => {
  it('同标题不同路径默认保留最小 id，设置偏好后切换', () => {
    const dbx = getDB()
    insertMusicFile(file(1, 'Y:/audio/a.flac'))
    dbx.run(
      `INSERT INTO music_files (path, filename, size, mtime, title, title_key, artist, album, duration, webdavId, scannedAt)
       VALUES ('Y:/audio/b.mp3', 'b.mp3', 100, '2024-01-01', '歌曲1', '歌曲1', '歌手', '专辑', 200, 'local_test', '2024-01-01')`
    )
    let list = getMusicFiles()
    expect(list).toHaveLength(1)
    expect(list[0].path).toBe('Y:/audio/a.flac')

    setSourcePref('歌曲1', 2)
    list = getMusicFiles()
    expect(list[0].path).toBe('Y:/audio/b.mp3')
  })

  it('结果按标题排序', () => {
    insertMusicFile(file(2, 'Y:/audio/b.mp3', { title: 'B歌' }))
    insertMusicFile(file(1, 'Y:/audio/a.mp3', { title: 'A歌' }))
    const list = getMusicFiles()
    expect(list.map((t) => t.title)).toEqual(['A歌', 'B歌'])
  })
})

describe('收藏 / 评分 / 播放记录', () => {
  it('toggleFavorite 切换收藏状态', () => {
    insertMusicFile(file(1, 'Y:/audio/a.mp3'))
    expect(toggleFavorite(1)).toBe(true)
    expect(getMusicFileById(1)?.favorite).toBe(1)
    expect(toggleFavorite(1)).toBe(false)
    expect(getMusicFileById(1)?.favorite).toBe(0)
  })

  it('setRating 钳制到 0-5', () => {
    insertMusicFile(file(1, 'Y:/audio/a.mp3'))
    setRating(1, 99)
    expect(getMusicFileById(1)?.rating).toBe(5)
    setRating(1, -3)
    expect(getMusicFileById(1)?.rating).toBe(0)
  })

  it('recordPlay 累加次数并写入历史', () => {
    insertMusicFile(file(1, 'Y:/audio/a.mp3'))
    recordPlay(1)
    recordPlay(1)
    const row = getMusicFileById(1)
    expect(row?.playCount).toBe(2)
    expect(row?.lastPlayed).toBeTruthy()
    expect(getPlayHistory(10)).toHaveLength(2)
  })

  it('播放历史超过上限自动裁剪最旧记录', () => {
    insertMusicFile(file(1, 'Y:/audio/a.mp3'))
    for (let i = 0; i < PLAY_HISTORY_MAX + 10; i++) recordPlay(1)
    const dbx = getDB()
    const count = dbx.exec('SELECT COUNT(*) as c FROM play_history')[0].values[0][0]
    expect(count).toBe(PLAY_HISTORY_MAX)
  })

  it('getStatsReport 统计播放总量', () => {
    insertMusicFile(file(1, 'Y:/audio/a.mp3'))
    recordPlay(1)
    recordPlay(1)
    const report = getStatsReport()
    expect(report.totalPlays).toBe(2)
    expect(report.playedCount).toBe(1)
    expect(report.topSongs[0].id).toBe(1)
  })
})

describe('播放列表', () => {
  it('保存/读取/删除（含 kind）', () => {
    const pl: Playlist = { id: 1, name: '我的播放列表', trackIds: '[1,2]', createdAt: '2024-01-01', kind: 'playlist' }
    savePlaylist(pl)
    let list = getPlaylists()
    expect(list).toHaveLength(1)
    expect(list[0].kind).toBe('playlist')

    const fav: Playlist = { id: 2, name: '收藏夹', trackIds: '[3]', createdAt: '2024-01-02', kind: 'favorite' }
    savePlaylist(fav)
    list = getPlaylists()
    expect(list.find((p) => p.id === 2)?.kind).toBe('favorite')

    deletePlaylist(1)
    expect(getPlaylists().map((p) => p.id)).toEqual([2])
  })
})

describe('AI 标签', () => {
  it('JSON 往返 + 超出 8 个标签被裁剪', () => {
    saveAiTags([
      { trackId: 1, tags: ['治愈', '民谣', '安静', '学习', '睡前', '放松', '温柔', '孤独', '雨天', '咖啡'] }
    ])
    const tags = getAiTags()
    expect(tags).toHaveLength(1)
    expect(tags[0].trackId).toBe(1)
    expect(tags[0].tags).toHaveLength(8)
    expect(tags[0].tags[0]).toBe('治愈')
  })
})

describe('WebDAV 配置与密码', () => {
  it('safeStorage 不可用时明文存储（不影响功能）', () => {
    saveWebDAVConfig(config('c1'))
    const all = getAllWebDAVConfigs()
    expect(all[0].password).toBe('secret')
  })

  it('safeStorage 可用时加密存储并可解密读取', () => {
    vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
    try {
      saveWebDAVConfig(config('c2'))
      const raw = getDB().exec("SELECT password FROM webdav_configs WHERE id = 'c2'")[0].values[0][0]
      expect(String(raw)).toMatch(/^enc:v1:/)
      expect(getAllWebDAVConfigs().find((c) => c.id === 'c2')?.password).toBe('secret')
    } finally {
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false)
    }
  })

  it('getWebDAVConfigs 只返回启用项；删除配置连带清理曲目', () => {
    saveWebDAVConfig(config('on', { enabled: true }))
    saveWebDAVConfig(config('off', { enabled: false }))
    expect(getWebDAVConfigs().map((c) => c.id)).toEqual(['on'])

    insertMusicFile(file(1, 'Y:/audio/a.mp3', { webdavId: 'on' }))
    insertMusicFile(file(2, 'Y:/audio/b.mp3', { webdavId: 'other' }))
    deleteWebDAVConfig('on')
    const paths = getDB().exec('SELECT path FROM music_files')[0].values.map((r) => r[0])
    expect(paths).toEqual(['Y:/audio/b.mp3'])
  })
})

describe('替代音源与重复分组', () => {
  it('findAlternativeSources 优先本音源与 mp3', () => {
    insertMusicFile(file(1, 'Y:/audio/x.flac', { title: '同一首', webdavId: 'a' }))
    insertMusicFile(file(2, 'Y:/audio/y.flac', { title: '同一首', webdavId: 'b' }))
    insertMusicFile(file(3, 'Y:/audio/z.mp3', { title: '同一首', webdavId: 'b' }))
    const alts = findAlternativeSources('同一首', 'b')
    expect(alts.map((t) => t.id)).toEqual([3, 2, 1]) // 本音源 b：mp3 在前；最后是其他音源
  })

  it('getDuplicateGroups 按标题分组统计重复', () => {
    insertMusicFile(file(1, 'Y:/audio/a.flac', { title: '重复曲' }))
    insertMusicFile(file(2, 'Y:/audio/b.mp3', { title: '重复曲' }))
    insertMusicFile(file(3, 'Y:/audio/c.mp3', { title: '独立曲' }))
    const groups = getDuplicateGroups()
    expect(groups).toHaveLength(1)
    expect(groups[0].trackCount).toBe(2)
  })
})

describe('元数据更新', () => {
  it('updateMusicFileMeta 更新标题并重算 title_key', () => {
    insertMusicFile(file(1, 'Y:/audio/a.mp3'))
    updateMusicFileMeta(1, { title: '新标题' })
    const row = getMusicFileById(1)
    expect(row?.title).toBe('新标题')
    expect(row?.title_key).toBe('新标题')
  })

  it('fillEmptyMetaIfEmpty 只填空缺字段', () => {
    insertMusicFile(file(1, 'Y:/audio/a.mp3', { title: '已有标题', artist: '', album: '' }))
    fillEmptyMetaIfEmpty(1, { title: '不应覆盖', artist: '补齐歌手', album: '补齐专辑' })
    const row = getMusicFileById(1)
    expect(row?.title).toBe('已有标题')
    expect(row?.artist).toBe('补齐歌手')
    expect(row?.album).toBe('补齐专辑')
  })
})
