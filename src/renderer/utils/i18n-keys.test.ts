import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * i18n 完整性：zh / en 两个字典的 key 集合必须完全一致，防止新增文案漏翻译。
 * 直接读取源码文本提取 key（不依赖模块加载），中英文各一个字典。
 */
const src = readFileSync(join(__dirname, '../i18n/index.ts'), 'utf-8')

function extractKeys(startMarker: string): Set<string> {
  const idx = src.indexOf(startMarker)
  if (idx < 0) throw new Error(`i18n marker not found: ${startMarker}`)
  const block = src.slice(idx)
  return new Set([...block.matchAll(/'([a-zA-Z0-9_.]+)'\s*:/g)].map((m) => m[1]))
}

const zh = extractKeys('const zh: Dict = {')
const en = extractKeys('const en: Dict = {')

describe('i18n key 完整性', () => {
  it('zh/en 字典 key 数量一致', () => {
    expect(zh.size).toBeGreaterThan(100)
    expect(en.size).toBe(zh.size)
  })

  it('没有只在 zh 中存在的 key（漏翻译）', () => {
    const onlyZh = [...zh].filter((k) => !en.has(k))
    expect(onlyZh).toEqual([])
  })

  it('没有只在 en 中存在的 key（多余翻译）', () => {
    const onlyEn = [...en].filter((k) => !zh.has(k))
    expect(onlyEn).toEqual([])
  })
})
