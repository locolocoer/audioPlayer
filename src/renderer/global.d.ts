import type { AudioPlayerAPI } from '../preload/index'

declare global {
  interface Window {
    api: AudioPlayerAPI
  }
}

declare module '*.png' {
  const src: string
  export default src
}

declare module '*.jpg' {
  const src: string
  export default src
}

declare module '*.svg' {
  const src: string
  export default src
}
