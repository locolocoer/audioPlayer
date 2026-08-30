# AGENTS.md — AI 助手工作约定

## 写完代码必须自测（强制）

本仓库已建立自动化测试体系，**任何代码改动完成后，必须执行自测循环，通过后才能交付**：

1. 跑完整自测：`npm run verify`（typecheck×2 → 全部测试 → 构建 → E2E 冒烟）
2. 有失败就修复，然后**重新跑 verify**，直到全部通过
3. 改主进程 / UI 布局 / 打包配置时，E2E 部分尤其重要

详见 [TESTING.md](./TESTING.md)（完整流程、定位顺序、分层约定）。

## 快速命令

| 命令 | 用途 |
|---|---|
| `npm run verify` | 交付前完整自测（必跑） |
| `npm run check` | 快速自测（不含 E2E） |
| `npm test` | 全部 vitest |
| `npm run test:watch` | 监听模式 |
| `npm run test:e2e` | E2E 冒烟（需先 build） |
| `npm run test:coverage` | 覆盖率 |

## 测试约定

- 新功能必须配套测试；修 bug 先写复现测试（红）再修（绿）
- 组件测试用 `src/test/setup-dom.ts` 的 `window.api` mock；主进程测试用 `src/test/setup-unit.ts` mock electron
- 测试文件分布：`src/main/*.test.ts`（unit）、`src/renderer/{stores,hooks,components}/*.test.*`（dom）、`e2e/*.spec.ts`

## 发版门槛

`npm run verify` 全绿 + 用户本机实测确认后，才能发版（版本号与 README/CHANGELOG/updateNotes 同步）。
