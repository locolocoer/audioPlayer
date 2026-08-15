export function parseLrc(lrcText: string): { time: number; text: string }[] {
  const lines = lrcText.split('\n')
  const result: { time: number; text: string }[] = []
  const timeRe = /\[(\d+):(\d+(?:\.\d+)?)\]/g
  for (const line of lines) {
    timeRe.lastIndex = 0
    const times: number[] = []
    let m: RegExpExecArray | null
    while ((m = timeRe.exec(line)) !== null) {
      times.push(parseInt(m[1], 10) * 60 + parseFloat(m[2]))
    }
    if (times.length === 0) continue
    const text = line.replace(timeRe, '').trim()
    if (!text) continue
    for (const t of times) {
      result.push({ time: t, text })
    }
  }
  return result.sort((a, b) => a.time - b.time)
}

export function activeLyricIndex(lyrics: { time: number }[], currentTime: number): number {
  for (let i = lyrics.length - 1; i >= 0; i--) {
    if (currentTime >= lyrics[i].time) return i
  }
  return -1
}
