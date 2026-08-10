import { create } from 'zustand'

interface UiState {
  queueOpen: boolean
  toggleQueue: () => void
  setQueueOpen: (v: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  queueOpen: false,
  toggleQueue: () => set((s) => ({ queueOpen: !s.queueOpen })),
  setQueueOpen: (v) => set({ queueOpen: v })
}))
