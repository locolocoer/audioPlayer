export function parseLrc(lrcText: string): { time: number; text: string }[] {
  const lines = lrcText.split('\n')
  const result: { time: number; text: string }[] = []
  const timeRe = /\[(\d+):(\d+(?:\.\d+)?)\]/g
  let hasTime = false
  for (const line of lines) {
    timeRe.lastIndex = 0
    const times: number[] = []
    let m: RegExpExecArray | null
    while ((m = timeRe.exec(line)) !== null) {
      times.push(parseInt(m[1], 10) * 60 + parseFloat(m[2]))
    }
    if (times.length === 0) continue
    hasTime = true
    const text = line.replace(timeRe, '').trim()
    if (!text) continue
    for (const t of times) {
      result.push({ time: t, text })
    }
  }
  if (hasTime) return result.sort((a, b) => a.time - b.time)
  // 纯文本歌词（无时间标签）：按行赋予递增时间，保证可显示并自动滚动
  let idx = 0
  for (const line of lines) {
    const text = line.trim()
    if (!text) continue
    result.push({ time: idx * 4, text })
    idx++
  }
  return result
}

export function activeLyricIndex(lyrics: { time: number }[], currentTime: number): number {
  for (let i = lyrics.length - 1; i >= 0; i--) {
    if (currentTime >= lyrics[i].time) return i
  }
  return -1
}
