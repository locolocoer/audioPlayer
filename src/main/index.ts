import { app, BrowserWindow, shell, ipcMain, Menu, protocol } from 'electron'
import { join } from 'path'
import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import { execFile } from 'child_process'
import { pathToFileURL } from 'url'
import { registerIpcHandlers } from './ipc'
import { initDatabase, closeDatabase, getWebDAVConfigs } from './database'
import { buildBaseUrl, createWebDAVClient, downloadFile } from './webdav'

let mainWindow: BrowserWindow | null = null
const tempDir = path.join(os.tmpdir(), 'audioplayer-cache')

function createWindow(): void {
  const iconPath = path.join(__dirname, '../../resources/icon.png')
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: '椋為奔闊充箰',
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  mainWindow.on('ready-to-show', () => mainWindow?.show())
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

function findFFmpeg(): string {
  const devPath = path.join(__dirname, '..', '..', 'resources', 'ffmpeg.exe')
  if (fs.existsSync(devPath)) return devPath
  if (process.resourcesPath) {
    const bundled = path.join(process.resourcesPath, 'ffmpeg.exe')
    if (fs.existsSync(bundled)) return bundled
  }
  return 'ffmpeg'
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
      const configs = getWebDAVConfigs()
      const config = configs.find((c) => c.id === configId)
      if (!config) return { error: 'Config not found' }

      if (config.sourceType === 'local') {
        if (fs.existsSync(filePath)) {
          const ext = path.extname(filePath).toLowerCase()
          if (ext === '.wav') {
            const cacheKey = getCacheKey(configId, filePath)
            const cachedPath = path.join(tempDir, cacheKey)
            try {
              if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })
              try { fs.unlinkSync(cachedPath) } catch { /* */ }
              const rawPath = cachedPath + '.raw'
              fs.copyFileSync(filePath, rawPath)
              await transcodeToPCM(rawPath, cachedPath)
              try { fs.unlinkSync(rawPath) } catch { /* */ }
              console.log(`[Player] LOCAL WAV OK: size=${fs.statSync(cachedPath).size}`)
              return { localUrl: `local-media://${path.basename(cachedPath)}` }
            } catch {
              console.log(`[Player] WAV fallback to direct play`)
            }
          }
          console.log(`[Player] LOCAL: "${filePath}"`)
          return { localUrl: pathToFileURL(filePath).toString() }
        }
        return { error: 'File not found' }
      }

      const ext = path.extname(filePath)
      const cacheKey = getCacheKey(configId, filePath)
      const cachedPath = path.join(tempDir, cacheKey)

      if (fs.existsSync(cachedPath) && fs.statSync(cachedPath).size > 1024) {
        return { localUrl: `local-media://${cacheKey}` }
      }
      try { fs.unlinkSync(cachedPath) } catch { /* */ }

      const client = createWebDAVClient(config)
      const buffer = await downloadFile(client, filePath)
      if (buffer.length < 1024) {
        return { error: `Invalid audio data (${buffer.length} bytes)` }
      }

      if (ext.toLowerCase() === '.wav') {
        const rawPath = cachedPath + '.raw'
        fs.writeFileSync(rawPath, buffer)
        try {
          await transcodeToPCM(rawPath, cachedPath)
          fs.unlinkSync(rawPath)
          console.log(`[Player] WAV->PCM OK: size=${fs.statSync(cachedPath).size}`)
        } catch (e) {
          try { fs.unlinkSync(rawPath) } catch { /* */ }
          console.log(`[Player] FFmpeg failed, trying raw: ${e}`)
          fs.writeFileSync(cachedPath, buffer)
        }
      } else {
        fs.writeFileSync(cachedPath, buffer)
      }

      console.log(`[Player] READY: ext=${ext} size=${fs.statSync(cachedPath).size}`)
      return { localUrl: `local-media://${cacheKey}` }
    } catch (err) {
      return { error: (err instanceof Error ? err.message : String(err)) }
    }
  })

  ipcMain.handle('player:getCover', async (_event, configId: string, filePath: string) => {
    try {
      const configs = getWebDAVConfigs()
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
      const configs = getWebDAVConfigs()
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
}

app.whenReady().then(async () => {
  console.log('[Player] 椋為奔闊充箰鍚姩涓?..')
  Menu.setApplicationMenu(null)
  await initDatabase()
  registerIpcHandlers()
  registerLocalMediaProtocol()
  registerPlayerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeDatabase()
  if (process.platform !== 'darwin') app.quit()
})
