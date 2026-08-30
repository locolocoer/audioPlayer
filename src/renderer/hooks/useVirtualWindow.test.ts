import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useVirtualWindow } from './useVirtualWindow'

/**
 * useVirtualWindow 回归点：
 * 1. start 永不越界（曾修过：滚动到底部时 start 可能超过 count 导致 slice 为空）
 * 2. 容器重挂载时 scrollTop 状态与 DOM 同步（视图切换后窗口不错位）
 */

describe('useVirtualWindow 窗口计算', () => {
  it('初始窗口从 0 开始，end 不超过 count', () => {
    const { result } = renderHook(() => useVirtualWindow(100, 40))
    expect(result.current.start).toBe(0)
    expect(result.current.end).toBeLessThanOrEqual(100)
    expect(result.current.end).toBeGreaterThan(0)
  })

  it('滚动到接近底部时 start 钳制在合法范围', () => {
    const { result } = renderHook(() => useVirtualWindow(100, 40))
    act(() => {
      // 100 行 × 40px = 4000px 内容，滚动到 3800
      result.current.onScroll({ currentTarget: { scrollTop: 3800 } } as React.UIEvent<HTMLDivElement>)
    })
    expect(result.current.start).toBe(85) // floor(3800/40)=95，overscan 10 → 85
    expect(result.current.end).toBe(100)
  })

  it('超出内容的滚动位置被钳制，start 永不大于 count（防回归）', () => {
    const { result } = renderHook(() => useVirtualWindow(100, 40))
    act(() => {
      result.current.onScroll({ currentTarget: { scrollTop: 99999 } } as React.UIEvent<HTMLDivElement>)
    })
    expect(result.current.start).toBeLessThanOrEqual(100)
    expect(result.current.start).toBe(100)
    expect(result.current.end).toBe(100)
    expect(result.current.topPad).toBe(4000) // 顶衬垫不超内容高度
    expect(result.current.bottomPad).toBe(0)
  })

  it('count 变化后窗口自动重算', () => {
    const { result, rerender } = renderHook(({ count }) => useVirtualWindow(count, 40), {
      initialProps: { count: 100 }
    })
    act(() => {
      result.current.onScroll({ currentTarget: { scrollTop: 3900 } } as React.UIEvent<HTMLDivElement>)
    })
    rerender({ count: 50 }) // 列表收缩
    expect(result.current.start).toBeLessThanOrEqual(50)
    expect(result.current.end).toBeLessThanOrEqual(50)
    expect(result.current.bottomPad).toBeGreaterThanOrEqual(0)
  })
})
