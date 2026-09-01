# 固定自测流程（写完代码必须执行）

> 本文件是项目的**强制约定**：每次写完代码，必须先自测、修复、再自测，直到全部通过，才能交付。
> 违反该流程的改动不允许提交、不允许发版。

## 一、固定流程（Self-Test Loop）

```
写完代码
   │
   ▼
┌─► npm run verify          ← 一条龙：typecheck×2 → 全部测试(66+) → 构建 → E2E 冒烟
   │
   ├─ 全部通过？──────── 是 ──► 交付（提交/发版）
   │
   ▼ 否
修复问题（按下面顺序定位）
   │
   └──────────────────────────┘ 重新跑 verify，直到全绿
```

**要点**：

1. **每次代码改动后都必须跑**，哪怕只改了一行——测试几秒到一分钟内完成
2. **失败必须当场修复，不能跳过、不能带病交付**
3. 修复后**重新跑完整 verify**，确认没有引入新的问题
4. 改动涉及**主进程 / UI 布局 / 打包配置**时，`verify` 里的 E2E 部分尤为重要

## 二、定位问题顺序

**环境一致性（重要）**：CI 使用 **Node 20**（见 `.github/workflows/main.yml`），本机可能是更高版本。依赖/测试的兼容性必须以 CI 版本为准——本地验证时用 `npx -y -p node@20 -c "npm run check"` 在 Node 20 下复跑一遍（曾因 jsdom 依赖用了 Node 24 的 API 导致 CI 测试崩溃，而本机 Node 24 完全正常）。`package.json` 已声明 `engines: node >= 20`，`.nvmrc` 指向 20。

`npm run verify` 输出失败时，按顺序排查：

| 阶段 | 命令 | 常见问题 |
|---|---|---|
| 类型检查 | `npx tsc --noEmit -p tsconfig.node.json` / `-p tsconfig.web.json` | 签名不匹配、类型错误、测试文件类型问题 |
| 单元/回归测试 | `npm test` | 逻辑改动破坏了既有行为（**优先怀疑回归**） |
| 构建 | `npm run build` | 引入语法/依赖解析错误 |
| E2E | `npm run test:e2e` | 启动失败、页面结构/文案变化导致断言失效 |

修复原则：

- **修 bug 先写复现测试**，再修代码，让测试从红变绿
- 回归测试失败时，先看是「测试期望过时」还是「代码行为被改坏」——前者更新测试并说明原因，后者修复代码
- 测试本身不稳定（flaky）也要修，不允许用 `skip`/超时绕过

## 三、测试分层与补充要求

| 层 | 位置 | 什么时候写 |
|---|---|---|
| unit（node） | `src/main/*.test.ts`、`src/renderer/utils/*.test.ts` | 新增/修改纯函数、主进程逻辑（AI 请求、数据库操作、扫描等） |
| dom（jsdom） | `src/renderer/stores/`、`hooks/`、`components/` 下 `*.test.{ts,tsx}` | 新增/修改 Store 业务逻辑、hook、React 组件交互 |
| e2e（Playwright） | `e2e/*.spec.ts` | 启动流程、页面结构、导航、主流程冒烟 |

约定：

- **新功能必须配套测试**（至少覆盖核心分支）；不写测试的新功能视为未完成
- **修复的 bug 必须固化为回归测试**，防止复发
- 组件测试使用 `src/test/setup-dom.ts` 提供的 `window.api` mock，不依赖真实 IPC
- 主进程测试统一在 `src/test/setup-unit.ts` mock electron，`userData` 指向系统临时目录

## 四、命令速查

```bash
npm run verify        # 完整自测（交付前必跑）：typecheck + 全部测试 + build + E2E
npm run check         # 无 E2E 的快速自测：typecheck + 全部测试 + build
npm test              # 全部 vitest（unit + dom）
npm run test:watch    # 监听模式（开发中）
npm run test:coverage # 覆盖率
npm run test:e2e      # 仅 E2E 冒烟（需先 build）
```

## 五、CI 兜底

`.github/workflows/main.yml` 中的 `test` job 会在 **push main / PR / tag** 时自动跑 `npm run check`（typecheck + 全部测试 + 构建）；任何测试或类型错误会直接标红，防止带病合入。**E2E 冒烟只在本地跑**（`npm run verify` 内含）——CI 是 Linux 无图形环境，Electron 窗口测试不稳定，故不做 CI 集成。

## 六、发版门槛

发布新版本（vX.Y.Z）前必须同时满足：

1. `npm run verify` 全绿
2. 用户在本机实测确认核心功能（播放、收藏/列表、扫描、歌词）
3. 版本号与 README/CHANGELOG/updateNotes 同步
