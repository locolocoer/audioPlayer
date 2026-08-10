import fs from 'fs'
import { BrowserWindow } from 'electron'
import { getAllWebDAVConfigs } from './database'
import { scanLocal } from './scanner'
import type { WebDAVConfig } from './types'

const folderWatchers: fs.FSWatcher[] = []
const rescanTimers = new Map<string, ReturnType<typeof setTimeout>>()
const rescanning = new Set<string>()

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
}

export function setupFolderWatchers(): void {
  closeFolderWatchers()
  const localConfigs = getAllWebDAVConfigs().filter((c) => c.sourceType === 'local')
  for (const config of localConfigs) {
    if (!fs.existsSync(config.url)) continue
    let watcher: fs.FSWatcher
    try {
      watcher = fs.watch(config.url, { recursive: true }, () => {
        const existing = rescanTimers.get(config.id)
        if (existing) clearTimeout(existing)
        const timer = setTimeout(() => {
          rescanTimers.delete(config.id)
          rescanLocalFolder(config)
        }, 2000)
        rescanTimers.set(config.id, timer)
      })
    } catch {
      continue
    }
    folderWatchers.push(watcher)
    console.log(`[Watch] 已监控本地文件夹: ${config.url}`)
  }
}
