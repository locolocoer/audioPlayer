import { create } from 'zustand'

interface VisualizerState {
  enabled: boolean
  setEnabled: (v: boolean) => void
}

function getInitial(): boolean {
  return localStorage.getItem('show_visualizer') !== '0'
}

export const useVisualizerStore = create<VisualizerState>((set) => ({
  enabled: getInitial(),
  setEnabled: (v) => {
    localStorage.setItem('show_visualizer', v ? '1' : '0')
    set({ enabled: v })
  }
}))
