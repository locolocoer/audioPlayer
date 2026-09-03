import { useEffect, useState, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlayerStore } from '../stores/playerStore'
import { useMusicStore } from '../stores/musicStore'
import { useToastStore } from '../stores/toastStore'
import { useLyricsStyleStore } from '../stores/lyricsStyleStore'
import { useSkinStore } from '../stores/skinStore'
import { useVisualizerStore } from '../stores/visualizerStore'
import Equalizer from '../components/Equalizer'
import Visualizer from '../components/Visualizer'
import Modal from '../components/Modal'
import { parseLrc, activeLyricIndex } from '../utils/lrc'
import { getCoverCached, setCoverCached, coverCacheKey } from '../utils/coverCache'
import { useT, useI18nStore } from '../i18n'

export default function PlayerPage(): JSX.Element {
  const t = useT()
  const navigate = useNavigate()
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const lyricsFontSize = useLyricsStyleStore((s) => s.fontSize)
  const lyricsAlign = useLyricsStyleStore((s) => s.align)
  const skin = useSkinStore((s) => s.skin)
  const visualizerEnabled = useVisualizerStore((s) => s.enabled)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const [coverUrl, setCoverUrl] = useState('')
  const [lrcText, setLrcText] = useState('')
  const [eqOpen, setEqOpen] = useState(() => localStorage.getItem('eq_panel') === '1')
  const [fullscreenLyrics, setFullscreenLyrics] = useState(false)
  const [searchingLrc, setSearchingLrc] = useState(false)
  const [lrcSearchMsg, setLrcSearchMsg] = useState('')
  const [lrcFromOnline, setLrcFromOnline] = useState(false)
  const [searchDialogOpen, setSearchDialogOpen] = useState(false)
  const [searchTitle, setSearchTitle] = useState('')
  const [searchArtist, setSearchArtist] = useState('')
  const [searchAlbum, setSearchAlbum] = useState('')
  const [lrcMsgSuccess, setLrcMsgSuccess] = useState(false)
  const [aiMood, setAiMood] = useState<{ tags: string[]; summary: string } | null>(null)
  const [aiMoodBusy, setAiMoodBusy] = useState(false)
  const [aiMoodErr, setAiMoodErr] = useState('')
  // 歌词翻译：默认关闭；按界面语言判断，歌词已是目标语言则不翻译
  const uiLang = useI18nStore((s) => s.lang)
  const [translateOn, setTranslateOn] = useState(false)
  const [translatedLines, setTranslatedLines] = useState<string[] | null>(null)
  const [translating, setTranslating] = useState(false)
  const [translateMsg, setTranslateMsg] = useState('')
  // 歌词翻译缓存：按歌曲（webdavId+path）缓存译文，开关/切回同一首歌不重复请求 AI
  const transCache = useRef(new Map<string, string[]>())
  const loadedRef = useRef(0)
  const activeIdxRef = useRef(-1)
  // 切歌竞态守卫：每次换歌递增，异步回调只接受最新一代的结果
  const loadGenRef = useRef(0)

  useEffect(() => {
    localStorage.setItem('eq_panel', eqOpen ? '1' : '0')
  }, [eqOpen])

  const enterFullscreenLyrics = (): void => {
    setFullscreenLyrics(true)
    window.api.window.setFullscreen(true)
  }

  const exitFullscreenLyrics = (): void => {
    setFullscreenLyrics(false)
    window.api.window.setFullscreen(false)
  }

  useEffect(() => {
    if (!fullscreenLyrics) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') exitFullscreenLyrics()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreenLyrics])

  // 组件卸载时恢复窗口非全屏，避免切页后窗口仍停留在全屏
  useEffect(() => {
    return () => {
      window.api.window.setFullscreen(false)
    }
  }, [])

  const lyrics = useMemo(() => parseLrc(lrcText), [lrcText])
  const activeIndex = useMemo(() => activeLyricIndex(lyrics, currentTime), [lyrics, currentTime])
  const litCount = useMemo(() => {
    if (activeIndex < 0) return 0
    const start = lyrics[activeIndex].time
    const next = activeIndex + 1 < lyrics.length ? lyrics[activeIndex + 1].time : start + 5000
    const span = Math.max(0.1, next - start)
    return Math.floor(Math.max(0, Math.min(1, (currentTime - start) / span)) * Array.from(lyrics[activeIndex].text).length)
  }, [lyrics, activeIndex, currentTime])

  const configs = useMusicStore((s) => s.configs)
  const isLocalTrack = currentTrack ? configs.find((c) => c.id === currentTrack.webdavId)?.sourceType === 'local' : false

  const openSearchDialog = (): void => {
    if (!currentTrack) return
    setSearchTitle(currentTrack.title || '')
    setSearchArtist(currentTrack.artist || '')
    setSearchAlbum(currentTrack.album || '')
    setSearchDialogOpen(true)
  }

  const searchOnlineLrc = async (): Promise<void> => {
    if (!currentTrack) return
    const trackId = currentTrack.id
    setSearchingLrc(true)
    setLrcSearchMsg('')
    const res = await window.api.lrc.search({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.album,
      duration: currentTrack.duration
    })
    setSearchingLrc(false)
    if (usePlayerStore.getState().currentTrack?.id !== trackId) return
    if (res.ok && res.lrc) {
      setLrcText(res.lrc)
      setLrcFromOnline(true)
      setLrcSearchMsg(t('playerPage.foundLrc'))
      setLrcMsgSuccess(true)
    } else {
      setLrcSearchMsg(res.error || t('playerPage.notFound'))
      setLrcMsgSuccess(false)
      openSearchDialog()
    }
  }

  const saveLrc = async (): Promise<void> => {
    if (!currentTrack || !lrcText) return
    const res = await window.api.player.saveLyrics(currentTrack.webdavId, currentTrack.path, lrcText)
    setLrcSearchMsg(res.ok ? t('playerPage.savedLrc') : (res.error || t('playerPage.saveFailed')))
    setLrcMsgSuccess(res.ok)
  }

  const searchWithInfo = async (): Promise<void> => {
    const trackId = usePlayerStore.getState().currentTrack?.id
    setSearchingLrc(true)
    setLrcSearchMsg('')
    const res = await window.api.lrc.search({
      title: searchTitle,
      artist: searchArtist,
      album: searchAlbum,
      duration: currentTrack?.duration || 0
    })
    setSearchingLrc(false)
    if (usePlayerStore.getState().currentTrack?.id !== trackId) return
    if (res.ok && res.lrc) {
      setLrcText(res.lrc)
      setLrcFromOnline(true)
      setSearchDialogOpen(false)
      setLrcSearchMsg(t('playerPage.foundLrc'))
      setLrcMsgSuccess(true)
    } else {
      setLrcSearchMsg(res.error || t('playerPage.notFound'))
      setLrcMsgSuccess(false)
    }
  }

  const lyricsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (activeIndex < 0) return
    const el = lyricsRef.current?.querySelector(`[data-idx="${activeIndex}"]`) as HTMLElement
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeIndex])

  useEffect(() => {
    if (activeIndex < 0 || activeIndex === activeIdxRef.current) return
    activeIdxRef.current = activeIndex
  }, [activeIndex])

  useEffect(() => {
    setCoverUrl('')
    setLrcText('')
    setLrcSearchMsg('')
    setLrcFromOnline(false)
    setAiMood(null)
    setAiMoodErr('')
    if (currentTrack) {
      try {
        const cached = localStorage.getItem(`ai_mood_${currentTrack.id}`)
        if (cached) setAiMood(JSON.parse(cached))
      } catch { /* ignore */ }
    }
    loadedRef.current = 0
    activeIdxRef.current = -1
    loadGenRef.current++
    // 切歌重置歌词翻译开关
    setTranslateOn(false)
    setTranslatedLines(null)
    setTranslateMsg('')
    setTranslating(false)
  }, [currentTrack?.id])

  const analyzeMood = async (): Promise<void> => {
    if (!currentTrack || aiMoodBusy || !lrcText) return
    const trackId = currentTrack.id
    setAiMoodBusy(true)
    setAiMoodErr('')
    const r = await window.api.ai.chat(
      [{ role: 'user', content: `歌曲：${currentTrack.title}\n歌词：\n${lrcText.slice(0, 3000)}` }],
      {
        system: '分析这首歌歌词表达的情感，输出严格 JSON（不要任何其他文字）：{"tags":["标签1","标签2"...（2-4个中文情感标签）],"summary":"一句话总结歌曲情感"}',
        maxTokens: 300,
        temperature: 0.5
      }
    )
    setAiMoodBusy(false)
    if (usePlayerStore.getState().currentTrack?.id !== trackId) return
    if (!r.ok || !r.text) {
      setAiMoodErr(r.error === 'not-configured' ? t('ai.notConfigured') : (r.error || t('ai.failed')))
      return
    }
    let raw = r.text.trim()
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fence) raw = fence[1].trim()
    try {
      const parsed = JSON.parse(raw)
      if (parsed && Array.isArray(parsed.tags)) {
        const mood = { tags: parsed.tags.map(String).slice(0, 5), summary: String(parsed.summary || '') }
        setAiMood(mood)
        try { localStorage.setItem(`ai_mood_${currentTrack.id}`, JSON.stringify(mood)) } catch { /* ignore */ }
      } else {
        setAiMoodErr(t('ai.failed'))
      }
    } catch {
      setAiMoodErr(t('ai.failed'))
    }
  }

  // 歌词是否已是目标语言（zh：含中文；en：无中文）
  const isLyricsInTargetLang = (text: string): boolean => {
    const hasChinese = /[\u4e00-\u9fff]/.test(text)
    return uiLang === 'zh' ? hasChinese : !hasChinese
  }

  const toggleTranslate = async (): Promise<void> => {
    if (translateOn) {
      // 关闭只隐藏译文，缓存保留；再次开启直接复用
      setTranslateOn(false)
      return
    }
    setTranslateOn(true)
    if (!lrcText) { setTranslateMsg(t('lyrics.none')); return }
    if (!currentTrack) return
    const key = `${currentTrack.webdavId}:${currentTrack.path}`
    // 已缓存过该歌翻译 → 直接显示，不重新请求 AI
    const cached = transCache.current.get(key)
    if (cached) {
      setTranslatedLines(cached)
      setTranslateMsg('')
      return
    }
    const plain = lyrics.map((l) => l.text).join('\n')
    if (isLyricsInTargetLang(plain)) {
      setTranslateMsg(t('ai.translateSame', { lang: uiLang === 'zh' ? '中文' : 'English' }))
      setTranslatedLines(null)
      return
    }
    const target = uiLang === 'zh' ? '中文' : '英文'
    setTranslating(true)
    setTranslateMsg('')
    const r = await window.api.ai.chat([{ role: 'user', content: plain }], {
      system: `把以下歌词逐行翻译成${target}，保持每行与原文一一对应，只输出译文（每行一条，用换行分隔），不要任何其他文字或原文编号。`,
      maxTokens: 2000,
      temperature: 0.3
    })
    setTranslating(false)
    if (!r.ok || !r.text) {
      setTranslateMsg(r.error === 'not-configured' ? t('ai.notConfigured') : t('ai.translateFailed'))
      return
    }
    const lines = r.text.split('\n').map((s) => s.trim()).filter(Boolean)
    const aligned = lyrics.map((_l, i) => lines[i] || '')
    transCache.current.set(key, aligned)
    setTranslatedLines(aligned)
  }

  // 按当前歌曲情绪，从曲库中找出已分析出相同情绪的歌曲组成队列播放
  const playSimilarMood = (): void => {
    if (!aiMood) return
    const all = useMusicStore.getState().tracks
    const similar = all.filter((tr) => {
      if (tr.id === currentTrack?.id) return true
      try {
        const cached = localStorage.getItem(`ai_mood_${tr.id}`)
        if (!cached) return false
        const m = JSON.parse(cached)
        return Array.isArray(m.tags) && m.tags.some((tag: string) => aiMood.tags.includes(tag))
      } catch { return false }
    })
    if (similar.length > 0) {
      usePlayerStore.getState().setPlayMode('shuffle')
      usePlayerStore.getState().playSelection(similar)
      useToastStore.getState().addToast(t('ai.moodPlaying', { n: similar.length }), 'success')
    } else {
      useToastStore.getState().addToast(t('ai.moodNoSimilar'), 'info')
    }
  }

  useEffect(() => {
    if (!currentTrack || loadedRef.current) return
    loadedRef.current = 1

    const track = currentTrack
    const gen = loadGenRef.current
    const key = coverCacheKey(track)
    const cached = getCoverCached(key)
    if (cached) {
      setCoverUrl(cached)
    } else {
      window.api.player.getCover(track.webdavId, track.path).then((r) => {
        if (gen !== loadGenRef.current) return
        if (r.data && r.data.length > 0) {
          const blob = new Blob([new Uint8Array(r.data)], { type: r.format || 'image/jpeg' })
          const url = URL.createObjectURL(blob)
          setCoverCached(key, url)
          setCoverUrl(url)
        }
      }).catch(() => {})
    }

    window.api.player.getLrc(track.webdavId, track.path).then((r) => {
      if (gen !== loadGenRef.current) return
      if (r.text) {
        setLrcText(r.text)
        setLrcFromOnline(false)
      }
    }).catch(() => {})
  }, [currentTrack])

  if (!currentTrack) {
    return (
      <div className="page player-page">
        <div className="empty-state player-empty">
          <div className="empty-artwork">
            <svg viewBox="0 0 24 24" width="52" height="52" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
          </div>
          <p>{t('playerPage.noTrack')}</p>
          <p className="empty-hint">{t('playerPage.noTrackHint')}</p>
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            {t('playerPage.goLibrary')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`page player-page${skin !== 'base' ? ` skin-${skin}` : ''}${isPlaying ? ' playing' : ''}`}>
      <div className="player-layout">
        <div className="player-left">
          <div className="player-artwork-large">
            {coverUrl ? (
              <img src={coverUrl} alt="" />
            ) : (
              <div className="artwork-placeholder">
                <svg viewBox="0 0 24 24" width="64" height="64" fill="currentColor">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                </svg>
              </div>
            )}
          </div>
          <div className="player-detail-info">
            <h2>{currentTrack.title || currentTrack.filename}</h2>
            {currentTrack.artist && <p className="player-artist">{currentTrack.artist}</p>}
            {currentTrack.album && <p className="player-album">{currentTrack.album}</p>}
          </div>
        </div>
        <div className="player-right">
          {visualizerEnabled && <Visualizer />}
          {lyrics.length > 0 ? (
            <>
              <div
                className="lyrics-container"
                ref={lyricsRef}
                style={{ fontSize: lyricsFontSize, textAlign: lyricsAlign }}
              >
                <div className="lyrics-spacer" />
                {lyrics.map((line, idx) => (
                  <div key={idx} data-idx={idx} className={`lyrics-line${activeIndex === idx ? ' active' : ''}`}>
                    <span>{line.text}</span>
                    {translateOn && translatedLines && translatedLines[idx] && (
                      <span className="lyrics-trans">{translatedLines[idx]}</span>
                    )}
                  </div>
                ))}
                <div className="lyrics-spacer" />
              </div>
              <div className="lyrics-actions">
                {isLocalTrack && lrcFromOnline && (
                  <button className="lyrics-btn" onClick={saveLrc}>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>
                    {t('playerPage.saveLrc')}
                  </button>
                )}
                <button className="lyrics-btn" onClick={openSearchDialog}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
                  {t('playerPage.reSearch')}
                </button>
                <button className="lyrics-btn" onClick={analyzeMood} disabled={aiMoodBusy || !lrcText} title={t('ai.moodTitle')}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>
                  {aiMoodBusy ? t('common.loading') : (aiMood ? t('ai.moodAgain') : t('ai.mood'))}
                </button>
                <button className={`lyrics-btn${translateOn ? ' primary' : ''}`} onClick={toggleTranslate} disabled={translating || !lrcText} title={t('ai.translate')}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>
                  {translating ? t('ai.translating') : (translateOn ? t('ai.translateOff') : t('ai.translate'))}
                </button>
                {translateMsg && <span className="lrc-search-msg">{translateMsg}</span>}
                {lrcSearchMsg && <span className={`lrc-search-msg${lrcMsgSuccess ? ' success' : ''}`}>{lrcSearchMsg}</span>}
              </div>
              {aiMood && (
                <div className="ai-mood-bar">
                  <div className="ai-mood-tags">
                    {aiMood.tags.map((tag) => (
                      <span key={tag} className="ai-mood-tag">{tag}</span>
                    ))}
                  </div>
                  {aiMood.summary && <span className="ai-mood-summary">{aiMood.summary}</span>}
                  <button className="btn btn-sm" onClick={playSimilarMood} title={t('ai.moodPlayTitle')}>{t('ai.moodPlay')}</button>
                </div>
              )}
              {aiMoodErr && <div className="ai-error">{aiMoodErr}</div>}
            </>
          ) : (
            <div className="lyrics-empty">
              <svg className="lyrics-empty-icon" viewBox="0 0 24 24" width="40" height="40" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
              <span>{t('lyrics.none')}</span>
              <button className="lyrics-btn primary" onClick={searchOnlineLrc} disabled={searchingLrc || !currentTrack}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
                {searchingLrc ? t('common.searching') : t('playerPage.searchOnline')}
              </button>
              {lrcSearchMsg && <span className={`lrc-search-msg${lrcMsgSuccess ? ' success' : ''}`}>{lrcSearchMsg}</span>}
            </div>
          )}
        </div>
      </div>
      <div className="eq-section">
        <button className="eq-toggle" onClick={enterFullscreenLyrics} title={t('playerPage.fullscreenLyrics')} disabled={lyrics.length === 0}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
          {t('playerPage.fullscreenLyrics')}
        </button>
        <button className="eq-toggle" onClick={() => setEqOpen((o) => !o)} title={t('playerPage.equalizer')}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M12 3c-1.66 0-3 1.34-3 3v6.18c-1.16.41-2 1.51-2 2.82 0 1.66 1.34 3 3 3s3-1.34 3-3c0-1.31-.84-2.41-2-2.82V6c0-.55.45-1 1-1s1 .45 1 1v1h2V6c0-1.66-1.34-3-3-3z"/>
          </svg>
          {t('playerPage.equalizer')}
          <span className="eq-chevron">{eqOpen ? '▾' : '▸'}</span>
        </button>
        {eqOpen && <Equalizer />}
      </div>

      {fullscreenLyrics && (
        <div className="fullscreen-lyrics" onClick={exitFullscreenLyrics}>
          {coverUrl && <img className="fsl-bg" src={coverUrl} alt="" />}
          <div className="fsl-overlay" />
          <div className="fsl-content">
            <div className="fsl-track">
              <span className="fsl-title">{currentTrack.title || currentTrack.filename}</span>
              {currentTrack.artist && <span className="fsl-artist">{currentTrack.artist}</span>}
            </div>
            {lyrics.length > 0 ? (
              <div className="fsl-body">
                <div className="fsl-prev">{activeIndex > 0 ? lyrics[activeIndex - 1].text : ''}</div>
                <div className="fsl-current">
                  {Array.from(lyrics[Math.max(0, activeIndex)].text).map((ch, i) => (
                    <span key={i} className={i < litCount ? 'fsl-lit' : ''}>{ch === ' ' ? '\u00A0' : ch}</span>
                  ))}
                </div>
                {translateOn && translatedLines?.[Math.max(0, activeIndex)] && (
                  <div className="fsl-trans">{translatedLines[Math.max(0, activeIndex)]}</div>
                )}
                <div className="fsl-next">{activeIndex + 1 < lyrics.length ? lyrics[activeIndex + 1].text : ''}</div>
              </div>
            ) : (
              <div className="fsl-empty">{t('lyrics.none')}</div>
            )}
            <div className="fsl-hint">{t('playerPage.fullscreenHint')}</div>
          </div>
        </div>
      )}

      {searchDialogOpen && (
        <Modal onClose={() => setSearchDialogOpen(false)} width={420}>
          <h3>{t('playerPage.searchTitle')}</h3>
          <div className="form-group">
            <label>{t('track.title')}</label>
            <input type="text" value={searchTitle} onChange={(e) => setSearchTitle(e.target.value)} placeholder={t('track.titlePlaceholder')} />
          </div>
          <div className="form-group">
            <label>{t('track.artist')}</label>
            <input type="text" value={searchArtist} onChange={(e) => setSearchArtist(e.target.value)} placeholder={t('track.artistPlaceholder')} />
          </div>
          <div className="form-group">
            <label>{t('track.album')}</label>
            <input type="text" value={searchAlbum} onChange={(e) => setSearchAlbum(e.target.value)} placeholder={t('playerPage.albumOptional')} />
          </div>
          {lrcSearchMsg && <div className="test-result error">{lrcSearchMsg}</div>}
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setSearchDialogOpen(false)}>{t('common.cancel')}</button>
            <button className="btn btn-primary" onClick={searchWithInfo} disabled={searchingLrc || !searchTitle.trim()}>
              {searchingLrc ? t('common.searching') : t('playerPage.search')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
