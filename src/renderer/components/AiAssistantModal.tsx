import { useState, useRef, useEffect } from 'react'
import Modal from './Modal'
import { useMusicStore } from '../stores/musicStore'
import { usePlaylistStore } from '../stores/playlistStore'
import { usePlayerStore } from '../stores/playerStore'
import { useToastStore } from '../stores/toastStore'
import { useT } from '../i18n'
import type { MusicFile } from '../../main/types'

interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
  trackIds?: number[]
}

// 对话历史持久化：关闭对话框再打开不丢失；本地最多保留 60 条，避免 localStorage 膨胀
const HISTORY_KEY = 'ai_chat_history'
const HISTORY_MAX = 60

function loadHistory(): ChatMsg[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) {
        return arr
          .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
          .slice(-HISTORY_MAX)
      }
    }
  } catch { /* ignore */ }
  return []
}

function saveHistory(list: ChatMsg[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(-HISTORY_MAX)))
  } catch { /* ignore */ }
}

// 发送给 AI 的上下文：只取最近 20 条，单条截断 + 总长度上限，防止上下文无限膨胀
function buildContext(list: ChatMsg[]): { role: 'user' | 'assistant'; content: string }[] {
  const MAX_MSGS = 20
  const MAX_PER_MSG = 1000
  const MAX_TOTAL = 8000
  const trimmed = list.slice(-MAX_MSGS).map((m) => ({
    role: m.role,
    content: m.content.length > MAX_PER_MSG ? m.content.slice(-MAX_PER_MSG) : m.content
  }))
  let total = trimmed.reduce((s, m) => s + m.content.length, 0)
  while (total > MAX_TOTAL && trimmed.length > 2) {
    total -= trimmed[0].content.length
    trimmed.shift()
  }
  return trimmed
}

interface AiTrack {
  title: string
  artist: string
}

interface AiAssistantModalProps {
  onClose: () => void
}

// 解析 AI 回复中的动作块并返回展示文本
function parseActions(text: string): { display: string; plays: AiTrack[]; playlist: { name: string; tracks: AiTrack[] } | null } {
  const plays: AiTrack[] = []
  let playlist: { name: string; tracks: AiTrack[] } | null = null
  let display = text
  const playRe = /<play>([\s\S]*?)<\/play>/g
  let m: RegExpExecArray | null
  while ((m = playRe.exec(text)) !== null) {
    try {
      const arr = JSON.parse(m[1])
      if (Array.isArray(arr)) {
        for (const x of arr) {
          if (x && typeof x.title === 'string') plays.push({ title: x.title, artist: typeof x.artist === 'string' ? x.artist : '' })
        }
      }
    } catch { /* ignore */ }
  }
  const plRe = /<playlist name="([^"]*)">([\s\S]*?)<\/playlist>/
  const pl = plRe.exec(text)
  if (pl) {
    try {
      const arr = JSON.parse(pl[2])
      if (Array.isArray(arr)) {
        playlist = {
          name: pl[1] || '',
          tracks: arr.filter((x: unknown) => !!x && typeof (x as AiTrack).title === 'string').map((x: AiTrack) => ({ title: x.title, artist: x.artist || '' }))
        }
      }
    } catch { /* ignore */ }
  }
  display = text.replace(/<play>[\s\S]*?<\/play>/g, '').replace(/<playlist[\s\S]*?<\/playlist>/g, '').trim()
  return { display, plays, playlist }
}

