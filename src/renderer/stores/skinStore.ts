import { create } from 'zustand'

export type Skin = 'base' | 'cassette' | 'turntable' | 'retro'

export const SKINS: { key: Skin; labelKey: string }[] = [
  { key: 'base', labelKey: 'skin.base' },
  { key: 'cassette', labelKey: 'skin.cassette' },
  { key: 'turntable', labelKey: 'skin.turntable' },
  { key: 'retro', labelKey: 'skin.retro' }
]

interface SkinState {
  skin: Skin
  setSkin: (s: Skin) => void
}

function getInitialSkin(): Skin {
  const s = localStorage.getItem('skin') as Skin | null
  return s === 'cassette' || s === 'turntable' || s === 'retro' ? s : 'base'
}

export const useSkinStore = create<SkinState>((set) => ({
  skin: getInitialSkin(),
  setSkin: (s: Skin) => {
    localStorage.setItem('skin', s)
    set({ skin: s })
  }
}))
