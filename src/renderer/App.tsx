import { HashRouter, Routes, Route } from 'react-router-dom'
import { useThemeStore } from './stores/themeStore'
import ConfigPage from './pages/ConfigPage'
import LibraryPage from './pages/LibraryPage'
import PlayerPage from './pages/PlayerPage'
import FavoritesPage from './pages/FavoritesPage'
import PlaylistPage from './pages/PlaylistPage'
import PlayerBar from './components/PlayerBar'
import AudioEngine from './components/AudioEngine'
import Sidebar from './components/Sidebar'
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

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    usePlaylistStore.getState().loadPlaylist()
  }, [])

  useEffect(() => {
    const id = Number(localStorage.getItem('resume_track_id') || 0)
    if (!id) return
    window.api.music.byIds([id]).then((tracks) => {
      const track = tracks[0]
      if (!track) return
      const st = usePlayerStore.getState()
      st.requestPlay(track)
      if (localStorage.getItem('resume_playing') !== '1') {
        st.setAutoPlayBlocked(true)
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const unsub = window.api.scan.onAutoComplete(() => {
      useMusicStore.getState().loadTracks(undefined, true)
      useMusicStore.getState().loadCount()
    })
    return unsub
  }, [])

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
              <Route path="/config" element={<ConfigPage />} />
              </Routes>
            </main>
            <PlayerBar />
          </div>
        </div>
      </HashRouter>
    </ErrorBoundary>
  )
}
