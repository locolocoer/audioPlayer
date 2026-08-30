import { useEffect, useRef } from 'react'
import { usePlayerStore } from '../stores/playerStore'
import { useMusicStore } from '../stores/musicStore'
import { useEqualizerStore, EQ_BANDS } from '../stores/equalizerStore'
import { useAudioGraphStore } from '../stores/audioGraphStore'
import { useShortcutsStore, formatShortcut } from '../stores/shortcutsStore'
import { t } from '../i18n'

const RESUME_THROTTLE = 5000
let lastResumeSave = 0
let lastLyricsTimeSave = 0
let recordedPlayId = -1

export default function AudioEngine(): JSX.Element {
  const audioRef = useRef<HTMLAudioElement>(null)
  const loadSeqRef = useRef(0)
  const resumeAppliedRef = useRef(false)
  const fallbackTriedRef = useRef(false)
  const fallbackSeekRef = useRef<number | null>(null)

  const pendingTrack = usePlayerStore((s) => s.pendingTrack)
  const volume = usePlayerStore((s) => s.volume)
  const playbackRate = usePlayerStore((s) => s.playbackRate)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const eqEnabled = useEqualizerStore((s) => s.enabled)
  const eqGains = useEqualizerStore((s) => s.gains)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const filtersRef = useRef<BiquadFilterNode[]>([])
  const volumeGainRef = useRef<GainNode | null>(null)
  const lyricsFetchedRef = useRef('')
  const lyricsPendingRef = useRef<Set<string>>(new Set())

  const syncLyrics = (): void => {
    const track = usePlayerStore.getState().pendingTrack
    if (!track) return
    const lyrKey = `${track.webdavId}:${track.path}`
    if (lyricsFetchedRef.current === lyrKey || lyricsPendingRef.current.has(lyrKey)) return
    lyricsPendingRef.current.add(lyrKey)
    window.api.player.getLrc(track.webdavId, track.path).then((r) => {
      lyricsPendingRef.current.delete(lyrKey)
      const cur = usePlayerStore.getState().pendingTrack
      if (!cur || `${cur.webdavId}:${cur.path}` !== lyrKey) return
      // 只在成功时记录已取歌词；失败不置标记，允许后续（重开歌词窗等）自动重试
      lyricsFetchedRef.current = lyrKey
      window.api.player.sendLyrics(cur.id, r.text || '')
    }).catch(() => {
      lyricsPendingRef.current.delete(lyrKey)
    })
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
    if (!pendingTrack) return
    const seq = ++loadSeqRef.current
    fallbackTriedRef.current = false
    fallbackSeekRef.current = null
    // 新一次加载开始：复位播放记录标记，让本次真正开始播放的歌曲记一次播放
    recordedPlayId = -1

    const audio = audioRef.current
    if (!audio) return

    const ext = pendingTrack.filename.slice(pendingTrack.filename.lastIndexOf('.'))
    window.api.log('info', `loading: "${pendingTrack.title}" (${ext}) path=${pendingTrack.path}`)

    window.api.player.getAudioPath(pendingTrack.webdavId, pendingTrack.path)
      .then((result) => {
        if (seq !== loadSeqRef.current) return
        if (result.error) {
          window.api.log('error', `DOWNLOAD FAILED: "${pendingTrack.title}" (${ext}) path=${pendingTrack.path} error=${result.error}`)
          usePlayerStore.getState().onAudioError(`${ext} - ${result.error}`)
          return
        }
        if (!result.localUrl) {
          window.api.log('error', `DOWNLOAD FAILED: "${pendingTrack.title}" (${ext}) path=${pendingTrack.path} error=unknown`)
          usePlayerStore.getState().onAudioError(`${ext} - Download failed`)
          return
        }

        audio.src = result.localUrl
        ensureEqGraph()
        audio.load()

        syncLyrics()

        if (!usePlayerStore.getState().autoPlayBlocked) {
          audio.play().catch(() => {})
        }
      })
      .catch((err) => {
        if (seq !== loadSeqRef.current) return
        const msg = err instanceof Error ? err.message : String(err)
        window.api.log('error', `PLAY FAILED: "${pendingTrack.title}" (${ext}) path=${pendingTrack.path} error=${msg}`)
        usePlayerStore.getState().onAudioError(`${ext} - ${msg}`)
        if (audioRef.current) audioRef.current.removeAttribute('src')
      })
  }, [pendingTrack])

  useEffect(() => {
    const id = setInterval(() => {
      const st = usePlayerStore.getState()
      if (st.sleepUntil && Date.now() >= st.sleepUntil) {
        st.setSleepTimer(null)
        if (st.sleepAction === 'quit') {
          window.api.app.quit()
        } else {
          st.pause()
        }
      }
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // 桌面歌词窗口打开时重发当前歌曲歌词与进度（否则窗口首次打开看不到当前歌曲）
  useEffect(() => {
    const unsub = window.api.player.onLyricsResync(() => {
      const st = usePlayerStore.getState()
      const track = st.pendingTrack
      if (!track) return
      lyricsFetchedRef.current = ''
      lyricsPendingRef.current.clear()
      syncLyrics()
      window.api.player.sendLyricsTime(track.id, st.currentTime)
    })
    return unsub
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
    if (audio) {
      audio.playbackRate = playbackRate
    }
  }, [playbackRate])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying && audio.paused && audio.src) {
      audio.play().catch(() => {})
    } else if (!isPlaying && !audio.paused) {
      audio.pause()
    }
  }, [isPlaying])

  const fadeIn = (): void => {
    const vol = usePlayerStore.getState().volume
    if (volumeGainRef.current && audioCtxRef.current) {
      const ctx = audioCtxRef.current
      const g = volumeGainRef.current.gain
      const now = ctx.currentTime
      g.cancelScheduledValues(now)
      g.setValueAtTime(0.0001, now)
      g.linearRampToValueAtTime(vol, now + 0.5)
    } else {
      const audio = audioRef.current
      if (!audio) return
      audio.volume = 0
      const start = performance.now()
      const step = (): void => {
        const p = Math.min(1, (performance.now() - start) / 500)
        audio.volume = p * vol
        if (p < 1) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    }
  }

  const handleCanPlay = () => {
    ensureEqGraph()
    if (audioRef.current) {
      audioRef.current.playbackRate = usePlayerStore.getState().playbackRate
    }
    fadeIn()
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

      if (track && !fallbackTriedRef.current) {
        fallbackTriedRef.current = true
        fallbackSeekRef.current = audio.currentTime || 0
        window.api.player.getFallbackAudio(track.webdavId, track.path).then((result) => {
          const st = usePlayerStore.getState()
          if (st.pendingTrack?.id !== track.id) return
          const el = audioRef.current
          if (result.error || !result.localUrl || !el) {
            st.onAudioError(t('player.transcodeFailed', { ext }))
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
          st.onAudioError(t('player.transcodeFailed', { ext }))
          audioRef.current?.removeAttribute('src')
        })
        return
      }

      usePlayerStore.getState().onAudioError(`${ext} not supported - ${audio.error.message}`)
    }
    if (audioRef.current) {
      audioRef.current.removeAttribute('src')
    }
  }

  const handleTimeUpdate = () => {
    const audio = audioRef.current
    if (!audio) return
    const st = usePlayerStore.getState()
    if (st.loopA !== null && st.loopB !== null && st.loopB > st.loopA && audio.currentTime >= st.loopB) {
      audio.currentTime = st.loopA
    }
    st.setCurrentTime(audio.currentTime)
    const now = Date.now()
    if (now - lastResumeSave > RESUME_THROTTLE) {
      lastResumeSave = now
      localStorage.setItem('resume_time', String(Math.floor(audio.currentTime)))
    }
    if (now - lastLyricsTimeSave > 200) {
      lastLyricsTimeSave = now
      const track = usePlayerStore.getState().currentTrack
      if (track) {
        window.api.player.sendLyricsTime(track.id, audio.currentTime)
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
      const shortcuts = useShortcutsStore.getState().shortcuts
      const combo = formatShortcut(e)
      if (combo === shortcuts.playPause) {
        e.preventDefault()
        if (st.isPlaying) st.pause()
        else st.resume()
      } else if (combo === shortcuts.next) {
        e.preventDefault()
        st.next()
      } else if (combo === shortcuts.prev) {
        e.preventDefault()
        st.prev()
      } else if (combo === shortcuts.seekForward) {
        e.preventDefault()
        st.seek(st.currentTime + 5)
      } else if (combo === shortcuts.seekBackward) {
        e.preventDefault()
        st.seek(Math.max(0, st.currentTime - 5))
      } else if (combo === shortcuts.volumeUp) {
        e.preventDefault()
        st.setVolume(Math.min(1, st.volume + 0.05))
      } else if (combo === shortcuts.volumeDown) {
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
      onPause={() => window.api.player.sendLyricsPaused(true)}
      onPlay={() => window.api.player.sendLyricsPaused(false)}
    />
  )
}
