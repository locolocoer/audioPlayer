// 临时检查：i18n zh/en key 一致性
import { readFileSync } from 'fs'

const src = readFileSync('src/renderer/i18n/index.ts', 'utf-8')

function extractKeys(startMarker) {
  const idx = src.indexOf(startMarker)
  if (idx < 0) throw new Error('marker not found: ' + startMarker)
  const block = src.slice(idx)
  const keys = [...block.matchAll(/'([a-zA-Z0-9_.]+)'\s*:/g)].map((m) => m[1])
  return new Set(keys)
}

const zh = extractKeys('const zh: Record<string, string> = {')
const en = extractKeys('const en: Record<string, string> = {')

const onlyZh = [...zh].filter((k) => !en.has(k))
const onlyEn = [...en].filter((k) => !zh.has(k))
console.log('zh keys:', zh.size, '| en keys:', en.size)
console.log('只在 zh:', onlyZh.length ? onlyZh.join(', ') : '无')
console.log('只在 en:', onlyEn.length ? onlyEn.join(', ') : '无')
