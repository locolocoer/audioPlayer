import { create } from 'zustand'

export type ShortcutAction = 'playPause' | 'next' | 'prev' | 'seekForward' | 'seekBackward' | 'volumeUp' | 'volumeDown'

export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  playPause: '播放 / 暂停',
  next: '下一首',
  prev: '上一首',
  seekForward: '快进 5 秒',
  seekBackward: '快退 5 秒',
  volumeUp: '音量增大',
  volumeDown: '音量减小'
}

const DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = {
  playPause: 'Space',
  next: 'Ctrl+ArrowRight',
  prev: 'Ctrl+ArrowLeft',
  seekForward: 'ArrowRight',
  seekBackward: 'ArrowLeft',
  volumeUp: 'ArrowUp',
  volumeDown: 'ArrowDown'
}

const STORAGE_KEY = 'shortcuts'

function load(): Record<ShortcutAction, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return { ...DEFAULT_SHORTCUTS, ...parsed }
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_SHORTCUTS }
}

interface ShortcutsState {
  shortcuts: Record<ShortcutAction, string>
  setShortcut: (action: ShortcutAction, keys: string) => void
  resetShortcuts: () => void
}

export const useShortcutsStore = create<ShortcutsState>((set, get) => ({
  shortcuts: load(),
  setShortcut: (action, keys) => {
    const next = { ...get().shortcuts, [action]: keys }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch { /* ignore */ }
    set({ shortcuts: next })
  },
  resetShortcuts: () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch { /* ignore */ }
    set({ shortcuts: { ...DEFAULT_SHORTCUTS } })
  }
}))

export function formatShortcut(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey) parts.push('Alt')
  parts.push(e.code)
  return parts.join('+')
}
