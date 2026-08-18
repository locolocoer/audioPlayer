import { useEffect, useRef } from 'react'
import { useAudioGraphStore } from '../stores/audioGraphStore'

const BAR_COUNT = 48
const PEAK_FALL = 0.015

export default function Visualizer(): JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const analyser = useAudioGraphStore((s) => s.analyser)

  useEffect(() => {
    if (!analyser) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    const data = new Uint8Array(analyser.frequencyBinCount)
    const W = canvas.width
    const H = canvas.height
    const barW = W / BAR_COUNT
    const n = data.length
    const nyquist = analyser.context.sampleRate / 2
    const minFreq = 30
    const maxFreq = Math.min(nyquist, 16000)

    // 预计算每根柱子的对数频率段下标
    const binIdx: number[] = []
    for (let i = 0; i < BAR_COUNT; i++) {
      const t = i / (BAR_COUNT - 1)
      const freq = minFreq * Math.pow(maxFreq / minFreq, t)
      binIdx.push(Math.min(n - 1, Math.floor((freq / nyquist) * n)))
    }

    // 峰值保持高度（0~1）
    const peaks = new Float32Array(BAR_COUNT)

    const draw = (): void => {
      raf = requestAnimationFrame(draw)
      analyser.getByteFrequencyData(data)
      ctx.clearRect(0, 0, W, H)

      for (let i = 0; i < BAR_COUNT; i++) {
        const raw = data[binIdx[i]] / 255
        if (raw > peaks[i]) peaks[i] = raw
        else peaks[i] = Math.max(0, peaks[i] - PEAK_FALL)

        const h = Math.max(2, raw * (H - 4))
        // 颜色随高度渐变：低=暗粉，高=亮粉
        const lightness = 30 + 38 * raw
        ctx.fillStyle = `hsl(351, 78%, ${lightness}%)`
        ctx.fillRect(i * barW + 1, H - h, barW - 2, h)

        // 峰值回落点
        const peakY = H - peaks[i] * (H - 4) - 2
        ctx.fillStyle = `rgba(255, 255, 255, ${0.35 + 0.65 * peaks[i]})`
        ctx.fillRect(i * barW + 1, peakY, barW - 2, 2)
      }
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [analyser])

  if (!analyser) return null
  return <canvas ref={canvasRef} className="visualizer" width={360} height={72} />
}
