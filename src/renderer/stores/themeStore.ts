import { create } from 'zustand'

export type Theme = 'dark' | 'light'

export const DEFAULT_ACCENT = '#e94560'

function getInitialTheme(): Theme {
  const saved = localStorage.getItem('theme')
  if (saved === 'light' || saved === 'dark') return saved
  return 'dark'
}

function getStoredAccent(): string {
  const saved = localStorage.getItem('accent')
  return saved || DEFAULT_ACCENT
}

export function lightenHex(hex: string, amount: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim())
  if (!m) return hex
  const mix = (c: number): number => Math.round(c + (255 - c) * amount)
  const r = mix(parseInt(m[1], 16))
  const g = mix(parseInt(m[2], 16))
  const b = mix(parseInt(m[3], 16))
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

export function darkenHex(hex: string, amount: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim())
  if (!m) return hex
  const mix = (c: number): number => Math.round(c * (1 - amount))
  const r = mix(parseInt(m[1], 16))
  const g = mix(parseInt(m[2], 16))
  const b = mix(parseInt(m[3], 16))
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

interface ThemeState {
  theme: Theme
  accent: string
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
  setAccent: (color: string) => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: getInitialTheme(),
  accent: getStoredAccent(),
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('theme', next)
    set({ theme: next })
  },
  setTheme: (theme: Theme) => {
    localStorage.setItem('theme', theme)
    set({ theme })
  },
  setAccent: (color: string) => {
    if (!/^#([a-f\d]{6})$/i.test(color.trim())) return
    localStorage.setItem('accent', color.trim())
    set({ accent: color.trim() })
  }
}))
