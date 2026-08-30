import fs from 'fs'
import { BrowserWindow } from 'electron'
import { getAllWebDAVConfigs } from './database'
import { scanLocal } from './scanner'
import type { WebDAVConfig } from './types'

const folderWatchers: fs.FSWatcher[] = []
const rescanTimers = new Map<string, ReturnType<typeof setTimeout>>()
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>()
const rescanning = new Set<string>()

// 网络盘暂时不可用/监控断开时延迟重建 watcher；定时器登记后 closeFolderWatchers 才能一并清理，
// 否则退出后残留的定时器会继续重建 watcher
function scheduleRetry(config: WebDAVConfig, delayMs: number): void {
  const existing = retryTimers.get(config.id)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(() => {
    retryTimers.delete(config.id)
    watchLocalFolder(config)
  }, delayMs)
  retryTimers.set(config.id, timer)
}

async function rescanLocalFolder(config: WebDAVConfig): Promise<void> {
  if (rescanning.has(config.id)) return
  rescanning.add(config.id)
  try {
    const count = await scanLocal(config, () => {})
    const win = BrowserWindow.getAllWindows()[0]
    if (win && !win.isDestroyed()) {
      win.webContents.send('scan:autoComplete', config.id)
    }
    console.log(`[Watch] 自动重扫完成 ${config.name}: ${count} 个文件`)
  } catch (err) {
    console.log(`[Watch] 重扫失败 ${config.name}: ${err}`)
  } finally {
    rescanning.delete(config.id)
  }
}

export function closeFolderWatchers(): void {
  for (const w of folderWatchers) {
    try { w.close() } catch { /* ignore */ }
  }
  folderWatchers.length = 0
  for (const t of rescanTimers.values()) clearTimeout(t)
  rescanTimers.clear()
  for (const t of retryTimers.values()) clearTimeout(t)
  retryTimers.clear()
}

function watchLocalFolder(config: WebDAVConfig): void {
  if (!fs.existsSync(config.url)) return
  let watcher: fs.FSWatcher
  try {
    watcher = fs.watch(config.url, { recursive: true }, (_event, filename) => {
      // 忽略歌词/标签写回等非音频文件变更，避免保存 .lrc 触发全库重扫导致卡顿
      if (typeof filename === 'string' && filename) {
        const lower = filename.toLowerCase()
        if (lower.endsWith('.lrc') || lower.endsWith('.feiyu-tagtmp.flac') || lower.endsWith('.dts')) {
          return
        }
      }
      const existing = rescanTimers.get(config.id)
      if (existing) clearTimeout(existing)
      const timer = setTimeout(() => {
        rescanTimers.delete(config.id)
        rescanLocalFolder(config)
      }, 2000)
      rescanTimers.set(config.id, timer)
    })
  } catch (err) {
    console.log(`[Watch] 无法监控 ${config.url}: ${err}`)
    // 网络盘暂时不可用时延迟重试
    scheduleRetry(config, 30000)
    return
  }
  // 网络驱动器（如映射盘）连接重置时 fs.watch 会抛 error 事件，
  // 必须监听，否则未捕获异常会直接弹主进程错误框
  watcher.on('error', (err) => {
    console.log(`[Watch] 监控断开 ${config.url}: ${err}，10 秒后重试`)
    try { watcher.close() } catch { /* ignore */ }
    const idx = folderWatchers.indexOf(watcher)
    if (idx >= 0) folderWatchers.splice(idx, 1)
    scheduleRetry(config, 10000)
  })
  folderWatchers.push(watcher)
  console.log(`[Watch] 已监控本地文件夹: ${config.url}`)
}

export function setupFolderWatchers(): void {
  closeFolderWatchers()
  const localConfigs = getAllWebDAVConfigs().filter((c) => c.sourceType === 'local')
  for (const config of localConfigs) {
    watchLocalFolder(config)
  }
}
