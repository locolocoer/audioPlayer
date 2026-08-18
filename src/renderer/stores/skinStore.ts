import { create } from 'zustand'

export type Skin =
  | 'base'
  | 'cassette'
  | 'turntable'
  | 'retro'
  | 'glass'
  | 'sunset'
  | 'ocean'
  | 'mono'
  | 'cyber'
  | 'forest'
  | 'ember'
  | 'rose'

export const SKINS: { key: Skin; labelKey: string }[] = [
  { key: 'base', labelKey: 'skin.base' },
  { key: 'glass', labelKey: 'skin.glass' },
  { key: 'sunset', labelKey: 'skin.sunset' },
  { key: 'ocean', labelKey: 'skin.ocean' },
  { key: 'forest', labelKey: 'skin.forest' },
  { key: 'rose', labelKey: 'skin.rose' },
  { key: 'ember', labelKey: 'skin.ember' },
  { key: 'cyber', labelKey: 'skin.cyber' },
  { key: 'cassette', labelKey: 'skin.cassette' },
  { key: 'turntable', labelKey: 'skin.turntable' },
  { key: 'retro', labelKey: 'skin.retro' },
  { key: 'mono', labelKey: 'skin.mono' }
]

const VALID_SKINS: Skin[] = [
  'base', 'cassette', 'turntable', 'retro', 'glass', 'sunset', 'ocean', 'mono',
  'cyber', 'forest', 'ember', 'rose'
]

interface SkinState {
  skin: Skin
  setSkin: (s: Skin) => void
}

function getInitialSkin(): Skin {
  const s = localStorage.getItem('skin') as Skin | null
  return s && VALID_SKINS.includes(s) ? s : 'base'
}

export const useSkinStore = create<SkinState>((set) => ({
  skin: getInitialSkin(),
  setSkin: (s: Skin) => {
    localStorage.setItem('skin', s)
    set({ skin: s })
  }
}))
