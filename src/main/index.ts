import { app, BrowserWindow, shell, ipcMain, Menu, protocol, Tray, globalShortcut, screen } from 'electron'
import { autoUpdater } from 'electron-updater'
import { join } from 'path'
import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import { execFile } from 'child_process'
import { pathToFileURL } from 'url'
import { registerIpcHandlers } from './ipc'
import { initDatabase, closeDatabase, getAllWebDAVConfigs } from './database'
import { setupFolderWatchers, closeFolderWatchers } from './folderWatch'
import { buildBaseUrl, createWebDAVClient, downloadFile } from './webdav'
import type { UpdateStatus } from './types'

declare const __COMMIT__: string

app.setName('feiyu-music')

const MAX_WINDOW_WIDTH = 1600

let mainWindow: BrowserWindow | null = null
let miniWindow: BrowserWindow | null = null
let lyricsWindow: BrowserWindow | null = null
let tray: Tray | null = null
const tempDir = path.join(os.tmpdir(), 'audioplayer-cache')

function windowStatePath(): string {
  return path.join(app.getPath('userData'), 'window-state.json')
}

function loadWindowState(): { width?: number; height?: number; x?: number; y?: number } {
  try {
    const raw = fs.readFileSync(windowStatePath(), 'utf-8')
    const s = JSON.parse(raw)
    if (s && s.width && s.height) return s
  } catch { /* ignore */ }
  return {}
}

function saveWindowState(win: BrowserWindow): void {
  try {
    if (win.isDestroyed() || win.isFullScreen() || win.isMinimized() || win.isMaximized()) return
    fs.writeFileSync(windowStatePath(), JSON.stringify(win.getBounds()))
  } catch { /* ignore */ }
}

function getMainWindow(): BrowserWindow | null {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow
  return BrowserWindow.getAllWindows().find(
    (w) => w !== miniWindow && w !== lyricsWindow && !w.isDestroyed()
  ) || null
}

function sendPlayerCommand(cmd: string): void {
  const win = getMainWindow()
  if (win) {
    win.webContents.send('player:command', cmd)
  }
}

function sendUpdateStatus(payload: UpdateStatus): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send('update:status', payload)
  }
}

function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    sendUpdateStatus({ state: 'checking' })
  })
  autoUpdater.on('update-available', (info) => {
    sendUpdateStatus({ state: 'available', version: info.version })
  })
  autoUpdater.on('update-not-available', () => {
    sendUpdateStatus({ state: 'not-available' })
  })
  autoUpdater.on('download-progress', (p) => {
    sendUpdateStatus({ state: 'downloading', percent: Math.round(p.percent), message: `${p.transferred}/${p.total}` })
  })
  autoUpdater.on('update-downloaded', (info) => {
    sendUpdateStatus({ state: 'downloaded', version: info.version })
  })
  autoUpdater.on('error', (err) => {
    sendUpdateStatus({ state: 'error', message: err && err.message ? err.message : String(err) })
  })
}

function registerUpdateIpc(): void {
  ipcMain.handle('app:info', () => ({
    name: '飞鱼音乐',
    version: app.getVersion(),
    commit: __COMMIT__,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  }))

  ipcMain.handle('update:check', async () => {
    if (!app.isPackaged) {
      sendUpdateStatus({ state: 'dev' })
      return false
    }
    try {
      await autoUpdater.checkForUpdates()
      return true
    } catch (err) {
      sendUpdateStatus({ state: 'error', message: err instanceof Error ? err.message : String(err) })
      return false
    }
  })

  ipcMain.handle('update:install', () => {
    if (!app.isPackaged) return false
    setImmediate(() => autoUpdater.quitAndInstall())
    return true
  })
}

function toggleWindowVisibility(): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  if (win.isVisible()) {
    win.hide()
  } else {
    win.show()
    win.focus()
  }
}

function createTray(): void {
  const icon = findResourceFile('icon.ico')
  if (!icon) return
  tray = new Tray(icon)
  tray.setToolTip('飞鱼音乐')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示 / 隐藏', click: () => toggleWindowVisibility() },
    { type: 'separator' },
    { label: '播放 / 暂停', click: () => sendPlayerCommand('toggle') },
    { label: '上一首', click: () => sendPlayerCommand('prev') },
    { label: '下一首', click: () => sendPlayerCommand('next') },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ]))
  tray.on('click', () => toggleWindowVisibility())
}

