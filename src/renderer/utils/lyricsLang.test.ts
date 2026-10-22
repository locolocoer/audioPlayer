import { describe, it, expect } from 'vitest'
import { isLyricsInTargetLang } from './lyricsLang'

describe('isLyricsInTargetLang 歌词语言判断（决定是否需要 AI 翻译）', () => {
  it('中文界面 + 中文歌词 → 已是目标语言，不需要翻译', () => {
    expect(isLyricsInTargetLang('我们万岁', 'zh')).toBe(true)
  })

  it('中文界面 + 英文歌词 → 需要翻译', () => {
    expect(isLyricsInTargetLang('We will always love you', 'zh')).toBe(false)
  })

  it('英文界面 + 英文歌词 → 已是目标语言', () => {
    expect(isLyricsInTargetLang('Hello world', 'en')).toBe(true)
  })

  it('英文界面 + 中文歌词 → 需要翻译', () => {
    expect(isLyricsInTargetLang('我们万岁', 'en')).toBe(false)
  })

  it('空歌词/纯符号不误判为中文', () => {
    expect(isLyricsInTargetLang('', 'zh')).toBe(false)
    expect(isLyricsInTargetLang('♪ ♫ ♪', 'zh')).toBe(false)
  })
})
