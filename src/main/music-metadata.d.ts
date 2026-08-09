import type { IAudioMetadata, IOptions } from 'music-metadata'

declare module 'music-metadata' {
  export function parseFile(filePath: string, options?: IOptions): Promise<IAudioMetadata>
}
