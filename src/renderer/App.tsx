import { HashRouter, Routes, Route } from 'react-router-dom'
import { useThemeStore, lightenHex } from './stores/themeStore'
import ConfigPage from './pages/ConfigPage'
import LibraryPage from './pages/LibraryPage'
import PlayerPage from './pages/PlayerPage'
import FavoritesPage from './pages/FavoritesPage'
import PlaylistPage from './pages/PlaylistPage'
import RecentPage from './pages/RecentPage'
import StatsPage from './pages/StatsPage'
import PlayerBar from './components/PlayerBar'
import AudioEngine from './components/AudioEngine'
import Sidebar from './components/Sidebar'
import QueuePanel from './components/QueuePanel'
import DesktopLyrics from './components/DesktopLyrics'
import Toaster from './components/Toaster'
import { usePlaylistStore } from './stores/playlistStore'
import { usePlayerStore } from './stores/playerStore'
import { useMusicStore } from './stores/musicStore'
import { useEffect, Component } from 'react'

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
          <h2>界面错误</h2>
          <pre>{this.state.error}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App(): JSX.Element {
  const theme = useThemeStore((s) => s.theme)
  const accent = useThemeStore((s) => s.accent)

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', theme)
    root.style.setProperty('--accent', accent)
    root.style.setProperty('--accent-hover', lightenHex(accent, 0.2))
  }, [theme, accent])

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
      const wasPlaying = localStorage.getItem('resume_playing') === '1'
      st.requestPlay(track)
      st.setAutoPlayBlocked(!wasPlaying)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const unsub = window.api.scan.onAutoComplete(() => {
      useMusicStore.getState().loadTracks(undefined, true)
      useMusicStore.getState().loadCount()
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
          <div className="app-body">
            <main className="main-content">
              <Routes>
              <Route path="/" element={<LibraryPage />} />
              <Route path="/player" element={<PlayerPage />} />
              <Route path="/favorites" element={<FavoritesPage />} />
              <Route path="/playlist" element={<PlaylistPage />} />
              <Route path="/recent" element={<RecentPage />} />
              <Route path="/stats" element={<StatsPage />} />
              <Route path="/config" element={<ConfigPage />} />
              </Routes>
            </main>
            <PlayerBar />
          </div>
          <QueuePanel />
        </div>
      </HashRouter>
      <Toaster />
    </ErrorBoundary>
  )
}
