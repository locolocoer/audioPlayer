// 交互界面截图：逐个触发弹窗/菜单/页面，用于布局分析
import { _electron as electron } from 'playwright'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'ui-shots', 'interactions')
fs.mkdirSync(outDir, { recursive: true })

const app = await electron.launch({ args: ['out/main/index.js'], cwd: root })

async function shoot(win, name, fn) {
  try {
    await fn()
    await win.waitForTimeout(600)
    await win.screenshot({ path: path.join(outDir, `${name}.png`) })
    console.log(`✓ ${name}`)
  } catch (e) {
    console.log(`✗ ${name}: ${e.message}`)
  }
}

async function closeModal(win) {
  await win.keyboard.press('Escape').catch(() => {})
  await win.waitForTimeout(200)
}

async function nav(win, hash) {
  await win.evaluate((h) => { window.location.hash = h }, hash)
  await win.waitForTimeout(500)
}

try {
  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  await win.setViewportSize({ width: 1280, height: 800 })
  // 关掉更新日志
  try { await win.locator('.modal-overlay .btn-primary').first().click().catch(() => {}) } catch {}

  // ---- 弹窗 ----
  await shoot(win, 'modal-add-songs', async () => {
    await nav(win, '#/playlist')
    await win.getByText('添加歌曲').first().click()
  })
  await closeModal(win)

  await shoot(win, 'modal-track-detail', async () => {
    await nav(win, '#/')
    const row = win.locator('.music-table tbody tr').first()
    await row.click({ button: 'right' })
    await win.getByText('查看详情').first().click()
  })
  await closeModal(win)

  await shoot(win, 'modal-playlist-picker', async () => {
    await nav(win, '#/')
    const row = win.locator('.music-table tbody tr').first()
    await row.click({ button: 'right' })
    await win.getByText('添加到收藏').first().click()
  })
  await closeModal(win)

  await shoot(win, 'modal-batch-edit', async () => {
    await nav(win, '#/')
    await win.getByText('多选').first().click()
    await win.locator('.music-table tbody tr').first().click()
    await win.getByText('编辑标签').first().click()
  })
  await closeModal(win)

  await shoot(win, 'modal-ai', async () => {
    await nav(win, '#/')
    await win.getByText('AI 助手').first().click()
  })
  await closeModal(win)

  // ---- 下拉菜单 ----
  await shoot(win, 'menu-sort', async () => {
    await nav(win, '#/')
    await win.getByText('排序', { exact: false }).first().click()
  })
  await closeModal(win)

  await shoot(win, 'menu-mood', async () => {
    await nav(win, '#/')
    await win.getByText('心情电台').first().click()
  })
  await closeModal(win)

  await shoot(win, 'menu-smart', async () => {
    await nav(win, '#/')
    await win.getByText('智能列表').first().click()
  })
  await closeModal(win)

  await shoot(win, 'context-menu', async () => {
    await nav(win, '#/')
    await win.locator('.music-table tbody tr').first().click({ button: 'right' })
  })
  await closeModal(win)

  // ---- 其他页面 ----
  for (const p of ['duplicates', 'history', 'recent']) {
    await shoot(win, `page-${p}`, async () => { await nav(win, `#/${p}`) })
  }

  // ---- 播放（点音乐库首行播放，再截播放页与播放栏） ----
  await shoot(win, 'player-up', async () => {
    await nav(win, '#/')
    await win.locator('.music-table tbody tr').first().click()
    await win.waitForTimeout(2500)
    await nav(win, '#/player')
    await win.waitForTimeout(1200)
  })

  // 均衡器面板（播放页右下 eq-toggle）
  await shoot(win, 'player-eq', async () => {
    await win.getByText('均衡器', { exact: false }).first().click()
  })
} finally {
  await app.close().catch(() => {})
}
console.log('交互截图完成 → ui-shots/interactions/')
