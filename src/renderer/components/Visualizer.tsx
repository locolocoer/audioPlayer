import { useEffect, useRef } from 'react'
import { useAudioGraphStore } from '../stores/audioGraphStore'

const BAR_COUNT = 48

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

    const draw = (): void => {
      raf = requestAnimationFrame(draw)
      analyser.getByteFrequencyData(data)
      ctx.clearRect(0, 0, W, H)
      for (let i = 0; i < BAR_COUNT; i++) {
        const idx = Math.floor((i / BAR_COUNT) * data.length)
        const v = data[idx] / 255
        const h = Math.max(2, v * (H - 4))
        const g = Math.floor(180 + 75 * v)
        ctx.fillStyle = `rgba(233,69,96,${0.35 + 0.5 * v})`
        ctx.fillRect(i * barW + 1, H - h, barW - 2, h)
      }
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [analyser])

  if (!analyser) return null
  return <canvas ref={canvasRef} className="visualizer" width={360} height={72} />
}
