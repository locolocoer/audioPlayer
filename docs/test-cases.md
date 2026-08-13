# AudioPlayer — 自测用例 v0.9.0（迭代 5）

## 测试范围

迭代5 关于与自动更新 + 三平台打包：设置页版本信息展示（F045）、electron-updater 自动更新链路（F046）、更新检查与安装流程（F047）、三平台打包目标（F048）、CI 三平台矩阵（F049）。

| ID | 关联需求 | 场景 | 前置条件 | 步骤 | 预期 | 实际 | 状态 |
|----|----------|------|----------|------|------|------|------|
| TC045-01 | F045 | 设置页版本信息 | 打开设置页 | 1. 滚动到"关于与更新"区域 | 显示应用名"飞鱼音乐"、版本 v0.8.0、Electron/Chromium/Node 版本 | - | ☐ |
| TC045-02 | F045 | 打包后版本读取 | 已打包安装版 | 1. 安装后打开设置页 | 版本号与安装包版本一致（app.getVersion） | - | ☐ |
| TC046-01 | F046 | 主进程更新链路启动 | 安装版启动 | 1. 正常启动应用 | 无报错；autoUpdater 事件监听注册成功 | - | ☐ |
| TC047-01 | F047 | 手动检查更新（已最新） | 安装版+当前为最新 | 1. 设置页点"检查更新" | 提示"已是最新版本" | - | ☐ |
| TC047-02 | F047 | 手动检查更新（有新版） | 安装版+GitHub 有新 Release | 1. 设置页点"检查更新" | 提示发现新版本并自动下载，显示下载百分比 | - | ☐ |
| TC047-03 | F047 | 下载完成安装 | 下载完成 | 1. 点"重启并安装" | 应用退出并启动安装程序，升级完成后重开 | - | ☐ |
| TC047-04 | F047 | 无网络/检查失败 | 断网环境 | 1. 设置页点"检查更新" | 提示"检查失败"，不影响播放 | - | ☐ |
| TC047-05 | F047 | dev 模式提示 | `npm run dev` | 1. 设置页点"检查更新" | 提示"当前为开发模式，仅安装版支持自动更新" | - | ☐ |
| TC048-01 | F048 | 三平台目标配置 | 代码审查 | 1. 检查 electron-builder.yml | win.nsis / mac.dmg+zip / linux.AppImage+deb 均存在，含平台图标 | - | ☐ |
| TC048-02 | F048 | ffmpeg 平台定位 | Windows 本地 | 1. 本地有 resources/ffmpeg.exe；2. 播放 WAV | 使用捆绑 ffmpeg 转码成功 | - | ☐ |
| TC049-01 | F049 | CI 三平台矩阵 | tag 推送 | 1. 推送 v* 标签 | windows/macos/linux 三作业均成功产出安装包 | - | ☐ |
| TC049-02 | F049 | 合并 Release 产物 | CI 完成 | 1. 查看 GitHub Release | 包含 exe/dmg/AppImage/deb 及 latest.yml/latest-mac.yml/latest-linux.yml | - | ☐ |
| TC049-03 | F049 | mac 安装 | macOS 机器 | 1. 下载 dmg；2. 右键→打开 | 可通过右键打开安装（未签名提示） | - | ☐ |
| TC049-04 | F049 | Linux 安装 | Linux 机器 | 1. 下载 AppImage；2. chmod +x 并运行 | 可运行；deb 可安装 | - | ☐ |

## 编译验证

| 场景 | 命令 | 结果 | 状态 |
|------|------|------|------|
| 生产构建 | `npm run build` | PASS (main + preload + renderer 均成功) | ✅ |
| 类型检查 node | `npx tsc -p tsconfig.node.json --noEmit` | 0 错误 | ✅ |
| 类型检查 web | `npx tsc -p tsconfig.web.json --noEmit` | 0 错误 | ✅ |

> 注：TC046/TC047 需打包安装并在真实环境（连接 GitHub）手工验证；编译/类型检查已自动通过。
