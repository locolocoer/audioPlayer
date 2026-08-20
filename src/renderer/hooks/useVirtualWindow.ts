import { useState, useCallback, useLayoutEffect } from 'react'

export interface VirtualWindow {
  containerRef: (el: HTMLDivElement | null) => void
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void
  start: number
  end: number
  topPad: number
  bottomPad: number
}

export function useVirtualWindow(count: number, rowHeight: number, overscan = 10): VirtualWindow {
  const [node, setNode] = useState<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(0)

  const containerRef = useCallback((el: HTMLDivElement | null): void => {
    setNode(el)
  }, [])

  useLayoutEffect(() => {
    if (!node) return
    // 容器可能因视图切换而重新挂载（新元素 scrollTop 归零），同步一次状态避免窗口错位
    setScrollTop(node.scrollTop)
    const update = (): void => setViewportH(node.clientHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(node)
    return () => ro.disconnect()
  }, [node])

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>): void => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const end = Math.min(count, Math.ceil((scrollTop + viewportH) / rowHeight) + overscan)
  const topPad = start * rowHeight
  const bottomPad = Math.max(0, (count - end) * rowHeight)

  return { containerRef, onScroll, start, end, topPad, bottomPad }
}
