import { useEffect, useState } from 'react'
import { usePlayerStore } from '../stores/playerStore'
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

  useEffect(() => {
    window.api.stats.report().then((r) => setReport(r)).catch(() => {})
    window.api.stats.trend(30).then((t) => setTrend(t)).catch(() => {})
  }, [])

  const play = (track: MusicFile): void => {
    usePlayerStore.getState().requestPlay(track)
  }

  return (
    <div className="page stats-page">
      <div className="page-header">
        <h2>{t('nav.stats')}</h2>
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
    </div>
  )
}
