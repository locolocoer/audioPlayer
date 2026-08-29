import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useThemeStore, lightenHex } from './stores/themeStore'
import { useSkinStore } from './stores/skinStore'
import ConfigPage from './pages/ConfigPage'
import LibraryPage from './pages/LibraryPage'
import PlayerPage from './pages/PlayerPage'
import FavoritesPage from './pages/FavoritesPage'
import PlaylistPage from './pages/PlaylistPage'
import HistoryPage from './pages/HistoryPage'
import StatsPage from './pages/StatsPage'
import DuplicatesPage from './pages/DuplicatesPage'
import PlayerBar from './components/PlayerBar'
import AudioEngine from './components/AudioEngine'
import Sidebar from './components/Sidebar'
import TitleBar from './components/TitleBar'
import QueuePanel from './components/QueuePanel'
import DesktopLyrics from './components/DesktopLyrics'
import Toaster from './components/Toaster'
import Modal from './components/Modal'
import UpdateNotesModal from './components/UpdateNotesModal'
import { usePlaylistStore } from './stores/playlistStore'
import { usePlayerStore } from './stores/playerStore'
import { useMusicStore } from './stores/musicStore'
import { useToastStore } from './stores/toastStore'
import { useEffect, Component, useState } from 'react'
import type { MusicFile } from '../main/types'
import { useT, t } from './i18n'

class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error): { hasError: boolean; error: string } {
    return { hasError: true, error: error.message }
  }
  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, color: '#f44', fontFamily: 'monospace' }}>
          <h2>{t('error.title')}</h2>
          <pre>{this.state.error}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App(): JSX.Element {
  const t = useT()
  const theme = useThemeStore((s) => s.theme)
  const accent = useThemeStore((s) => s.accent)
  const skin = useSkinStore((s) => s.skin)
  const [resumePrompt, setResumePrompt] = useState<MusicFile | null>(null)
  const [updateReady, setUpdateReady] = useState<string | null>(null)
  const [updateNotesVersion, setUpdateNotesVersion] = useState<string | null>(null)

  // 更新内容提示：新版本安装后首次启动弹出一次
  useEffect(() => {
    window.api.app.info().then((info) => {
      const v = info.version
      let seen = ''
      try { seen = localStorage.getItem('update_notes_seen_version') || '' } catch { /* ignore */ }
      if (seen !== v) setUpdateNotesVersion(v)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', theme)
    root.setAttribute('data-skin', skin)
    if (skin === 'base') {
      root.style.setProperty('--accent', accent)
      root.style.setProperty('--accent-hover', lightenHex(accent, 0.2))
    } else {
      root.style.removeProperty('--accent')
      root.style.removeProperty('--accent-hover')
    }
  }, [theme, accent, skin])

  useEffect(() => {
    usePlaylistStore.getState().loadPlaylists()
  }, [])

  useEffect(() => {
    const id = Number(localStorage.getItem('resume_track_id') || 0)
    if (!id) return
    window.api.music.byIds([id]).then((tracks) => {
      const track = tracks[0]
      if (!track) return
      const st = usePlayerStore.getState()
      // 先恢复歌曲但保持暂停，弹窗确认后再决定是否继续播放
      st.requestPlay(track)
      st.setAutoPlayBlocked(true)
      setResumePrompt(track)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const unsub = window.api.scan.onAutoComplete(() => {
      useMusicStore.getState().loadTracks(undefined, true)
      useMusicStore.getState().loadCount()
    })
    return unsub
  }, [])

  useEffect(() => {
    const unsub = window.api.updater.onStatus((status) => {
      if (status.state === 'downloaded') {
        setUpdateReady(status.version || '')
      } else if (status.state === 'available') {
        useToastStore.getState().addToast(t('update.downloading', { version: status.version || '' }), 'info')
      }
    })
    return unsub
  }, [])

  if (window.location.hash === '#lyrics') {
    return <DesktopLyrics />
  }

  return (
    <ErrorBoundary>
      <HashRouter>
        <div className="app-container">
          <AudioEngine />
          <Sidebar />
          <div className={`app-body${skin !== 'base' ? ` skin-${skin}` : ''}`}>
            <TitleBar />
            <main className="main-content">
              <Routes>
              <Route path="/" element={<LibraryPage />} />
              <Route path="/player" element={<PlayerPage />} />
              <Route path="/favorites" element={<FavoritesPage />} />
              <Route path="/playlist" element={<PlaylistPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/recent" element={<Navigate to="/history" replace />} />
              <Route path="/stats" element={<StatsPage />} />
              <Route path="/duplicates" element={<DuplicatesPage />} />
              <Route path="/config" element={<ConfigPage />} />
              </Routes>
            </main>
            <PlayerBar />
          </div>
          <QueuePanel />
        </div>
      </HashRouter>
      <Toaster />
      {resumePrompt && (
        <Modal onClose={() => setResumePrompt(null)} width={400}>
          <h3>{t('resume.title')}</h3>
          <p style={{ margin: '12px 0', color: 'var(--text-secondary)' }}>
            {t('resume.message', { name: resumePrompt.title || resumePrompt.filename })}
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setResumePrompt(null)}>{t('common.cancel')}</button>
            <button className="btn btn-primary" onClick={() => { usePlayerStore.getState().resume(); setResumePrompt(null) }}>{t('resume.continue')}</button>
          </div>
        </Modal>
      )}
      {updateReady && (
        <Modal onClose={() => setUpdateReady(null)} width={400}>
          <h3>{t('update.ready')}</h3>
          <p style={{ margin: '12px 0', color: 'var(--text-secondary)' }}>
            {t('update.message', { version: updateReady })}
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setUpdateReady(null)}>{t('update.later')}</button>
            <button className="btn btn-primary" onClick={() => window.api.updater.install()}>{t('update.install')}</button>
          </div>
        </Modal>
      )}
      {updateNotesVersion && (
        <UpdateNotesModal
          version={updateNotesVersion}
          onClose={() => {
            try { localStorage.setItem('update_notes_seen_version', updateNotesVersion) } catch { /* ignore */ }
            setUpdateNotesVersion(null)
          }}
        />
      )}
    </ErrorBoundary>
  )
}
