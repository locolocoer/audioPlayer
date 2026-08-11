# 飞鱼音乐 — 项目缺陷分析报告

> 生成日期：2026-08-09
> 方式：全源码扫描 + `tsc` 类型检查 + 数据流/运行时逻辑审查
> 版本基线：v0.5.0（workdir 含未提交改动）

---

## 一、总览

| 严重级别 | 数量 | 说明 |
|----------|------|------|
| 🔴 高（功能缺陷/用户可见） | 5 | 窗口标题乱码、播放列表不持久化、封面缓存崩溃、音频源被禁用后无法播放、配置文件类型错误 |
| 🟠 中（类型错误/死代码/隐患） | 12 | tsc 类型错误 26 处、未使用死代码、事件监听泄漏 |
| 🟡 低（改进建议） | 5 | 打包图标路径、冗余开关、性能建议等 |

`tsc` 全量检查（node + web 两个工程）共报告 **26 处类型错误**，全部为本次扫描发现的存量问题（`npm run build` 因使用 esbuild 不做类型检查，所以构建不报错）。

---

## 二、🔴 高优先级缺陷

### H1. 应用窗口标题乱码（mojibake）
**文件**：`src/main/index.ts:22, 303`
```ts
title: '椋為奔闊充箰',          // 应为 "飞鱼音乐"
console.log('[Player] 椋為奔闊充箰鍚姩涓?..')  // 应为 "飞鱼音乐启动中..."
```
**根因**：中文字符串以 GBK 误存/误读，显示为乱码。
**影响**：窗口标题栏显示乱码；启动日志不可读。
**修复**：改为正确的 UTF-8 字符串。

### H2. 播放列表不持久化（功能未接通的半成品）
**文件**：`src/renderer/stores/playlistStore.ts`
- `playlist` 仅存内存，重启即丢失。
- `database.ts` 的 `playlists` 表、`ipc.ts` 的 `playlist:save/list/delete`、`preload` 的 `window.api.playlist.*` 全部存在，但 **渲染进程从未调用**（`grep window.api.playlist` 无结果）。
**根因**：功能只做了一半（DB + IPC 就绪，渲染层未接线）。
**影响**：用户精心排好的播放列表重启后清空，属于明显数据丢失缺陷。
**修复**：playlistStore 增删改时写入 DB（`trackIds` 存 JSON），启动时加载回填。

### H3. 封面缓存淘汰可能崩溃 / 误吊销 URL
**文件**：`src/renderer/components/PlayerBar.tsx:38,40`、`src/renderer/pages/PlayerPage.tsx:75,77`
```ts
const first = coverCache.keys().next().value      // string | undefined
coverCache.get(first)                              // ← Map.get 收到 undefined
coverCache.delete(first)                           // ← delete 收到 undefined
```
**根因**：`Map.keys().next().value` 类型为 `string | undefined`，未判空就传给 `Map.get/delete`（类型层面报 TS2345；运行时在 Map 为空边界时 `first` 为 `undefined`）。
**影响**：类型错误 + 极端情况下行为未定义。
**修复**：判空后再淘汰。

### H4. 禁用音乐源后其歌曲无法播放（数据不可达）
**文件**：`src/main/database.ts:getWebDAVConfigs` + `src/main/index.ts:player:getAudioPath`
```ts
export function getWebDAVConfigs() {
  return queryAll('SELECT * FROM webdav_configs WHERE enabled = 1')  // 只返回启用项
}
```
**根因**：`player:getAudioPath / getCover / getLrc` 都通过 `getWebDAVConfigs()` 查找配置。用户在设置页把某个源"禁用"（`enabled=0`，界面未暴露该操作，但 DB 支持）后，该源的曲目因找不到 config 而全部无法播放。
**影响**：配置状态与可播放性脱钩。
**修复**：播放链路应读取全部配置（含禁用项），`enabled` 仅用于列表展示过滤。

