import { describe, it, expect } from 'vitest'
import { parseLrc, activeLyricIndex } from './lrc'

describe('parseLrc', () => {
  it('解析标准 LRC 时间标签', () => {
    const lrc = '[00:01.50]第一句\n[00:10.00]第二句\n[01:00.00]第三句'
    const result = parseLrc(lrc)
    expect(result).toEqual([
      { time: 1.5, text: '第一句' },
      { time: 10, text: '第二句' },
      { time: 60, text: '第三句' }
    ])
  })

  it('忽略元数据标签和空文本行', () => {
    const lrc = '[ti:歌名]\n[00:05.00]\n[00:10.00]有效歌词'
    const result = parseLrc(lrc)
    expect(result).toEqual([{ time: 10, text: '有效歌词' }])
  })

  it('乱序输入按时间排序', () => {
    const lrc = '[00:10.00]第二句\n[00:01.00]第一句'
    const result = parseLrc(lrc)
    expect(result[0].time).toBe(1)
    expect(result[1].time).toBe(10)
  })

  it('多个时间标签在同一行时分别解析', () => {
    const lrc = '[00:01.00][00:02.00]重复句'
    const result = parseLrc(lrc)
    expect(result).toEqual([
      { time: 1, text: '重复句' },
      { time: 2, text: '重复句' }
    ])
  })
})

describe('activeLyricIndex', () => {
  const lyrics = [
    { time: 0, text: 'a' },
    { time: 10, text: 'b' },
    { time: 20, text: 'c' }
  ]

  it('返回当前时间对应的歌词行', () => {
    expect(activeLyricIndex(lyrics, 0)).toBe(0)
    expect(activeLyricIndex(lyrics, 5)).toBe(0)
    expect(activeLyricIndex(lyrics, 10)).toBe(1)
    expect(activeLyricIndex(lyrics, 19.9)).toBe(1)
    expect(activeLyricIndex(lyrics, 20)).toBe(2)
    expect(activeLyricIndex(lyrics, 100)).toBe(2)
  })

  it('当前时间早于第一行返回 -1', () => {
    expect(activeLyricIndex([{ time: 5 }], 0)).toBe(-1)
  })

  it('空歌词返回 -1', () => {
    expect(activeLyricIndex([], 10)).toBe(-1)
  })
})
