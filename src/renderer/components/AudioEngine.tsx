import { useEffect, useRef } from 'react'
import { usePlayerStore } from '../stores/playerStore'
import { useMusicStore } from '../stores/musicStore'
import { useEqualizerStore, EQ_BANDS } from '../stores/equalizerStore'
import { useAudioGraphStore } from '../stores/audioGraphStore'

const RESUME_THROTTLE = 5000
let lastResumeSave = 0
let lastLyricsTimeSave = 0
let recordedPlayId = -1

export default function AudioEngine(): JSX.Element {
  const audioRef = useRef<HTMLAudioElement>(null)
  const downloadingRef = useRef(false)
  const resumeAppliedRef = useRef(false)
  const fallbackTriedRef = useRef(false)
  const fallbackSeekRef = useRef<number | null>(null)

  const pendingTrack = usePlayerStore((s) => s.pendingTrack)
  const volume = usePlayerStore((s) => s.volume)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const eqEnabled = useEqualizerStore((s) => s.enabled)
  const eqGains = useEqualizerStore((s) => s.gains)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const filtersRef = useRef<BiquadFilterNode[]>([])
  const volumeGainRef = useRef<GainNode | null>(null)
  const lyricsFetchedRef = useRef('')

  const syncLyrics = (): void => {
    const track = usePlayerStore.getState().pendingTrack
    if (!track) return
    const lyrKey = `${track.webdavId}:${track.path}`
    if (lyricsFetchedRef.current === lyrKey) return
    lyricsFetchedRef.current = lyrKey
    window.api.player.getLrc(track.webdavId, track.path).then((r) => {
      localStorage.setItem('lyrics_sync', JSON.stringify({ trackId: track.id, lrcText: r.text || '' }))
    }).catch(() => {})
  }

  const applyEq = (): void => {
    const ctx = audioCtxRef.current
    if (!ctx) return
    filtersRef.current.forEach((f, i) => {
      f.gain.value = eqEnabled ? (eqGains[i] ?? 0) : 0
    })
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  }

  const ensureEqGraph = (): void => {
    const audio = audioRef.current
    if (!audio || audioCtxRef.current) return
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctor()
      const source = ctx.createMediaElementSource(audio)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.8
      const volumeGain = ctx.createGain()
      volumeGain.gain.value = usePlayerStore.getState().volume
      filtersRef.current = EQ_BANDS.map((freq) => {
        const filter = ctx.createBiquadFilter()
        filter.type = 'peaking'
        filter.frequency.value = freq
        filter.Q.value = 1.0
        filter.gain.value = 0
        return filter
      })
      let node: AudioNode = source
      node.connect(analyser)
      node = analyser
      node.connect(volumeGain)
      node = volumeGain
      for (const f of filtersRef.current) {
        node.connect(f)
        node = f
      }
      node.connect(ctx.destination)
      audio.volume = 1
      audioCtxRef.current = ctx
      volumeGainRef.current = volumeGain
      useAudioGraphStore.getState().setAnalyser(analyser)
      applyEq()
    } catch { /* AudioContext unavailable */ }
  }

  useEffect(() => {
    if (audioCtxRef.current) {
      filtersRef.current.forEach((f, i) => {
        f.gain.value = eqEnabled ? (eqGains[i] ?? 0) : 0
      })
      const ctx = audioCtxRef.current
      if (eqEnabled && ctx.state === 'suspended') ctx.resume().catch(() => {})
    }
  }, [eqEnabled, eqGains])

  useEffect(() => {
    const ensure = (): void => ensureEqGraph()
    document.addEventListener('pointerdown', ensure)
    document.addEventListener('keydown', ensure)
    return () => {
      document.removeEventListener('pointerdown', ensure)
      document.removeEventListener('keydown', ensure)
    }
  }, [])

  useEffect(() => {
    if (!pendingTrack || downloadingRef.current) return
    downloadingRef.current = true
    fallbackTriedRef.current = false
    fallbackSeekRef.current = null

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
        ensureEqGraph()
        audio.load()

        syncLyrics()

        if (!usePlayerStore.getState().autoPlayBlocked) {
          return audio.play()
        }
        return undefined
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
    const id = setInterval(() => {
      const st = usePlayerStore.getState()
      if (st.sleepUntil && Date.now() >= st.sleepUntil) {
        st.setSleepTimer(null)
        st.pause()
      }
    }, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (volumeGainRef.current) {
      volumeGainRef.current.gain.value = volume
      audio.volume = 1
    } else {
      audio.volume = volume
    }
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
    ensureEqGraph()
    usePlayerStore.getState().onAudioLoaded()

    const state = usePlayerStore.getState()
    if (state.currentTrack && state.currentTrack.id !== recordedPlayId) {
      recordedPlayId = state.currentTrack.id
      window.api.music.recordPlay(state.currentTrack.id)
    }

    const audio = audioRef.current
    if (audio) {
      if (fallbackSeekRef.current !== null) {
        try {
          audio.currentTime = fallbackSeekRef.current
        } catch { /* ignore */ }
        fallbackSeekRef.current = null
      } else if (!resumeAppliedRef.current) {
        resumeAppliedRef.current = true
        const resumeTime = Number(localStorage.getItem('resume_time') || 0)
        const resumeTrackId = Number(localStorage.getItem('resume_track_id') || 0)
        if (resumeTime > 0 && resumeTrackId === state.currentTrack?.id) {
          try {
            audio.currentTime = resumeTime
          } catch { /* ignore */ }
        }
      }
    }

    prefetchNext()
  }

  const prefetchedForRef = useRef<number>(-1)

  const prefetchNext = () => {
    const state = usePlayerStore.getState()
    if (state.playMode === 'heartbeat') return
    const queue = state.playlist.length > 0
      ? state.playlist
      : state.queue.length > 0
        ? state.queue
        : useMusicStore.getState().tracks
    const cur = state.currentTrack
    if (!cur || queue.length === 0) return
    const idx = queue.findIndex((t) => t.id === cur.id)
    const next = idx >= 0 ? queue[(idx + 1) % queue.length] : undefined
    if (!next || next.id === cur.id) return
    if (next.id === prefetchedForRef.current) return
    prefetchedForRef.current = next.id
    window.api.player.getAudioPath(next.webdavId, next.path).catch(() => {})
  }

  const handleError = () => {
    const audio = audioRef.current
    if (audio && audio.error) {
      const track = usePlayerStore.getState().currentTrack
      const ext = track ? track.filename.slice(track.filename.lastIndexOf('.')) : '?'
      window.api.log('error', `FORMAT UNSUPPORTED: "${track?.title}" (${ext}) path=${track?.path} error=${audio.error.message}`)

      if (track && ext.toLowerCase() === '.flac' && !fallbackTriedRef.current) {
        fallbackTriedRef.current = true
        fallbackSeekRef.current = audio.currentTime || 0
        downloadingRef.current = false
        window.api.player.getFallbackAudio(track.webdavId, track.path).then((result) => {
          const st = usePlayerStore.getState()
          if (st.pendingTrack?.id !== track.id) return
          const el = audioRef.current
          if (result.error || !result.localUrl || !el) {
            st.onAudioError(`${ext} - 转码播放失败`)
            el?.removeAttribute('src')
            return
          }
          el.src = result.localUrl
          el.load()
          if (!st.autoPlayBlocked) {
            el.play().catch(() => {})
          }
        }).catch(() => {
          const st = usePlayerStore.getState()
          if (st.pendingTrack?.id !== track.id) return
          st.onAudioError(`${ext} - 转码播放失败`)
          audioRef.current?.removeAttribute('src')
        })
        return
      }

      usePlayerStore.getState().onAudioError(`${ext} not supported - ${audio.error.message}`)
    }
    downloadingRef.current = false
    if (audioRef.current) {
      audioRef.current.removeAttribute('src')
    }
  }

  const handleTimeUpdate = () => {
    const audio = audioRef.current
    if (!audio) return
    usePlayerStore.getState().setCurrentTime(audio.currentTime)
    const now = Date.now()
    if (now - lastResumeSave > RESUME_THROTTLE) {
      lastResumeSave = now
      localStorage.setItem('resume_time', String(Math.floor(audio.currentTime)))
    }
    if (now - lastLyricsTimeSave > 200) {
      lastLyricsTimeSave = now
      const track = usePlayerStore.getState().currentTrack
      if (track) {
        localStorage.setItem('lyrics_time', JSON.stringify({ trackId: track.id, time: audio.currentTime }))
      }
    }
  }

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      usePlayerStore.getState().setDuration(audioRef.current.duration)
    }
  }

  const handleEnded = () => {
    localStorage.setItem('resume_time', '0')
    usePlayerStore.getState().onAudioEnded()
  }

  useEffect(() => {
    const unsub = window.api.player.onCommand((cmd) => {
      const st = usePlayerStore.getState()
      switch (cmd) {
        case 'toggle':
          if (st.isPlaying) st.pause()
          else st.resume()
          break
        case 'next':
          st.next()
          break
        case 'prev':
          st.prev()
          break
        case 'seek:+5':
          st.seek(st.currentTime + 5)
          break
        case 'seek:-5':
          st.seek(Math.max(0, st.currentTime - 5))
          break
        case 'volume:+':
          st.setVolume(Math.min(1, st.volume + 0.05))
          break
        case 'volume:-':
          st.setVolume(Math.max(0, st.volume - 0.05))
          break
      }
    })
    return unsub
  }, [])

  useEffect(() => {
    const isEditable = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || target.isContentEditable
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (isEditable(e.target)) return
      const st = usePlayerStore.getState()
      if (e.code === 'Space') {
        e.preventDefault()
        if (st.isPlaying) st.pause()
        else st.resume()
      } else if (e.key === 'ArrowLeft' && e.ctrlKey) {
        e.preventDefault()
        st.prev()
      } else if (e.key === 'ArrowRight' && e.ctrlKey) {
        e.preventDefault()
        st.next()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        st.seek(Math.max(0, st.currentTime - 5))
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        st.seek(st.currentTime + 5)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        st.setVolume(Math.min(1, st.volume + 0.05))
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        st.setVolume(Math.max(0, st.volume - 0.05))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    const handler = ((e: CustomEvent<number>) => {
      const audio = audioRef.current
      if (!audio) return
      const t = e.detail
      if (Number.isFinite(t) && t >= 0) {
        if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
          audioCtxRef.current.resume().catch(() => {})
        }
        try {
          audio.currentTime = t
        } catch { /* ignore */ }
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
