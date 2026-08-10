import NodeID3 from 'node-id3'
import fs from 'fs'

export async function writeTagsToLocalMp3(filePath: string, meta: { title?: string; artist?: string; album?: string }): Promise<void> {
  try {
    if (!fs.existsSync(filePath)) return
    if (filePath.slice(filePath.lastIndexOf('.')).toLowerCase() !== '.mp3') return
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
