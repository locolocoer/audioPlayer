import { create } from 'zustand'

type Align = 'left' | 'center' | 'right'

interface LyricsStyleState {
  fontSize: number
  align: Align
  setFontSize: (n: number) => void
  setAlign: (a: Align) => void
}

const KEY = 'lyrics_style'

function load(): { fontSize: number; align: Align } {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw)
      return {
        fontSize: Number(p.fontSize) || 16,
        align: p.align === 'left' || p.align === 'right' ? p.align : 'center'
      }
    }
  } catch { /* ignore */ }
  return { fontSize: 16, align: 'center' }
}

export const useLyricsStyleStore = create<LyricsStyleState>((set, get) => {
  const s = load()
  const save = (): void => {
    const cur = get()
    try {
      localStorage.setItem(KEY, JSON.stringify({ fontSize: cur.fontSize, align: cur.align }))
    } catch { /* ignore */ }
  }
  return {
    fontSize: s.fontSize,
    align: s.align,
    setFontSize: (n: number) => { set({ fontSize: Math.max(12, Math.min(32, n)) }); save() },
    setAlign: (a: Align) => { set({ align: a }); save() }
  }
})
