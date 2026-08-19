import { useEffect, useRef } from 'react'
import { useAudioGraphStore } from '../stores/audioGraphStore'

// 与 vudio.js 默认参数对齐
const ACCURACY = 128
const MIN_HEIGHT = 1
const SPACING = 1

export default function Visualizer(): JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const analyser = useAudioGraphStore((s) => s.analyser)

  useEffect(() => {
    if (!analyser) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // vudio.js __init：fftSize = accuracy * 2
    analyser.fftSize = ACCURACY * 2

    let raf = 0
    const freqData = new Uint8Array(analyser.frequencyBinCount)
    const W = canvas.width
    const H = canvas.height
    const maxHeight = H - 6
    const half = ACCURACY / 2
    const barW = (W - ACCURACY * SPACING) / ACCURACY

    const draw = (): void => {
      raf = requestAnimationFrame(draw)
      analyser.getByteFrequencyData(freqData)
      ctx.clearRect(0, 0, W, H)

      // vudio.js __rebuildData（horizontalAlign = 'center'）
      const ordered = [
        ...Array.from(freqData).reverse().splice(half, half),
        ...Array.from(freqData).splice(0, half)
      ]

      for (let i = 0; i < ACCURACY; i++) {
        const value = ordered[i]

        // vudio.js prettify：两侧渐矮的包络
        let maxH: number
        if (i <= half) {
          maxH = (1 - (half - 1 - i) / half) * maxHeight
        } else {
          maxH = (1 - (i - half) / half) * maxHeight
        }

        let h = (value / 256) * maxH
        h = h < MIN_HEIGHT ? MIN_HEIGHT : h

        const left = i * (barW + SPACING)
        const top = (H - h) / 2 // vudio.js verticalAlign = 'middle'

        // 颜色渐变（vudio.js 支持 color 数组生成渐变）
        const grad = ctx.createLinearGradient(left, top, left, top + h)
        grad.addColorStop(0, '#ff8aa0')
        grad.addColorStop(1, '#8f2038')
        ctx.fillStyle = grad

        // vudio.js fadeSide：两侧渐隐
        ctx.globalAlpha = i <= half ? 1 - (half - 1 - i) / half : 1 - (i - half) / half

        ctx.fillRect(left, top, barW, h)
        ctx.globalAlpha = 1
      }
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [analyser])

  if (!analyser) return null
  return <canvas ref={canvasRef} className="visualizer" width={360} height={72} />
}
