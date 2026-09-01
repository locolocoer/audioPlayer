import { createClient, WebDAVClient } from 'webdav'
import type { WebDAVConfig } from './types'

function buildBaseUrl(config: WebDAVConfig): string {
  const raw = config.url.trim().replace(/\/+$/, '')
  // URL 已显式包含端口时，不再重复拼接 config.port
  const portMatch = raw.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/:]+:(\d+)/)
  if (portMatch) return raw
  const isHttps = raw.startsWith('https://')
  const defaultPort = isHttps ? 443 : 80
  if (config.port && config.port !== defaultPort && config.port > 0) {
    return `${raw}:${config.port}`
  }
  return raw
}

export { buildBaseUrl }

// WebDAV 请求超时：网络盘不可达时避免请求无限悬挂（播放/扫描/封面歌词加载全部走这里）
const REQUEST_TIMEOUT = 30000

function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
  return run(controller.signal).finally(() => clearTimeout(timer))
}

export function createWebDAVClient(config: WebDAVConfig): WebDAVClient {
  const baseUrl = buildBaseUrl(config)
  return createClient(baseUrl, {
    username: config.username,
    password: config.password
  })
}

export async function testConnection(config: WebDAVConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = createWebDAVClient(config)
    const contents = await withTimeout((signal) => client.getDirectoryContents('/', { signal }))
    if (Array.isArray(contents)) {
      return { ok: true }
    }
    return { ok: false, error: 'Unexpected response from server' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
}

export async function getDirectoryContents(
  client: WebDAVClient,
  path: string
): Promise<{ filename: string; basename: string; type: 'file' | 'directory'; size: number; lastmod: string }[]> {
  const items = await withTimeout((signal) => client.getDirectoryContents(path, { signal }))
  if (!Array.isArray(items)) {
    return []
  }
  return items.map((item) => ({
    filename: item.filename,
    basename: item.basename,
    type: item.type as 'file' | 'directory',
    size: item.size,
    lastmod: item.lastmod
  }))
}

export async function downloadFile(
  client: WebDAVClient,
  filePath: string
): Promise<Buffer> {
  const content = await withTimeout((signal) =>
    client.getFileContents(filePath, { format: 'binary', signal })
  )
  if (Buffer.isBuffer(content)) {
    return content
  }
  if (typeof content === 'string') {
    return Buffer.from(content, 'binary')
  }
  if (content instanceof ArrayBuffer) {
    return Buffer.from(content)
  }
  if (content && typeof content === 'object') {
    const data = (content as unknown as { data?: number[] }).data
    if (Array.isArray(data)) return Buffer.from(data)
  }
  return Buffer.from(String(content), 'binary')
}
