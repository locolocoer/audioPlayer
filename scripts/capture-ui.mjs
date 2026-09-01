// 界面截图脚本：启动真实应用（真实 userData），截取各页面用于布局分析
import { _electron as electron } from 'playwright'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'ui-shots')
fs.mkdirSync(outDir, { recursive: true })

const navs = [
  { name: 'music', label: '音乐库', hash: '#/' },
  { name: 'player', label: '播放', hash: '#/player' },
  { name: 'playlist', label: '播放列表', hash: '#/playlist' },
  { name: 'favorites', label: '收藏', hash: '#/favorites' },
  { name: 'stats', label: '统计', hash: '#/stats' },
  { name: 'settings', label: '设置', hash: '#/config' }
]

const app = await electron.launch({
  args: ['out/main/index.js'],
  cwd: root
})

try {
  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  await win.setViewportSize({ width: 1280, height: 800 })

  // 关闭首次启动的更新日志弹窗
  try {
    const ok = await win.locator('.modal-overlay .btn-primary').first()
    if (await ok.isVisible().catch(() => false)) await ok.click()
  } catch { /* ignore */ }

  for (const nav of navs) {
    await win.evaluate((h) => { window.location.hash = h }, nav.hash)
    await win.waitForTimeout(700)
    await win.screenshot({ path: path.join(outDir, `${nav.name}.png`), fullPage: false })
    console.log(`✓ ${nav.name} (${nav.label})`)
  }
} finally {
  await app.close().catch(() => {})
}

console.log('截图完成 → ui-shots/')
