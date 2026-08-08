import type { AudioPlayerAPI } from '../preload/index'

declare global {
  interface Window {
    api: AudioPlayerAPI
  }
}
