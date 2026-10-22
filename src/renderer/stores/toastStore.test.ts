import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useToastStore } from './toastStore'

describe('toastStore 消息提示', () => {
  beforeEach(() => { useToastStore.setState({ toasts: [] }) })
  afterEach(() => { vi.useRealTimers() })

  it('addToast 默认 info 类型并追加到列表', () => {
    useToastStore.getState().addToast('hello')
    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0].message).toBe('hello')
    expect(toasts[0].type).toBe('info')
  })

  it('addToast 可指定类型', () => {
    useToastStore.getState().addToast('ok', 'success')
    expect(useToastStore.getState().toasts[0].type).toBe('success')
  })

  it('removeToast 移除指定 id', () => {
    useToastStore.getState().addToast('a')
    useToastStore.getState().addToast('b')
    const [first] = useToastStore.getState().toasts
    useToastStore.getState().removeToast(first.id)
    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0].message).toBe('b')
  })

  it('3.5 秒后自动移除', () => {
    vi.useFakeTimers()
    useToastStore.getState().addToast('auto', 'error')
    expect(useToastStore.getState().toasts).toHaveLength(1)
    vi.advanceTimersByTime(3500)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })
})