function normalize(s: string): string {
  return (s || '').toLowerCase().replace(/[（）()\[\]【】\s·\-_'"“”‘’]/g, '')
}

// 匹配曲库：title+artist 全等 → title 全等 → 归一化后互相包含（放宽到能应对 AI 输出与曲库标签的细微差异）
function matchTracks(list: AiTrack[]): MusicFile[] {
  const all = useMusicStore.getState().tracks
  const matched: MusicFile[] = []
  for (const item of list) {
    const normTitle = normalize(item.title)
    if (!normTitle) continue
    let found = all.find((tr) =>
      normalize(tr.title) === normTitle &&
      item.artist && normalize(tr.artist) === normalize(item.artist)
    )
    if (!found) {
      found = all.find((tr) => normalize(tr.title) === normTitle)
    }
    if (!found && normTitle.length >= 4) {
      found = all.find((tr) => {
        const nt = normalize(tr.title)
        return nt.includes(normTitle) || normTitle.includes(nt)
      })
    }
    if (found && !matched.some((x) => x.id === found.id)) matched.push(found)
  }
  return matched
}

// 从回复文本中启发式提取歌曲列表（"- 歌名"、"1. 歌名 - 歌手" 等行），
// 不依赖 AI 是否输出 <play> 动作块
function extractTracksFromText(text: string): AiTrack[] {
  const out: AiTrack[] = []
  const seen = new Set<string>()
  const lines = text.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    const m = trimmed.match(/^[-*•]\s*(.+)$/) || trimmed.match(/^\d+[.、)]\s*(.+)$/)
    if (!m) continue
    const rest = m[1].replace(/[「」《》"'']/g, '')
    const parts = rest.split(/\s+[-–—]\s+/)
    const title = (parts[0] || '').trim()
    const artist = parts.length > 1 ? parts[parts.length - 1].trim() : ''
    if (title.length >= 2 && !seen.has(title)) {
      seen.add(title)
      out.push({ title, artist })
    }
  }
  return out
}

// 轻量 Markdown 渲染：先转义 HTML 再替换常见语法，保证安全
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function renderMd(s: string): string {
  let html = escapeHtml(s)
  html = html.replace(/```([\s\S]*?)```/g, (_m, code: string) => `<pre class="ai-md-pre">${code.trim()}</pre>`)
  html = html.replace(/`([^`]+)`/g, (_m, code: string) => `<code class="ai-md-code">${code}</code>`)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/(^|\n)#{1,3} (.+)/g, '$1<h4 class="ai-md-h">$2</h4>')
  // 列表：行首 - 或数字. 转 li，连续行包 ul
  html = html.replace(/(?:^|\n)((?:[-*]|\d+\.) .+(?:\n(?:[-*]|\d+\.) .+)*)/g, (_m, block: string) => {
    const items = block.split('\n').map((line: string) => {
      const li = line.replace(/^\s*(?:[-*]|\d+\.)\s+/, '')
      return `<li>${li}</li>`
    }).join('')
    return `<ul class="ai-md-ul">${items}</ul>`
  })
  html = html.replace(/\n{3,}/g, '\n\n')
  return html
}

export default function AiAssistantModal({ onClose }: AiAssistantModalProps): JSX.Element {
  const t = useT()
  const allTracks = useMusicStore((s) => s.tracks)
  const [messages, setMessages] = useState<ChatMsg[]>(() => loadHistory())
  const [reasoning, setReasoning] = useState('')
  const [streamingText, setStreamingText] = useState('')
  const [reasoningOpen, setReasoningOpen] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [modelName, setModelName] = useState('')
  const [totalTokens, setTotalTokens] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const reasoningBodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.api.ai.getConfig().then((cfg) => setModelName(cfg.model || '')).catch(() => {})
  }, [])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages, reasoning, streamingText, busy])

  // 思考内容流式更新时，自动滚动到最新内容（像 DeepSeek 思考面板一样）
  useEffect(() => {
    if (reasoningBodyRef.current) reasoningBodyRef.current.scrollTop = reasoningBodyRef.current.scrollHeight
  }, [reasoning])

  // 历史变化时持久化
  useEffect(() => {
    saveHistory(messages)
  }, [messages])

  const buildSystem = (): string => {
    const all = useMusicStore.getState().tracks
    const top = [...all]
      .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
      .slice(0, 20)
      .map((x, i) => `${i + 1}. ${x.title || x.filename} - ${x.artist || ''}（${x.playCount || 0}次）`)
      .join('\n')
    const playlists = usePlaylistStore.getState().playlists.map((p) => p.name).join('、') || t('playlist.empty')
    return `${t('ai.assistantSystem')}\n${t('ai.librarySummary', { n: all.length })}\n${t('ai.topPlayed')}:\n${top || t('stats.noData')}\n${t('ai.userPlaylists')}：${playlists}\n\n${t('ai.actionRule')}\n\n${t('ai.plainTextRule')}`
  }

  const handleAssistantReply = (fullText: string): void => {
    const { display, plays, playlist } = parseActions(fullText)
    const displayMsg = display || fullText
    // 歌曲候选：优先 <play> 动作块，否则从回复文本提取（"- 歌名" 列表行）
    const candidates = plays.length > 0 ? plays : extractTracksFromText(displayMsg)
    const matched = matchTracks(candidates)
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: displayMsg, trackIds: matched.map((x) => x.id) }
    ])
    // 仅在 AI 明确输出 <play> 动作时自动播放；文本提取的歌曲通过 chips 点击播放
    if (plays.length > 0 && matched.length > 0) {
      // 用 playSelection：清空当前播放列表、完整替换队列，避免被已有歌单覆盖
      usePlayerStore.getState().setPlayMode('sequential')
      usePlayerStore.getState().playSelection(matched)
      if (matched.length < plays.length) {
        useToastStore.getState().addToast(t('ai.playingPartial', { n: matched.length, total: plays.length }), 'info')
      } else {
        useToastStore.getState().addToast(t('ai.playingNow', { n: matched.length }), 'success')
      }
    }
    if (playlist && playlist.tracks.length > 0) {
      const plMatched = matchTracks(playlist.tracks)
      if (plMatched.length > 0) {
        usePlaylistStore.getState().createPlaylist(playlist.name || t('ai.playlistDefault')).then(() => {
          usePlaylistStore.getState().addTracks(plMatched)
          useToastStore.getState().addToast(t('ai.playlistCreated', { name: playlist.name || t('ai.playlistDefault'), n: plMatched.length }), 'success')
        })
      }
    }
  }

  const playOne = (track: MusicFile): void => {
    usePlayerStore.getState().setPlayMode('sequential')
    usePlayerStore.getState().playSelection([track])
  }

  const copyText = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      useToastStore.getState().addToast(t('ai.copied'), 'success')
    } catch { /* ignore */ }
  }

  const send = async (): Promise<void> => {
    const text = input.trim()
    if (!text || busy) return
    const next: ChatMsg[] = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setInput('')
    setBusy(true)
    setError('')
    setReasoning('')
    setStreamingText('')
    let accReasoning = ''
    let accText = ''
    let ended = false
    const unsubChunk = window.api.ai.onAiChunk((part) => {
      if (part.reasoning) {
        accReasoning += part.reasoning
        setReasoning(accReasoning)
      }
      if (part.content) {
        accText += part.content
        setStreamingText(accText)
      }
    })
    const unsubEnd = window.api.ai.onAiEnd((r) => {
      if (ended) return
      ended = true
      unsubChunk()
      unsubEnd()
      setBusy(false)
      // 兜底：无论流式期间的 setState 是否生效，最终都用完整思考内容
      const fullReasoning = accReasoning || r.reasoning || ''
      if (fullReasoning) setReasoning((prev) => (fullReasoning.length > prev.length ? fullReasoning : prev))
      const finalText = accText || (r.text && !fullReasoning ? r.text : '')
      // 累积 token 用量
      const used = r.usage?.total_tokens || ((r.usage?.prompt_tokens || 0) + (r.usage?.completion_tokens || 0))
      if (used > 0) setTotalTokens((prev) => prev + used)
      if (r.ok) {
        if (finalText) handleAssistantReply(finalText)
        else if (!fullReasoning) setError(t('ai.failed'))
      } else {
        setError(r.error === 'not-configured' ? t('ai.notConfigured') : (r.error || t('ai.failed')))
      }
      setStreamingText('')
    })
    try {
      window.api.ai.chatStream(
        buildContext(next),
        { system: buildSystem(), maxTokens: 4096, temperature: 0.8 }
      )
    } catch (err) {
      ended = true
      unsubChunk()
      unsubEnd()
      setBusy(false)
      setReasoning('')
      setStreamingText('')
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Modal onClose={onClose} width={520}>
      <div className="ai-chat-header">
        <div className="ai-chat-title">
          <span className="ai-chat-logo">✨</span>
          <h3>{t('ai.assistant')}</h3>
          {modelName && (
            <span className="ai-model-info">
              {modelName}
              {totalTokens > 0 ? ` · ${totalTokens} tokens` : ''}
            </span>
          )}
        </div>
        {messages.length > 0 && (
          <button className="btn btn-sm btn-secondary" onClick={() => setMessages([])}>{t('ai.clearChat')}</button>
        )}
      </div>
      {/* 思考过程固定在列表上方，始终可见；默认折叠只显示一行最新内容 */}
      {reasoning && (
        <div className="ai-reasoning">
          <div className="ai-reasoning-toggle" onClick={() => setReasoningOpen((o) => !o)}>
            <span className="ai-reasoning-label">🧠 {busy ? t('ai.thinking') : t('ai.deepThought')}</span>
            <span className="ai-reasoning-arrow">{reasoningOpen ? '▾' : '▸'}</span>
          </div>
          {reasoningOpen ? (
            <div className="ai-reasoning-body" ref={reasoningBodyRef}>{reasoning}</div>
          ) : (
            <div className="ai-reasoning-collapsed">
              {reasoning.split('\n').filter(Boolean).pop() || reasoning.slice(-80)}
            </div>
          )}
        </div>
      )}
      <div className="ai-chat-list" ref={listRef}>
        {messages.length === 0 && !busy && (
          <div className="ai-chat-hint">
            <div className="ai-chat-hint-icon">🎵</div>
            <p>{t('ai.assistantHint')}</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`ai-chat-msg ${m.role}`}>
            <span className={`ai-chat-avatar ${m.role}`}>{m.role === 'user' ? '🧑' : '🤖'}</span>
            {m.role === 'assistant' ? (
              <div className="ai-msg-col">
                <span className="ai-chat-bubble ai-chat-md" dangerouslySetInnerHTML={{ __html: renderMd(m.content) }} />
                {m.trackIds && m.trackIds.length > 0 && (
                  <div className="ai-track-chips">
                    {m.trackIds.map((id) => {
                      const tr = allTracks.find((x) => x.id === id)
                      return tr ? (
                        <button key={id} type="button" className="ai-track-chip" onClick={() => playOne(tr)} title={`${tr.artist || ''} · ${tr.album || ''}`}>
                          ▶ {tr.title}
                        </button>
                      ) : null
                    })}
                  </div>
                )}
                <button className="ai-copy-btn" onClick={() => copyText(m.content)}>{t('ai.copy')}</button>
              </div>
            ) : (
              <span className="ai-chat-bubble">{m.content}</span>
            )}
          </div>
        ))}
        {streamingText && (
          <div className="ai-chat-msg assistant">
            <span className="ai-chat-avatar assistant">🤖</span>
            <span className="ai-chat-bubble ai-chat-md" dangerouslySetInnerHTML={{ __html: renderMd(streamingText) }} />
          </div>
        )}
        {busy && !streamingText && !reasoning && (
          <div className="ai-chat-msg assistant">
            <span className="ai-chat-avatar assistant">🤖</span>
            <span className="ai-chat-bubble ai-chat-typing"><i /><i /><i /></span>
          </div>
        )}
        {error && <div className="ai-error">{error}</div>}
      </div>
      <div className="ai-chat-input">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send() }}
          placeholder={t('ai.assistantPlaceholder')}
          autoFocus
        />
        <button className="ai-send-btn" onClick={send} disabled={busy || !input.trim()} title={t('ai.send')}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
    </Modal>
  )
}
