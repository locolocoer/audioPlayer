import { useEffect, useState } from 'react'
import { usePlayerStore } from '../stores/playerStore'
import type { MusicFile } from '../../main/types'

interface Report {
  totalPlays: number
  playedCount: number
  totalMinutes: number
  topSongs: MusicFile[]
  topArtists: { artist: string; plays: number }[]
  topAlbums: { album: string; plays: number }[]
}

function fmtDuration(min: number): string {
  if (min >= 60) {
    const h = Math.floor(min / 60)
    const m = Math.round(min % 60)
    return `${h} 小时 ${m} 分钟`
  }
  return `${Math.round(min)} 分钟`
}

function TrendChart({ data }: { data: { date: string; plays: number }[] }): JSX.Element {
  const [hover, setHover] = useState<{ date: string; plays: number } | null>(null)
  if (data.length === 0) return <p className="stats-empty">暂无播放数据，听几首歌后这里会出现趋势图</p>
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
          {hover ? `${hover.date} · ${hover.plays} 次` : `最近 ${data.length} 天`}
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
        <h2>听歌统计</h2>
      </div>
      {report ? (
        <>
          <div className="stats-summary">
            <div className="stats-card summary">
              <div className="summary-num">{report.totalPlays.toLocaleString()}</div>
              <div className="summary-label">累计播放</div>
            </div>
            <div className="stats-card summary">
              <div className="summary-num">{fmtDuration(report.totalMinutes / 60)}</div>
              <div className="summary-label">累计收听时长</div>
            </div>
            <div className="stats-card summary">
              <div className="summary-num">{report.playedCount.toLocaleString()}</div>
              <div className="summary-label">听过歌曲</div>
            </div>
          </div>

          <div className="stats-card">
            <h3>播放趋势（近 30 天）</h3>
            <TrendChart data={trend} />
          </div>

          <div className="stats-grid">
            <RankList
              title="最常播放歌曲"
              items={report.topSongs.map((s) => ({
                name: s.title || s.filename,
                value: `${s.playCount} 次`
              }))}
            />
            <RankList
              title="最常播放歌手"
              items={report.topArtists.map((a) => ({ name: a.artist, value: `${a.plays} 次` }))}
            />
            <RankList
              title="最常播放专辑"
              items={report.topAlbums.map((a) => ({ name: a.album, value: `${a.plays} 次` }))}
            />
          </div>
        </>
      ) : (
        <p className="stats-empty">加载中...</p>
      )}
    </div>
  )
}
