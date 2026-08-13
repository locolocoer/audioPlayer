# AudioPlayer — 需求文档 v0.9.0（迭代 5）

## 项目概述

基于 Electron 的桌面音乐播放器（WebDAV + 本地），本迭代聚焦应用信息展示、自动更新能力与三平台打包发布。

## 技术选型

沿用 Electron + React 18 + TypeScript + electron-vite + electron-builder；新增 `electron-updater`（GitHub Releases 作为更新源），CI 三平台（Windows/macOS/Linux）矩阵打包。

## 功能清单

### M025 关于与版本

| ID | 功能 | 优先级 | 状态 |
|----|------|--------|------|
| F045 | 设置页版本信息展示：关于区域显示应用名/版本号/运行环境 | High | ✅ |

### M026 自动更新

| ID | 功能 | 优先级 | 状态 |
|----|------|--------|------|
| F046 | 自动更新链路：electron-updater + GitHub publish 配置 + 主进程事件接线 | High | ✅ |
| F047 | 更新检查与安装流程：手动检查 + 自动下载 + 重启安装 | High | ✅ |

### M027 三平台打包

| ID | 功能 | 优先级 | 状态 |
|----|------|--------|------|
| F048 | 三平台打包目标：win NSIS / mac dmg+zip / linux AppImage+deb，平台图标与 ffmpeg 定位 | High | ✅ |
| F049 | CI 三平台矩阵 + ffmpeg 捆绑 + 合并 Release（含 latest*.yml） | High | ✅ |

## 边界（❌ 不做）

- macOS 无签名/公证（首次安装需右键打开；mac 自动更新不可用）
- 不做应用商店发布
- Windows 无代码签名证书，安装将出现"未知发布者"提示（预期行为）

## 架构简述

```
设置页 ConfigPage
   │  checkForUpdates / 监听 update 事件
   ▼
preload（contextBridge: updater.*）
   │  IPC
   ▼
主进程 index.ts：autoUpdater（electron-updater）
   │  GitHub Releases latest*.yml
   ▼
CI（.github/workflows/main.yml）
   ├─ windows-latest  → NSIS .exe
   ├─ macos-13        → .dmg + .zip（未签名）
   └─ ubuntu-latest   → .AppImage + .deb
   └─ tag 时合并为单个 GitHub Release
```

- 更新触发：手动"检查更新"（F047）
- 下载策略：发现新版本自动后台下载，完成后提示"重启并安装"（退出时安装 autoInstallOnAppQuit）
- 开发模式：未打包时检查更新直接提示"仅安装版支持"
- ffmpeg：CI 按平台捆绑静态二进制（win `ffmpeg.exe`，mac/linux `ffmpeg`），运行时 `findFFmpeg()` 按平台定位，回退系统 PATH

## 非功能性需求

- NF005: 更新检查失败静默降级，不影响播放
- NF006: 更新检查/下载不阻塞渲染线程
- NF007: 无签名"未知发布者"提示为预期