function registerGlobalShortcuts(): void {
  const defs: [string, string][] = [
    ['MediaPlayPause', 'toggle'],
    ['MediaNextTrack', 'next'],
    ['MediaPreviousTrack', 'prev']
  ]
  for (const [accelerator, cmd] of defs) {
    try {
      globalShortcut.register(accelerator, () => sendPlayerCommand(cmd))
    } catch { /* ignore */ }
  }
}



function findResourceFile(name: string): string | null {
  const devPath = path.join(__dirname, '..', '..', 'resources', name)
  if (fs.existsSync(devPath)) return devPath
  if (process.resourcesPath) {
    const bundled = path.join(process.resourcesPath, 'resources', name)
    if (fs.existsSync(bundled)) return bundled
    const legacy = path.join(process.resourcesPath, name)
    if (fs.existsSync(legacy)) return legacy
  }
  return null
}

function createWindow(): void {
  const iconPath = findResourceFile('icon.ico')
  const saved = loadWindowState()
  mainWindow = new BrowserWindow({
    width: Math.min(saved.width || 1200, MAX_WINDOW_WIDTH),
    height: saved.height || 800,
    x: saved.x,
    y: saved.y,
    minWidth: 800,
    minHeight: 600,
    maxWidth: MAX_WINDOW_WIDTH,
    title: '飞鱼音乐',
    icon: iconPath ?? undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  mainWindow.on('ready-to-show', () => mainWindow?.show())

  let boundsTimer: ReturnType<typeof setTimeout> | null = null
  const onBoundsChange = (): void => {
    if (boundsTimer) clearTimeout(boundsTimer)
    boundsTimer = setTimeout(() => { if (mainWindow) saveWindowState(mainWindow) }, 500)
  }
  mainWindow.on('resize', onBoundsChange)
  mainWindow.on('move', onBoundsChange)
  mainWindow.on('close', () => { if (mainWindow) saveWindowState(mainWindow) })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createMiniWindow(): void {
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.show()
    miniWindow.focus()
    return
  }
  miniWindow = new BrowserWindow({
    width: 380,
    height: 88,
    alwaysOnTop: true,
    resizable: false,
    frame: false,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  miniWindow.setAlwaysOnTop(true, 'floating')
  if (process.env.ELECTRON_RENDERER_URL) {
    miniWindow.loadURL(process.env.ELECTRON_RENDERER_URL + '#mini')
  } else {
    miniWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'mini' })
  }
  miniWindow.on('closed', () => { miniWindow = null })
}

function lyricsWindowStatePath(): string {
  return path.join(app.getPath('userData'), 'lyrics-window-state.json')
}

function createLyricsWindow(): void {
  if (lyricsWindow && !lyricsWindow.isDestroyed()) {
    lyricsWindow.show()
    return
  }
  const win = BrowserWindow.getAllWindows().find((w) => w !== miniWindow && !w.isDestroyed())
  const bounds: Electron.Rectangle = win?.getBounds() || { x: 0, y: 0, width: 1200, height: 800 }
  const lw = Math.min(900, Math.max(480, bounds.width - 200))
  let savedPos: { x?: number; y?: number } = {}
  try {
    const raw = fs.readFileSync(lyricsWindowStatePath(), 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.x === 'number' && typeof parsed.y === 'number') savedPos = parsed
  } catch { /* ignore */ }
  const display = screen.getDisplayMatching(bounds)
  lyricsWindow = new BrowserWindow({
    width: lw,
    height: 96,
    x: savedPos.x ?? Math.round(bounds.x + (bounds.width - lw) / 2),
    y: savedPos.y ?? Math.max(24, Math.round(display.workArea.y + display.workArea.height * 0.78)),
    alwaysOnTop: true,
    transparent: true,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  lyricsWindow.setAlwaysOnTop(true, 'screen-saver')
  if (process.env.ELECTRON_RENDERER_URL) {
    lyricsWindow.loadURL(process.env.ELECTRON_RENDERER_URL + '#lyrics')
  } else {
    lyricsWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'lyrics' })
  }
  let lyrTimer: ReturnType<typeof setTimeout> | null = null
  const onLyrMove = (): void => {
    if (lyrTimer) clearTimeout(lyrTimer)
    lyrTimer = setTimeout(() => {
      if (lyricsWindow && !lyricsWindow.isDestroyed()) {
        try {
          fs.writeFileSync(lyricsWindowStatePath(), JSON.stringify(lyricsWindow.getBounds()))
        } catch { /* ignore */ }
      }
    }, 300)
  }
  lyricsWindow.on('moved', onLyrMove)
  lyricsWindow.on('closed', () => { lyricsWindow = null })
}

function registerWindowIpc(): void {
  ipcMain.handle('window:mini', (_e, open: boolean) => {
    if (open) createMiniWindow()
    else if (miniWindow && !miniWindow.isDestroyed()) miniWindow.close()
    return true
  })

  ipcMain.handle('window:lyrics', (_e, open: boolean) => {
    if (open) createLyricsWindow()
    else if (lyricsWindow && !lyricsWindow.isDestroyed()) lyricsWindow.close()
    return true
  })

  ipcMain.handle('player:sendCommand', (_e, cmd: string) => {
    sendPlayerCommand(cmd)
    return true
  })
}

function registerLyricsIpc(): void {
  ipcMain.on('lyrics:sync', (_e, trackId: number, lrcText: string) => {
    if (lyricsWindow && !lyricsWindow.isDestroyed()) {
      lyricsWindow.webContents.send('lyrics:sync-broadcast', { trackId, lrcText })
    }
  })
  ipcMain.on('lyrics:time', (_e, trackId: number, time: number) => {
    if (lyricsWindow && !lyricsWindow.isDestroyed()) {
      lyricsWindow.webContents.send('lyrics:time-broadcast', { trackId, time })
    }
  })
}

function findFFmpeg(): string {
  const name = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  return findResourceFile(name) || 'ffmpeg'
}

function transcodeToPCM(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(findFFmpeg(), [
      '-y', '-i', inputPath, '-acodec', 'pcm_s16le', '-ar', '44100', '-ac', '2', outputPath
    ], { timeout: 120000 }, (err) => {
      if (!err) { resolve(); return }
      const buf = fs.readFileSync(inputPath)
      const dtsPath = inputPath + '.dts'
      fs.writeFileSync(dtsPath, buf.subarray(44))
      execFile(findFFmpeg(), [
        '-y', '-f', 'dts', '-i', dtsPath, '-acodec', 'pcm_s16le', '-ar', '44100', '-ac', '2', outputPath
      ], { timeout: 120000 }, (err2) => {
        try { fs.unlinkSync(dtsPath) } catch { /* */ }
        if (err2) reject(err2)
        else resolve()
      })
    })
  })
}

