// 界面截图脚本：启动真实应用（真实 userData），截取各页面用于布局分析
import { _electron as electron } from 'playwright'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'ui-shots')
fs.mkdirSync(outDir, { recursive: true })
const tmpUserData = path.join(os.tmpdir(), `feiyu-shot-${Date.now()}`)

const navs = [
  { name: 'music', label: '音乐库', hash: '#/' },
  { name: 'player', label: '播放', hash: '#/player' },
  { name: 'playlist', label: '播放列表', hash: '#/playlist' },
  { name: 'favorites', label: '收藏', hash: '#/favorites' },
  { name: 'stats', label: '统计', hash: '#/stats' },
  { name: 'settings', label: '设置', hash: '#/config' }
]

const app = await electron.launch({ args: ['out/main/index.js'], cwd: root })
try {
  const win = await app.firstWindow()
  await win.waitForTimeout(1200)
  await win.setViewportSize({ width: 1280, height: 800 })

  // 关闭启动弹窗（更新提示等），最多 5 次
  for (let i = 0; i < 5; i++) {
    const cnt = await win.locator('.modal-overlay').count()
    if (cnt === 0) break
    await win.locator('.modal-overlay .btn-primary').first().click().catch(() => {})
    await win.waitForTimeout(250)
  }

  for (const nav of navs) {
    await win.evaluate((h) => { window.location.hash = h }, nav.hash)
    await win.waitForTimeout(700)
    await win.screenshot({ path: path.join(outDir, `${nav.name}.png`), fullPage: false })
    console.log(`✓ ${nav.name}`)
  }
} finally {
  await app.close().catch(() => {})
}
console.log('截图完成 → ui-shots/')
