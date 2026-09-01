// 发版版本号同步脚本：一键更新所有版本号位置，防止漏改
// 用法：node scripts/bump-version.mjs <新版本号>   例：node scripts/bump-version.mjs 1.5.6
// 更新范围：package.json / package-lock.json（两处）/ README 当前版本 / CHANGELOG 新条目标题 / updateNotes.ts 新条目
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const version = process.argv[2]

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('用法: node scripts/bump-version.mjs <x.y.z>')
  process.exit(1)
}

function patch(file, replacements) {
  const p = join(root, file)
  let text = readFileSync(p, 'utf-8')
  for (const [from, to] of replacements) {
    if (!text.includes(from)) {
      console.error(`[${file}] 未找到: ${from}`)
      process.exit(1)
    }
    text = text.split(from).join(to)
  }
  writeFileSync(p, text)
  console.log(`[${file}] ok`)
}

// package.json / package-lock.json：根版本
patch('package.json', [[`"version": "1.`, `"version": "${version}"`]])
patch('package-lock.json', [[`"version": "1.`, `"version": "${version}"`]])

// README 当前版本行（替换 vX.Y.Z 部分）
{
  const p = join(root, 'README.md')
  let text = readFileSync(p, 'utf-8')
  const re = /当前版本：\*\*v[\d.]+/
  if (!re.test(text)) {
    console.error('[README.md] 未找到当前版本行')
    process.exit(1)
  }
  text = text.replace(re, `当前版本：**v${version}`)
  writeFileSync(p, text)
  console.log('[README.md] ok')
}

// CHANGELOG：在 "## [1.5.4]" 之前插入新版本空条目（保持最新在前）
{
  const p = join(root, 'CHANGELOG.md')
  let text = readFileSync(p, 'utf-8')
  const today = new Date().toISOString().slice(0, 10)
  const entry = `## [${version}] - ${today}\n\n### Added\n- \n\n### Fixed\n- \n\n`
  const match = text.match(/^## \[\d+\.\d+\.\d+\]/m)
  if (!match) {
    console.error('[CHANGELOG.md] 未找到现有版本条目')
    process.exit(1)
  }
  text = text.slice(0, match.index) + entry + text.slice(match.index)
  writeFileSync(p, text)
  console.log('[CHANGELOG.md] ok（记得填写条目内容）')
}

// updateNotes.ts：在 '1.5.4' 条目之前插入新版本占位
{
  const p = join(root, 'src/renderer/data/updateNotes.ts')
  let text = readFileSync(p, 'utf-8')
  const placeholder = `'${version}': {\n    changed: [\n      '（待填写）'\n    ]\n  },\n`
  const match = text.match(/'1\.\d+\.\d+': \{/)
  if (!match) {
    console.error('[updateNotes.ts] 未找到现有条目')
    process.exit(1)
  }
  text = text.slice(0, match.index) + placeholder + text.slice(match.index)
  writeFileSync(p, text)
  console.log('[updateNotes.ts] ok（记得填写条目内容）')
}

console.log(`\n版本号已同步为 ${version}，请填写 CHANGELOG 与 updateNotes 的实际内容后发版。`)
