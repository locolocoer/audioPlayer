import { useState } from 'react'
import Modal from './Modal'
import { usePlaylistStore } from '../stores/playlistStore'
import { useMusicStore } from '../stores/musicStore'
import { useToastStore } from '../stores/toastStore'
import { useT } from '../i18n'
import type { MusicFile } from '../../main/types'

interface AiPlaylistModalProps {
  onClose: () => void
}

interface AiTrack {
  title: string
  artist: string
}

export default function AiPlaylistModal({ onClose }: AiPlaylistModalProps): JSX.Element {
  const t = useT()
  const createPlaylist = usePlaylistStore((s) => s.createPlaylist)
  const addTracks = usePlaylistStore((s) => s.addTracks)
  const addToast = useToastStore((s) => s.addToast)
  const [desc, setDesc] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ name: string; matched: MusicFile[]; missing: AiTrack[] } | null>(null)
  const [error, setError] = useState('')

  const generate = async (): Promise<void> => {
    if (busy || !desc.trim()) return
    setBusy(true)
    setError('')
    setResult(null)
    const all = useMusicStore.getState().tracks
    // 曲库上下文：优先播放过的歌，控制 token 消耗（最多 1500 首）
    const sorted = [...all].sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
    const pool = sorted.slice(0, 1500)
    const catalog = pool.map((x) => `${x.title || x.filename}\t${x.artist || ''}`).join('\n')
    const system = `你是音乐歌单策划。用户曲库歌单如下（每行"歌名\t歌手"）：\n${catalog}\n\n请根据用户描述从该列表中挑选 10-30 首合适的歌，输出严格 JSON（不要任何其他文字）：{"name":"歌单名","description":"一句话说明","tracks":[{"title":"歌名","artist":"歌手"}]}`
    const r = await window.api.ai.chat([{ role: 'user', content: desc.trim() }], { system, maxTokens: 1500, temperature: 0.8 })
    setBusy(false)
    if (!r.ok || !r.text) {
      setError(r.error === 'not-configured' ? t('ai.notConfigured') : (r.error || t('ai.failed')))
      return
    }
    // 解析 JSON（容错：去掉可能的 markdown 代码块）
    let raw = r.text.trim()
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fence) raw = fence[1].trim()
    let parsed: { name?: string; description?: string; tracks?: AiTrack[] } = {}
    try {
      parsed = JSON.parse(raw)
    } catch {
      const start = raw.indexOf('{')
      const end = raw.lastIndexOf('}')
      if (start >= 0 && end > start) {
        try { parsed = JSON.parse(raw.slice(start, end + 1)) } catch { /* ignore */ }
      }
    }
    const tracks = Array.isArray(parsed.tracks) ? parsed.tracks.filter((x) => x && typeof x.title === 'string') : []
    if (tracks.length === 0) {
      setError(t('ai.playlistEmpty'))
      return
    }
    const matched: MusicFile[] = []
    const missing: AiTrack[] = []
    for (const item of tracks) {
      const found = all.find((tr) =>
        tr.title.toLowerCase() === item.title.toLowerCase() &&
        (!item.artist || tr.artist === item.artist)
      )
      if (found && !matched.some((m) => m.id === found.id)) matched.push(found)
      else missing.push(item)
    }
    setResult({ name: parsed.name || t('ai.playlistDefault'), matched, missing })
  }

  const confirmCreate = async (): Promise<void> => {
    if (!result) return
    await createPlaylist(result.name)
    if (result.matched.length > 0) addTracks(result.matched)
    addToast(t('ai.playlistCreated', { name: result.name, n: result.matched.length }), 'success')
    onClose()
  }

  return (
    <Modal onClose={onClose} width={460}>
      <h3>{t('ai.playlistTitle')}</h3>
      <div className="form-group">
        <label>{t('ai.playlistDesc')}</label>
        <textarea
          className="ai-desc-input"
          rows={3}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder={t('ai.playlistPlaceholder')}
        />
      </div>
      {error && <p className="ai-error">{error}</p>}
      {result && (
        <div className="ai-result">
          <div className="ai-result-name">{result.name}</div>
          <p className="ai-result-meta">
            {t('ai.matched', { n: result.matched.length })}
            {result.missing.length > 0 && ` · ${t('ai.missing', { n: result.missing.length })}`}
          </p>
          <div className="ai-result-list">
            {result.matched.map((m) => (
              <div key={m.id} className="ai-result-item">
                <span className="ai-result-title">{m.title || m.filename}</span>
                <span className="album-meta">{m.artist || ''}</span>
              </div>
            ))}
            {result.missing.map((m, i) => (
              <div key={`m-${i}`} className="ai-result-item ai-result-missing">
                <span className="ai-result-title">{m.title}</span>
                <span className="album-meta">{m.artist || ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
        {result ? (
          <button className="btn btn-primary" onClick={confirmCreate}>{t('ai.playlistCreate')}</button>
        ) : (
          <button className="btn btn-primary" onClick={generate} disabled={busy || !desc.trim()}>
            {busy ? t('common.loading') : t('ai.generate')}
          </button>
        )}
      </div>
    </Modal>
  )
}