function registerLocalMediaProtocol(): void {
  protocol.handle('local-media', async (request) => {
    try {
      const filePath = path.join(tempDir, new URL(request.url).hostname)
      if (!fs.existsSync(filePath)) return new Response('Not found', { status: 404 })
      const buf = fs.readFileSync(filePath)
      return new Response(buf, {
        status: 200,
        headers: { 'Content-Type': 'audio/wav', 'Content-Length': String(buf.length) }
      })
    } catch {
      return new Response('Error', { status: 500 })
    }
  })
}

function registerWebDAVMediaProtocol(): void {
  protocol.handle('webdav-media', async (request) => {
    try {
      const url = new URL(request.url)
      const configId = url.hostname
      const filePath = decodeURIComponent(url.pathname.replace(/^\//, ''))
      const config = getAllWebDAVConfigs().find((c) => c.id === configId && c.sourceType === 'webdav')
      if (!config) return new Response('Not found', { status: 404 })

      const baseUrl = buildBaseUrl(config).replace(/\/+$/, '')
      const fullUrl = `${baseUrl}/${filePath.replace(/^\/+/, '')}`
      const auth = 'Basic ' + Buffer.from(`${config.username}:${config.password}`).toString('base64')

      const headers: Record<string, string> = { Authorization: auth }
      const range = request.headers.get('Range')
      if (range) headers.Range = range

      const res = await fetch(fullUrl, { headers })
      if (!res.body) return new Response('Empty response', { status: 500 })
      if (res.status !== 200 && res.status !== 206) {
        return new Response('Upstream error', { status: res.status })
      }

      const respHeaders: Record<string, string> = { 'Accept-Ranges': 'bytes' }
      const contentRange = res.headers.get('Content-Range')
      const contentLength = res.headers.get('Content-Length')
      const contentType = res.headers.get('Content-Type') || 'application/octet-stream'
      if (contentRange) respHeaders['Content-Range'] = contentRange
      if (contentLength) respHeaders['Content-Length'] = contentLength
      respHeaders['Content-Type'] = contentType

      return new Response(res.body, { status: res.status, headers: respHeaders })
    } catch {
      return new Response('Error', { status: 500 })
    }
  })
}

function getCacheKey(configId: string, filePath: string, ext?: string): string {
  const useExt = ext || path.extname(filePath)
  const hash = crypto.createHash('sha1').update(filePath).digest('hex').substring(0, 16)
  return configId + '_' + hash + useExt
}

function registerPlayerIpc(): void {
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })

  ipcMain.handle('player:getAudioPath', async (_event, configId: string, filePath: string) => {
    console.log(`[Player] getAudioPath: configId=${configId}`)
    try {
      const configs = getAllWebDAVConfigs()
      const config = configs.find((c) => c.id === configId)
      if (!config) return { error: 'Config not found' }

      if (config.sourceType === 'local') {
        if (fs.existsSync(filePath)) {
          console.log(`[Player] LOCAL: "${filePath}"`)
          return { localUrl: pathToFileURL(filePath).toString() }
        }
        return { error: 'File not found' }
      }

      // WebDAV 流式播放：直接代理 Range 请求，不再整文件下载缓存
      console.log(`[Player] WEBDAV STREAM: "${filePath}"`)
      return { localUrl: `webdav-media://${configId}/${encodeURIComponent(filePath)}` }
    } catch (err) {
      return { error: (err instanceof Error ? err.message : String(err)) }
    }
  })

  ipcMain.handle('player:getCover', async (_event, configId: string, filePath: string) => {
    try {
      const configs = getAllWebDAVConfigs()
      const config = configs.find((c) => c.id === configId)

      let targetPath: string
      if (config?.sourceType === 'local') {
        targetPath = filePath
      } else {
        const cacheKey = getCacheKey(configId, filePath)
        const cachedPath = path.join(tempDir, cacheKey)
        if (fs.existsSync(cachedPath) && fs.statSync(cachedPath).size >= 1024) {
          targetPath = cachedPath
        } else {
          if (!config) return { data: [], format: '' }
          const client = createWebDAVClient(config)
          const buffer = await downloadFile(client, filePath)
          if (buffer.length < 1024) return { data: [], format: '' }
          fs.writeFileSync(cachedPath, buffer)
          targetPath = cachedPath
        }
      }

      const musicMetadata = await import('music-metadata')
      const metadata = await musicMetadata.parseFile(targetPath)
      const picture = metadata.common.picture?.[0]
      if (picture) {
        return { data: Array.from(picture.data as Buffer), format: picture.format || 'image/jpeg' }
      }
      return { data: [], format: '' }
    } catch {
      return { data: [], format: '' }
    }
  })

  ipcMain.handle('player:getLrc', async (_event, configId: string, filePath: string) => {
    try {
      const configs = getAllWebDAVConfigs()
      const config = configs.find((c) => c.id === configId)
      console.log(`[Lrc] request: configId=${configId} path=${filePath}`)

      let targetPath: string
      if (config?.sourceType === 'local') {
        targetPath = filePath
      } else {
        const cacheKey = getCacheKey(configId, filePath)
        const cachedPath = path.join(tempDir, cacheKey)
        if (fs.existsSync(cachedPath) && fs.statSync(cachedPath).size >= 1024) {
          targetPath = cachedPath
        } else {
          if (!config) return { text: '' }
          console.log(`[Lrc] downloading audio: ${filePath}`)
          const client = createWebDAVClient(config)
          const buffer = await downloadFile(client, filePath)
          if (buffer.length < 1024) return { text: '' }
          fs.writeFileSync(cachedPath, buffer)
          targetPath = cachedPath
        }
      }

      const musicMetadata = await import('music-metadata')
      const metadata = await musicMetadata.parseFile(targetPath, { skipCovers: true })
      const lyricsItem = metadata.common.lyrics?.[0]

      if (lyricsItem) {
        let lrcText = ''

        if ((lyricsItem as { syncText?: { timestamp: number; text: string }[] }).syncText) {
          const syncText = (lyricsItem as { syncText: { timestamp: number; text: string }[] }).syncText
          const lines: string[] = []
          for (const item of syncText) {
            const embedded = item.text.match(/^((?:\[\d+:\d+\.\d+\])+)/)
            const cleanText = item.text.replace(/^(\[\d+:\d+\.\d+\])+\s*/, '').trim()
            if (!cleanText) continue

            if (embedded) {
              const re = /\[(\d+):(\d+\.\d+)\]/g
              let m: RegExpExecArray | null
              while ((m = re.exec(embedded[1])) !== null) {
                const mins = parseInt(m[1], 10)
                const secs = parseFloat(m[2]).toFixed(2)
                lines.push(`[${String(mins).padStart(2, '0')}:${String(secs).padStart(5, '0')}]${cleanText}`)
              }
            } else {
              const secs = item.timestamp / 1000
              const mins = Math.floor(secs / 60)
              const remain = (secs % 60).toFixed(2)
              lines.push(`[${String(mins).padStart(2, '0')}:${String(remain).padStart(5, '0')}]${cleanText}`)
            }
          }
          lrcText = lines.join('\n')
          console.log(`[Lrc] found SYLT lyrics: ${lines.length} lines`)
        } else if (typeof (lyricsItem as { text: string }).text === 'string') {
          lrcText = (lyricsItem as { text: string }).text
          console.log(`[Lrc] found USLT lyrics: ${lrcText.length} chars`)
        } else if (typeof lyricsItem === 'string') {
          lrcText = lyricsItem
          console.log(`[Lrc] found raw lyrics: ${lrcText.length} chars`)
        }

        if (lrcText.length > 10) {
          return { text: lrcText }
        }
      }
      console.log('[Lrc] no embedded lyrics, trying .lrc file')

      const lrcPath = filePath.replace(/\.[^.]+$/, '.lrc')
      if (config?.sourceType === 'local') {
        if (fs.existsSync(lrcPath)) {
          const text = fs.readFileSync(lrcPath, 'utf-8')
          console.log(`[Lrc] found external .lrc: ${text.length} chars`)
          return { text }
        }
      } else if (config) {
        try {
          const client = createWebDAVClient(config)
          const buffer = await downloadFile(client, lrcPath)
          if (buffer.length > 10) {
            const text = buffer.toString('utf-8')
            console.log(`[Lrc] found external .lrc: ${text.length} chars`)
            return { text }
          }
        } catch { /* no external lrc */ }
      }

      console.log('[Lrc] no lyrics found')
      return { text: '' }
    } catch (err) {
      console.error('[Lrc] error:', err)
      return { text: '' }
    }
  })

  ipcMain.handle('player:getFallbackAudio', async (_event, configId: string, filePath: string) => {
    try {
      const configs = getAllWebDAVConfigs()
      const config = configs.find((c) => c.id === configId)
      if (!config) return { error: 'Config not found' }

      let inputPath: string
      if (config.sourceType === 'local') {
        if (!fs.existsSync(filePath)) return { error: 'File not found' }
        inputPath = filePath
      } else {
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })
        const cacheKey = getCacheKey(configId, filePath)
        const cachedPath = path.join(tempDir, cacheKey)
        if (!fs.existsSync(cachedPath) || fs.statSync(cachedPath).size < 1024) {
          try { fs.unlinkSync(cachedPath) } catch { /* ignore */ }
          const client = createWebDAVClient(config)
          const buffer = await downloadFile(client, filePath)
          if (buffer.length < 1024) return { error: 'Invalid audio data' }
          fs.writeFileSync(cachedPath, buffer)
        }
        inputPath = cachedPath
      }

      const pcmKey = getCacheKey(configId, filePath, '.pcm.wav')
      const pcmPath = path.join(tempDir, pcmKey)
      if (!fs.existsSync(pcmPath) || fs.statSync(pcmPath).size < 1024) {
        try { fs.unlinkSync(pcmPath) } catch { /* ignore */ }
        console.log(`[Player] 转码兜底: ${filePath}`)
        await transcodeToPCM(inputPath, pcmPath)
      }
      if (!fs.existsSync(pcmPath) || fs.statSync(pcmPath).size < 1024) {
        return { error: 'Transcode failed' }
      }
      return { localUrl: `local-media://${pcmKey}` }
    } catch (err) {
      return { error: (err instanceof Error ? err.message : String(err)) }
    }
  })
}

app.whenReady().then(async () => {
  console.log('[Player] 飞鱼音乐启动中...')
  app.setAppUserModelId('com.feiYuMusic.app')
  Menu.setApplicationMenu(null)
  await initDatabase()
  registerIpcHandlers()
  registerLocalMediaProtocol()
  registerWebDAVMediaProtocol()
  registerPlayerIpc()
  registerWindowIpc()
  registerLyricsIpc()
  registerUpdateIpc()
  setupAutoUpdater()
  createWindow()
  createTray()
  registerGlobalShortcuts()
  setupFolderWatchers()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  closeFolderWatchers()
})

app.on('window-all-closed', () => {
  closeDatabase()
  if (process.platform !== 'darwin') app.quit()
})
