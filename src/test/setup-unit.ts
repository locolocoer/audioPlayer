import { vi } from 'vitest'
import path from 'path'
import os from 'os'

/**
 * unit 项目（node 环境）setup：
 * 主进程模块在纯 node 环境下无法真实加载 electron，统一 mock。
 * - app.getPath('userData') 指向系统临时目录（每个测试文件独立，避免污染真实数据）
 * - safeStorage 默认不可用（密码明文存储分支）；需要加密分支的测试可 mockReturnValue 覆盖
 * - net.fetch 可在测试中用 vi.mocked(net.fetch) 断言请求参数
 */
export const TEST_USERDATA = path.join(os.tmpdir(), 'feiyu-test-userdata')

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => TEST_USERDATA),
    getAppPath: vi.fn(() => TEST_USERDATA),
    getName: vi.fn(() => 'feiyu-music'),
    getVersion: vi.fn(() => '1.5.4')
  },
  net: {
    fetch: vi.fn()
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => false),
    encryptString: vi.fn((plain: string) => Buffer.from(plain, 'utf-8')),
    decryptString: vi.fn((buf: Buffer) => buf.toString('utf-8'))
  },
  BrowserWindow: class {
    static getAllWindows = vi.fn(() => [])
  }
}))
