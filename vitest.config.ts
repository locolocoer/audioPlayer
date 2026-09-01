import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

/**
 * 测试框架配置（vitest 3 projects）：
 * - unit：node 环境，覆盖纯函数与主进程逻辑（src/main、src/renderer/utils 等无 DOM 依赖的模块）
 * - dom：jsdom 环境，覆盖 zustand store 业务逻辑、hooks 与 React 组件
 *
 * 常用命令：
 *   npm test            全部测试跑一遍
 *   npm run test:watch  监听模式
 *   npm run test:coverage 覆盖率报告
 *   npm run check       写完代码一条龙自测（typecheck + 测试 + build）
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: [
            'src/main/**/*.test.ts',
            'src/renderer/utils/*.test.ts'
          ],
          setupFiles: ['src/test/setup-unit.ts']
        }
      },
      {
        plugins: [react()],
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: [
            'src/renderer/stores/**/*.test.ts',
            'src/renderer/hooks/**/*.test.{ts,tsx}',
            'src/renderer/components/**/*.test.tsx',
            'src/renderer/pages/**/*.test.tsx'
          ],
          setupFiles: ['src/test/setup-dom.ts'],
          css: false
        }
      }
    ],
    coverage: {
      provider: 'v8',
      include: [
        'src/main/**/*.ts',
        'src/renderer/**/*.{ts,tsx}'
      ],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/main/index.ts',
        'src/renderer/main.tsx',
        'src/renderer/global.d.ts',
        'src/renderer/vite-env.d.ts'
      ],
      reporter: ['text', 'html']
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
})
