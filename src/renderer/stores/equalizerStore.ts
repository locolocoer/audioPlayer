import { create } from 'zustand'

export const EQ_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

export interface EqPreset {
  name: string
  gains: number[]
}

export const EQ_PRESETS: EqPreset[] = [
  { name: 'Flat', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: 'Pop', gains: [0, 1, 2, 3, 2, 0, -1, -1, 0, 0] },
  { name: 'Rock', gains: [4, 3, 1, 0, -1, 2, 4, 3, 2, 1] },
  { name: 'Jazz', gains: [0, 2, 1, 2, 0, -1, 0, 1, 0, 0] },
  { name: 'Classical', gains: [0, 1, 1, 0, -2, -1, 0, 1, 1, 0] },
  { name: 'Bass Boost', gains: [5, 4, 3, 1, 0, 0, 0, 0, 0, 0] }
]

interface EqualizerState {
  enabled: boolean
  gains: number[]
  presetName: string
  toggleEnabled: () => void
  setGain: (index: number, value: number) => void
  applyPreset: (preset: EqPreset) => void
  reset: () => void
}

const STORAGE_KEY = 'eq_state'

function clamp(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.max(-12, Math.min(12, v))
}

function loadStored(): { enabled: boolean; gains: number[]; presetName: string } {
  const fallback = { enabled: false, gains: EQ_PRESETS[0].gains.slice(), presetName: 'Flat' }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    const gains = Array.isArray(parsed.gains) && parsed.gains.length === EQ_BANDS.length
      ? parsed.gains.map((n: unknown) => clamp(Number(n)))
      : fallback.gains
    return {
      enabled: !!parsed.enabled,
      gains,
      presetName: typeof parsed.presetName === 'string' ? parsed.presetName : 'Flat'
    }
  } catch {
    return fallback
  }
}

export const useEqualizerStore = create<EqualizerState>((set, get) => {
  const stored = loadStored()

  const save = (): void => {
    const s = get()
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        enabled: s.enabled,
        gains: s.gains,
        presetName: s.presetName
      }))
    } catch { /* ignore */ }
  }

  return {
    enabled: stored.enabled,
    gains: stored.gains,
    presetName: stored.presetName,

    toggleEnabled: () => {
      set((s) => ({ enabled: !s.enabled }))
      save()
    },

    setGain: (index: number, value: number) => {
      set((s) => {
        const newGains = s.gains.slice()
        newGains[index] = clamp(value)
        return { gains: newGains, presetName: 'Custom' }
      })
      save()
    },

    applyPreset: (preset: EqPreset) => {
      set({ gains: preset.gains.slice(), presetName: preset.name })
      save()
    },

    reset: () => {
      set({ gains: EQ_PRESETS[0].gains.slice(), presetName: 'Flat', enabled: false })
      save()
    }
  }
})
