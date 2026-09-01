// 补截图：更新提示弹窗、AI 助手、右键菜单、歌曲详情（对齐修复后）
import { _electron as electron } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'ui-shots', 'interactions')

const app = await electron.launch({ args: ['out/main/index.js'], cwd: root })
async function nav(win, hash) {
  await win.evaluate((h) => { window.location.hash = h }, hash)
  await win.waitForTimeout(500)
}
async function shot(win, name) {
  await win.screenshot({ path: path.join(outDir, `${name}.png`) })
  console.log(`✓ ${name}`)
}
try {
  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  await win.setViewportSize({ width: 1280, height: 800 })
  await win.waitForTimeout(1500)

  // 1) 更新提示弹窗本身
  if (await win.locator('.modal-overlay').count()) {
    await shot(win, 'modal-update')
    await win.locator('.modal-overlay .btn-primary').first().click().catch(() => {})
    await win.waitForTimeout(300)
  }

  // 2) AI 助手弹窗
  await nav(win, '#/')
  await win.locator('.sidebar-theme-btn').first().click()
  await win.waitForTimeout(1200)
  await shot(win, 'modal-ai')
  await win.keyboard.press('Escape').catch(() => {})
  await win.waitForTimeout(300)

  // 3) 右键菜单
  await win.locator('.music-table tbody tr').first().click({ button: 'right' })
  await win.waitForTimeout(400)
  await shot(win, 'context-menu')
  await win.keyboard.press('Escape').catch(() => {})

  // 4) 歌曲详情（对齐修复后）
  await win.locator('.music-table tbody tr').first().click({ button: 'right' })
  await win.getByText('查看详情').first().click()
  await win.waitForTimeout(500)
  await shot(win, 'modal-track-detail2')
} finally {
  await app.close().catch(() => {})
}
console.log('补截图完成')
