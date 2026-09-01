import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import os from 'os'

/**
 * Electron 冒烟测试：
 * 用临时 userData 启动真实应用（需先 npm run build 生成 out/），
 * 验证窗口创建、主界面渲染与基础导航，不依赖真实曲库。
 */
const TEST_USERDATA = path.join(os.tmpdir(), `feiyu-e2e-${process.pid}-${Date.now()}`)
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots')

let app: ElectronApplication
let win: Page
let electronLog = ''

test.beforeAll(() => {
  fs.mkdirSync(TEST_USERDATA, { recursive: true })
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
})

test.beforeEach(async () => {
  app = await electron.launch({
    // Linux CI（root/xvfb）：Electron 需要 --no-sandbox 与禁用共享内存/GPU，否则启动即崩溃
    args: [
      ...(process.platform === 'linux' ? ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] : []),
      'out/main/index.js'
    ],
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, FEIYU_TEST_USERDATA: TEST_USERDATA }
  })
  // 捕获 Electron 进程输出，失败时随 artifact 上传以便定位（窗口未创建等场景）
  electronLog = ''
  try {
    const proc = app.process()
    const capture = (d: Buffer): void => { electronLog += d.toString() }
    proc.stdout?.on('data', capture)
    proc.stderr?.on('data', capture)
  } catch { /* ignore */ }
  win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  await dismissStartupModal(win)
})

// 全新 userData 首次启动会弹出「更新日志」弹窗，先关掉再操作
async function dismissStartupModal(page: Page): Promise<void> {
  const modal = page.locator('.modal-overlay')
  await modal.first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
  if ((await modal.count()) > 0) {
    await page.locator('.modal-overlay .btn-primary').first().click()
  }
}

test.afterEach(async () => {
  try {
    fs.mkdirSync('e2e-results', { recursive: true })
    fs.writeFileSync(path.join('e2e-results', 'electron-stderr.log'), electronLog || '(no output captured)')
  } catch { /* ignore */ }
  await app?.close().catch(() => {})
  fs.rmSync(TEST_USERDATA, { recursive: true, force: true })
})

test('应用启动：窗口标题与主界面渲染', async () => {
  await expect(win).toHaveTitle('飞鱼音乐')
  // 侧边栏导航可见（默认中文界面）
  await expect(win.getByRole('link', { name: '音乐库' })).toBeVisible()
  await expect(win.getByRole('link', { name: '播放列表' })).toBeVisible()
  await expect(win.getByRole('link', { name: '我的收藏' })).toBeVisible()
  // 音乐库页头
  await expect(win.getByRole('heading', { name: '音乐库' })).toBeVisible()
  await win.screenshot({ path: path.join(SCREENSHOT_DIR, 'main.png') })
})

test('基础导航：切换各页面', async () => {
  await win.getByRole('link', { name: '播放列表' }).click()
  await expect(win.getByRole('heading', { name: '播放列表' })).toBeVisible()

  await win.getByRole('link', { name: '我的收藏' }).click()
  // 收藏页网格视图（新建收藏夹输入框存在）
  await expect(win.getByPlaceholder('新建列表名')).toBeVisible()

  await win.getByRole('link', { name: '设置' }).click()
  await expect(win.getByRole('heading', { name: '设置', exact: true })).toBeVisible()
  await win.screenshot({ path: path.join(SCREENSHOT_DIR, 'settings.png') })
})

test('播放器页空状态', async () => {
  // 底部播放栏在无歌曲时不可见；直接进播放器页显示空状态
  await win.evaluate(() => {
    window.location.hash = '#/player'
  })
  await expect(win.getByText('未选择歌曲')).toBeVisible({ timeout: 10_000 })
})
