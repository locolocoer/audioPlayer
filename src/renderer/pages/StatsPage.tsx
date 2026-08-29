import { useEffect, useState } from 'react'
import { usePlayerStore } from '../stores/playerStore'
import Modal from '../components/Modal'
import { useT } from '../i18n'
import type { MusicFile } from '../../main/types'

type TFunc = (key: string, vars?: Record<string, string | number>) => string

interface Report {
  totalPlays: number
  playedCount: number
  totalMinutes: number
  topSongs: MusicFile[]
  topArtists: { artist: string; plays: number }[]
  topAlbums: { album: string; plays: number }[]
}

function fmtDuration(min: number, t: TFunc): string {
  if (min >= 60) {
    const h = Math.floor(min / 60)
    const m = Math.round(min % 60)
    return t('stats.hours', { h, m })
  }
  return t('stats.minutes', { m: Math.round(min) })
}

function TrendChart({ data, t }: { data: { date: string; plays: number }[]; t: TFunc }): JSX.Element {
  const [hover, setHover] = useState<{ date: string; plays: number } | null>(null)
  if (data.length === 0) return <p className="stats-empty">{t('stats.noData')}</p>
  const max = Math.max(1, ...data.map((d) => d.plays))
  const W = 720
  const H = 180
  const pad = 6
  const maxBar = 18
  const bw = Math.min((W - pad * (data.length - 1)) / data.length, maxBar)
  const total = data.length * bw + (data.length - 1) * pad
  const x0 = (W - total) / 2
  return (
    <div className="trend-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="trend-svg" onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => {
          const h = Math.max(2, (d.plays / max) * (H - 24))
          const x = x0 + i * (bw + pad)
          const y = H - h
          return (
            <rect
              key={d.date}
              x={x}
              y={y}
              width={Math.max(2, bw)}
              height={h}
              rx={2}
              fill="var(--accent)"
              opacity={hover && hover.date === d.date ? 1 : 0.55 + (h / (H - 24)) * 0.4}
              onMouseEnter={() => setHover(d)}
            />
          )
        })}
        <text x={4} y={H - 6} fontSize={11} fill="var(--text-secondary)">
          {hover ? `${hover.date} · ${t('stats.times', { n: hover.plays })}` : t('stats.lastDays', { n: data.length })}
        </text>
      </svg>
    </div>
  )
}

function RankList({ title, items }: { title: string; items: { name: string; value: string }[] }): JSX.Element | null {
  if (items.length === 0) return null
  return (
    <div className="stats-card">
      <h3>{title}</h3>
      <ol className="rank-list">
        {items.map((it, i) => (
          <li key={`${i}-${it.name}`}>
            <span className="rank-no">{i + 1}</span>
            <span className="rank-name">{it.name}</span>
            <span className="rank-value">{it.value}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export default function StatsPage(): JSX.Element {
  const t = useT()
  const [report, setReport] = useState<Report | null>(null)
  const [trend, setTrend] = useState<{ date: string; plays: number }[]>([])
  const [weekReportOpen, setWeekReportOpen] = useState(false)
  const [weekReport, setWeekReport] = useState('')
  const [weekReportBusy, setWeekReportBusy] = useState(false)
  const [weekReportErr, setWeekReportErr] = useState('')

  useEffect(() => {
    window.api.stats.report().then((r) => setReport(r)).catch(() => {})
    window.api.stats.trend(30).then((t) => setTrend(t)).catch(() => {})
  }, [])

  const play = (track: MusicFile): void => {
    usePlayerStore.getState().requestPlay(track)
  }

  const generateWeekReport = async (): Promise<void> => {
    setWeekReportOpen(true)
    setWeekReport('')
    setWeekReportErr('')
    setWeekReportBusy(true)
    const trend7 = await window.api.stats.trend(7).catch(() => [])
    const totalPlays = trend7.reduce((s, d) => s + d.plays, 0)
    const topSongs = (report?.topSongs || []).slice(0, 8).map((s, i) => `${i + 1}. ${s.title || s.filename}（${s.playCount ?? 0}次）`).join('\n')
    const topArtists = (report?.topArtists || []).slice(0, 5).map((a, i) => `${i + 1}. ${a.artist}（${a.plays}次）`).join('\n')
    const trendText = trend7.map((d) => `${d.date}: ${d.plays}次`).join('\n')
    const context = `近 7 天播放统计：\n总播放 ${totalPlays} 次\n最常听歌曲：\n${topSongs || '暂无'}\n最常听歌手：\n${topArtists || '暂无'}\n每日播放趋势：\n${trendText || '暂无'}`
    const r = await window.api.ai.chat([{ role: 'user', content: context }], {
      system: '根据用户的听歌统计，写一份轻松有趣的周报（150-250字），总结听歌习惯、突出亮点，语气亲切，用中文。',
      maxTokens: 600,
      temperature: 0.8
    })
    setWeekReportBusy(false)
    if (r.ok && r.text) setWeekReport(r.text)
    else setWeekReportErr(r.error === 'not-configured' ? t('ai.notConfigured') : (r.error || t('ai.failed')))
  }

  return (
    <div className="page stats-page">
      <div className="page-header">
        <h2>{t('nav.stats')}</h2>
        <div className="library-controls">
          <button className="btn btn-sm" onClick={generateWeekReport} disabled={weekReportBusy}>
            {weekReportBusy ? t('common.loading') : t('ai.weekReport')}
          </button>
        </div>
      </div>
      {report ? (
        <>
          <div className="stats-summary">
            <div className="stats-card summary">
              <div className="summary-num">{report.totalPlays.toLocaleString()}</div>
              <div className="summary-label">{t('stats.totalPlays')}</div>
            </div>
            <div className="stats-card summary">
              <div className="summary-num">{fmtDuration(report.totalMinutes / 60, t)}</div>
              <div className="summary-label">{t('stats.totalTime')}</div>
            </div>
            <div className="stats-card summary">
              <div className="summary-num">{report.playedCount.toLocaleString()}</div>
              <div className="summary-label">{t('stats.playedCount')}</div>
            </div>
          </div>

          <div className="stats-card">
            <h3>{t('stats.trend')}</h3>
            <TrendChart data={trend} t={t} />
          </div>

          <div className="stats-grid">
            <RankList
              title={t('stats.topSongs')}
              items={report.topSongs.map((s) => ({
                name: s.title || s.filename,
                value: t('stats.times', { n: s.playCount ?? 0 })
              }))}
            />
            <RankList
              title={t('stats.topArtists')}
              items={report.topArtists.map((a) => ({ name: a.artist, value: t('stats.times', { n: a.plays }) }))}
            />
            <RankList
              title={t('stats.topAlbums')}
              items={report.topAlbums.map((a) => ({ name: a.album, value: t('stats.times', { n: a.plays }) }))}
            />
          </div>
        </>
      ) : (
        <p className="stats-empty">{t('common.loading')}</p>
      )}

      {weekReportOpen && (
        <Modal onClose={() => setWeekReportOpen(false)} width={480}>
          <h3>{t('ai.weekReport')}</h3>
          {weekReportBusy ? (
            <p className="ai-error">{t('common.loading')}</p>
          ) : weekReportErr ? (
            <p className="ai-error">{weekReportErr}</p>
          ) : (
            <div className="ai-report-text">{weekReport}</div>
          )}
          <div className="modal-actions">
            <button className="btn btn-primary" onClick={() => setWeekReportOpen(false)}>{t('common.close')}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
