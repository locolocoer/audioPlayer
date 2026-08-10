import { create } from 'zustand'

export type Skin = 'base' | 'cassette' | 'turntable' | 'retro'

export const SKINS: { key: Skin; label: string }[] = [
  { key: 'base', label: '默认' },
  { key: 'cassette', label: '磁带' },
  { key: 'turntable', label: '唱片机' },
  { key: 'retro', label: '霓虹复古' }
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
