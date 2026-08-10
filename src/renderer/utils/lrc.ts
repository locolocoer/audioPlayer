export function parseLrc(lrcText: string): { time: number; text: string }[] {
  const lines = lrcText.split('\n')
  const result: { time: number; text: string }[] = []
  const tagRe = /^\[(\d+):(\d+(?:\.\d+)?)\](.*)/
  for (const line of lines) {
    const match = line.match(tagRe)
    if (match) {
      const min = parseInt(match[1], 10)
      const sec = parseFloat(match[2])
      const text = match[3].trim()
      if (text) result.push({ time: min * 60 + sec, text })
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
