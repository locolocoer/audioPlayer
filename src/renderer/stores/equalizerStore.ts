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

export const useEqualizerStore = create<EqualizerState>((set) => ({
  enabled: false,
  gains: EQ_PRESETS[0].gains.slice(),
  presetName: 'Flat',
  toggleEnabled: () => set((s) => ({ enabled: !s.enabled })),
  setGain: (index: number, value: number) => {
    set((s) => {
      const newGains = s.gains.slice()
      newGains[index] = value
      return { gains: newGains, presetName: 'Custom' }
    })
  },
  applyPreset: (preset: EqPreset) => {
    set({ gains: preset.gains.slice(), presetName: preset.name })
  },
  reset: () => {
    set({ gains: EQ_PRESETS[0].gains.slice(), presetName: 'Flat', enabled: false })
  }
}))