### H5. 设置页服务器表单缺少 `sourceType`
**文件**：`src/renderer/pages/ConfigPage.tsx:33,53`
```ts
useState<WebDAVConfig>({ id, name, url, username, password, port, enabled, createdAt })  // 缺 sourceType
```
**根因**：表单初始对象未包含 `sourceType`（本地源才被隐藏编辑按钮，但类型上 `sourceType` 必填）。
**影响**：TS2345 类型错误；若未来直接提交该对象会写入缺省源类型。
**修复**：初始对象补 `sourceType: 'webdav'`。

---

## 三、🟠 中优先级缺陷（类型错误 / 死代码 / 隐患）

### M1. `database.ts` 查询函数类型错误（TS2322 / TS18047，5 处）
**位置**：`queryAll`（152-158）
**根因**：手写的 `{ bind?... }` 局部类型与 `sql.js` 的 `Statement` 不匹配；`stmt` 判空分析失效。
**修复**：改用 `sql.js` 的 `Statement`/`BindParams` 官方类型。

### M2. `database.ts` `db.run(sql, unknown[])` 类型错误（TS2345，3 处）
**位置**：241（fillEmptyMetaIfEmpty）、306（updateMusicFileMetadata）、359（updateMusicFileMeta）
**根因**：局部 `vals: unknown[]` 不可赋值给 sql.js 的 `BindParams`。
**修复**：`vals` 改为 `BindParams` 类型。

### M3. `scanner.ts` 类型错误（TS2741 ×2 / TS2833 / TS2339 ×2）
**位置**：188、301（`favorite` 缺失）；259（`fs` 命名空间找不到）；351、367（`parseFile` 不在类型上）
**根因**：
- 构造 `MusicFile` 未填 `favorite`；
- 动态 `import('fs')` 后用 `fs.Dirent[]` 注解，`fs` 无命名空间导入；
- `import('music-metadata')` 被 TS 解析到 `lib/core` 类型，`core` 无 `parseFile`（只有 node 入口 `lib/index` 才有）。
**修复**：补 `favorite: 0`；注解改 `import('fs').Dirent[]`；为 `music-metadata` 补 `parseFile` 模块声明。

### M4. `index.ts` `music-metadata.parseFile` 类型错误（TS2339 ×2）
**位置**：193（getCover）、230（getLrc）
**根因**：同 M3 的 `core` 类型解析问题。
**修复**：模块声明补齐 `parseFile`。

### M5. `webdav.ts` 死代码 `createReadStream`（TS2353 / TS2352 / TS2339，5 处）
**位置**：55-67
**根因**：函数从未被引用（死代码），且用了 `webdav` 库不存在的 `responseType` 选项、错误断言 `Headers`/`data`。
**修复**：删除未使用的 `createReadStream`。

### M6. tsconfig.web 工程边界错误（TS6307）
**位置**：`tsconfig.web.json` include 未包含 `src/preload/index.ts` 依赖链
**根因**：`global.d.ts` → `import('../preload/index')` → `import('../main/types')`，而 web 工程只 include `src/renderer/**`。
**修复**：include 补充 `src/preload/**/*.ts`、`src/main/types.ts`。

### M7. `chinese-s2t` 无类型声明（TS7016）
**位置**：`src/renderer/pages/LibraryPage.tsx:6`
**根因**：库无类型文件。
**修复**：补充 `declare module 'chinese-s2t'` 声明（node 工程已建，web 工程补 include）。

### M8. 扫描进度监听泄漏
**位置**：`src/renderer/stores/musicStore.ts:startScan`
```ts
const unsubscribe = window.api.scan.onProgress(...)  // 从未调用 unsubscribe
```
**根因**：每次开始扫描都新增一个 `scan:progress` 监听器，永不移除；多次扫描后重复回调 `loadTracks()`。
**影响**：内存累积 + 冗余刷新。
**修复**：订阅前先取消旧订阅。

### M9. 均衡器为死代码/非功能（未接入音频）
**位置**：`src/renderer/stores/equalizerStore.ts`、`src/renderer/components/Equalizer.tsx`
**根因**：Equalizer 组件从未被 App/页面引用，也没有任何 Web Audio API 处理（拖动滑块不会改变声音）。
**影响**：纯死代码，功能承诺与实际不符。
**建议**：要么删除，要么接入 `AudioContext`/BiquadFilter。本次扫描仅记录，暂不实现（涉及音频链路改造，风险大）。

