import { defineConfig } from '@playwright/test'

/**
 * E2E（Electron）冒烟测试配置：
 * - 启动真实应用（out/ 构建产物），验证窗口创建与主界面渲染
 * - 使用 FEIYU_TEST_USERDATA 指向临时目录，不触碰真实数据
 * - 运行：npm run test:e2e（需先 npm run build）
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: 'e2e-results',
  use: {
    trace: 'retain-on-failure'
  }
})
