import { create } from 'zustand'

interface AudioGraphState {
  analyser: AnalyserNode | null
  setAnalyser: (a: AnalyserNode | null) => void
}

export const useAudioGraphStore = create<AudioGraphState>((set) => ({
  analyser: null,
  setAnalyser: (a) => set({ analyser: a })
}))