### M10. `local-media` 协议与 WAV 转码的缓存键隐患
**位置**：`src/main/index.ts:getCacheKey`
- 缓存键由 `configId + sha1(path)` 组成，跨源同名歌曲路径不同 → 键不同，正常。
- 但 WAV 转码写入 `cachedPath` 前先 `unlinkSync`，若并发播放同一首歌（多次点击）可能互相删除。低概率，暂记录。

### M11. `AudioEngine` 播放失败后无重试入口
**位置**：`src/renderer/components/AudioEngine.tsx`
- 失败置 `loadError` 后，`pendingTrack` 未变化，再次点击同一行会因 `pendingTrack` 引用相同而**不重新触发**加载（zustand 引用未变）。实际点击同一首时 `requestPlay` 会创建新对象引用，故大部分场景可重试，但存在边界。

### M12. `getMusicFiles(webdavId)` 未应用源偏好
**位置**：`src/main/database.ts:getMusicFiles`
- 传入 `webdavId` 时跳过 `source_prefs` 应用。当前渲染层未传该参数，影响有限，但与全量路径行为不一致。

---

## 四、🟡 低优先级 / 改进建议

### L1. 打包后窗口图标路径错误
**位置**：`src/main/index.ts:16` `path.join(__dirname, '../../resources/icon.png')`
- 打包进 asar 后 `../../resources/icon.png` 指向不存在的位置；`findFFmpeg` 已正确用 `process.resourcesPath`，图标未跟随。
- **建议**：图标路径同样回退到 `process.resourcesPath`。

### L2. "繁简去重"开关冗余
**位置**：`ConfigPage.tsx` + `LibraryPage.tsx`
- 数据库已按 `title_key`（繁转简）跨源去重，客户端的"繁简去重"开关实际已无效果，徒增困惑。
- **建议**：从设置页移除，或改为其它有意义的选项。

### L3. `run.cmd` / `npm start` 依赖先构建
**位置**：`run.cmd`、`package.json start`
- 直接 `npx electron out/main/index.js` 需先 `npm run build`，否则启动报错。
- **建议**：改为 `electron-vite preview` 或文档说明。

### L4. 切换音乐源后队列/播放列表引用未同步
- 详情弹窗切换源后仅更新了 `tracks`，若该曲在 `playerStore.queue`/`playlistStore.playlist` 中，仍引用旧源（webdavId/path）。
- **建议**：切换时同步替换各 store 中的同 id 引用。

### L5. `delete_wav.py` 为一次性维护脚本
- 硬编码 `E:\audio`、有删除逻辑，属于运维脚本，建议移出仓库或加显著警告，避免误执行。

---

## 五、修复状态

| 编号 | 修复 | 验证 |
|------|------|------|
| H1 | ✅ 已修复 | 构建通过 |
| H2 | ✅ 已修复（playlist 持久化） | 构建通过 |
| H3 | ✅ 已修复 | 构建通过 |
| H4 | ✅ 已修复 | 构建通过 |
| H5 | ✅ 已修复 | 构建通过 |
| M1-M8 | ✅ 已修复 | `tsc` 两工程 0 错误 |
| M9 | ⏸️ 记录，暂不修复（需音频链路改造） | — |
| M10-M12 | ⏸️ 记录，低概率 | — |
| L1 | ✅ 已修复（打包图标路径 + 顺带修复 ffmpeg 打包路径） | 构建通过 |
| L2 | ✅ 已修复（移除冗余"繁简去重"开关及其逻辑） | 构建通过 |
| L3 | ✅ 已修复（`npm start` / `run.cmd` 改为 `electron-vite preview`，自动构建后启动） | 构建通过 |
| L4 | ✅ 已修复（切换源后同步 queue/currentTrack/playlist 引用） | 构建通过 |
| L5 | ✅ 已修复（`delete_wav.py` 增加破坏性操作警示 + 需 `--yes` 显式确认） | 代码审查通过 |

> 修复前 `tsc` 报错 26 处；修复后 `tsc`（node + web 两个工程）**0 错误**，`npm run build` 通过。
