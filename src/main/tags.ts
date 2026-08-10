import NodeID3 from 'node-id3'
import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'

function findFFmpeg(): string {
  const dev = path.join(__dirname, '..', '..', 'resources', 'ffmpeg.exe')
  if (fs.existsSync(dev)) return dev
  if (process.resourcesPath) {
    const bundled = path.join(process.resourcesPath, 'resources', 'ffmpeg.exe')
    if (fs.existsSync(bundled)) return bundled
  }
  return 'ffmpeg'
}

function writeFlacMetadata(filePath: string, meta: { title?: string; artist?: string; album?: string }): Promise<void> {
  return new Promise((resolve) => {
    const args = ['-y', '-i', filePath]
    if (meta.title !== undefined) args.push('-metadata', `title=${meta.title}`)
    if (meta.artist !== undefined) args.push('-metadata', `artist=${meta.artist}`)
    if (meta.album !== undefined) args.push('-metadata', `album=${meta.album}`)
    if (args.length <= 4) {
      resolve()
      return
    }
    const tmp = filePath + '.feiyu-tagtmp.flac'
    args.push('-codec', 'copy', tmp)

    const cleanup = (): void => {
      try { fs.unlinkSync(tmp) } catch { /* ignore */ }
    }

    execFile(findFFmpeg(), args, { timeout: 120000 }, (err) => {
      try {
        if (err) {
          console.log(`[Tags] FLAC 写入失败: ${filePath} ${err.message}`)
          cleanup()
        } else if (!fs.existsSync(tmp) || fs.statSync(tmp).size < 1024) {
          console.log(`[Tags] FLAC 输出无效: ${filePath}`)
          cleanup()
        } else {
          // 校验 FLAC 头，确保输出是有效 FLAC 再替换原文件
          const head = fs.readFileSync(tmp).subarray(0, 4).toString('ascii')
          if (head !== 'fLaC') {
            console.log(`[Tags] FLAC 头校验失败: ${filePath}`)
            cleanup()
          } else {
            fs.renameSync(tmp, filePath)
            console.log(`[Tags] FLAC 已写入: ${filePath}`)
          }
        }
      } catch (e) {
        console.log(`[Tags] FLAC 写入异常: ${filePath} ${e}`)
        cleanup()
      }
      resolve()
    })
  })
}

export async function writeTagsToLocalMp3(filePath: string, meta: { title?: string; artist?: string; album?: string }): Promise<void> {
  try {
    if (!fs.existsSync(filePath)) return
    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
    if (ext === '.flac') {
      await writeFlacMetadata(filePath, meta)
      return
    }
    if (ext !== '.mp3') return
    const tags: NodeID3.Tags = {}
    if (meta.title !== undefined) tags.title = meta.title
    if (meta.artist !== undefined) tags.artist = meta.artist
    if (meta.album !== undefined) tags.album = meta.album
    if (Object.keys(tags).length === 0) return
    const result = await NodeID3.update(tags, filePath)
    if (result) {
      console.log(`[Tags] 已写入: ${filePath}`)
    } else {
      console.log(`[Tags] 写入失败: ${filePath}`)
    }
  } catch (err) {
    console.log(`[Tags] 写入异常: ${filePath} ${err}`)
  }
}
