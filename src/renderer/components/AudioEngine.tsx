import { useEffect, useRef } from 'react'
import { usePlayerStore } from '../stores/playerStore'

export default function AudioEngine(): JSX.Element {
  const audioRef = useRef<HTMLAudioElement>(null)
  const downloadingRef = useRef(false)

  const pendingTrack = usePlayerStore((s) => s.pendingTrack)
  const volume = usePlayerStore((s) => s.volume)
  const isPlaying = usePlayerStore((s) => s.isPlaying)

  useEffect(() => {
    if (!pendingTrack || downloadingRef.current) return
    downloadingRef.current = true

    const audio = audioRef.current
    if (!audio) {
      downloadingRef.current = false
      return
    }

    const ext = pendingTrack.filename.slice(pendingTrack.filename.lastIndexOf('.'))
    window.api.log('info', `loading: "${pendingTrack.title}" (${ext}) path=${pendingTrack.path}`)

    window.api.player.getAudioPath(pendingTrack.webdavId, pendingTrack.path)
      .then((result) => {
        if (result.error) {
          window.api.log('error', `DOWNLOAD FAILED: "${pendingTrack.title}" (${ext}) path=${pendingTrack.path} error=${result.error}`)
          usePlayerStore.getState().onAudioError(`${ext} - ${result.error}`)
          downloadingRef.current = false
          return
        }
        if (!result.localUrl) {
          window.api.log('error', `DOWNLOAD FAILED: "${pendingTrack.title}" (${ext}) path=${pendingTrack.path} error=unknown`)
          usePlayerStore.getState().onAudioError(`${ext} - Download failed`)
          downloadingRef.current = false
          return
        }

        audio.src = result.localUrl
        audio.load()
        return audio.play()
      })
      .then(() => {
        downloadingRef.current = false
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err)
        window.api.log('error', `PLAY FAILED: "${pendingTrack.title}" (${ext}) path=${pendingTrack.path} error=${msg}`)
        usePlayerStore.getState().onAudioError(`${ext} - ${msg}`)
        downloadingRef.current = false
        if (audioRef.current) audioRef.current.removeAttribute('src')
      })
  }, [pendingTrack])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = volume
  }, [volume])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying && audio.paused && audio.src) {
      audio.play().catch(() => {})
    } else if (!isPlaying && !audio.paused) {
      audio.pause()
    }
  }, [isPlaying])

  const handleCanPlay = () => {
    usePlayerStore.getState().onAudioLoaded()
  }

  const handleError = () => {
    const audio = audioRef.current
    if (audio && audio.error) {
      const track = usePlayerStore.getState().currentTrack
      const ext = track ? track.filename.slice(track.filename.lastIndexOf('.')) : '?'
      window.api.log('error', `FORMAT UNSUPPORTED: "${track?.title}" (${ext}) path=${track?.path} error=${audio.error.message}`)
      usePlayerStore.getState().onAudioError(`${ext} not supported - ${audio.error.message}`)
    }
    downloadingRef.current = false
    if (audioRef.current) {
      audioRef.current.removeAttribute('src')
    }
  }

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      usePlayerStore.getState().setCurrentTime(audioRef.current.currentTime)
    }
  }

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      usePlayerStore.getState().setDuration(audioRef.current.duration)
    }
  }

  const handleEnded = () => {
    usePlayerStore.getState().onAudioEnded()
  }

  useEffect(() => {
    const handler = ((e: CustomEvent<number>) => {
      if (audioRef.current) {
        audioRef.current.currentTime = e.detail
      }
    }) as EventListener
    window.addEventListener('audioplayer:seek', handler)
    return () => window.removeEventListener('audioplayer:seek', handler)
  }, [])

  return (
    <audio
      ref={audioRef}
      preload="auto"
      style={{ display: 'none' }}
      onCanPlay={handleCanPlay}
      onError={handleError}
      onTimeUpdate={handleTimeUpdate}
      onLoadedMetadata={handleLoadedMetadata}
      onEnded={handleEnded}
    />
  )
}
