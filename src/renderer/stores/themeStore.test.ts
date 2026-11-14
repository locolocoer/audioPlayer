import { describe, it, expect, beforeEach } from 'vitest'
import { useThemeStore, lightenHex, darkenHex, DEFAULT_ACCENT } from './themeStore'

describe('颜色工具 lightenHex / darkenHex', () => {
  it('lightenHex 提亮黑色到中灰', () => {
    expect(lightenHex('#000000', 0.5)).toBe('#808080')
  })

  it('darkenHex 压暗白色到中灰', () => {
    expect(darkenHex('#ffffff', 0.5)).toBe('#808080')
  })

  it('支持不带 # 的 6 位色值', () => {
    expect(lightenHex('000000', 0.5)).toBe('#808080')
  })

  it('无效色值原样返回', () => {
    expect(lightenHex('fff', 0.5)).toBe('fff')
    expect(darkenHex('not-a-color', 0.5)).toBe('not-a-color')
  })

  it('amount=0 时保持不变', () => {
    expect(lightenHex('#123456', 0)).toBe('#123456')
    expect(darkenHex('#123456', 0)).toBe('#123456')
  })
})

describe('themeStore 主题与强调色', () => {
  beforeEach(() => {
    localStorage.clear()
    useThemeStore.setState({ theme: 'dark', accent: DEFAULT_ACCENT })
  })

  it('toggleTheme 在深/浅色间切换并持久化', () => {
    useThemeStore.getState().toggleTheme()
    expect(useThemeStore.getState().theme).toBe('light')
    expect(localStorage.getItem('theme')).toBe('light')
    useThemeStore.getState().toggleTheme()
    expect(useThemeStore.getState().theme).toBe('dark')
  })

  it('setTheme 设置并持久化', () => {
    useThemeStore.getState().setTheme('light')
    expect(useThemeStore.getState().theme).toBe('light')
    expect(localStorage.getItem('theme')).toBe('light')
  })

  it('setAccent 接受合法 6 位色值并持久化', () => {
    useThemeStore.getState().setAccent('#3b82f6')
    expect(useThemeStore.getState().accent).toBe('#3b82f6')
    expect(localStorage.getItem('accent')).toBe('#3b82f6')
  })

  it('setAccent 拒绝非法色值，保持原值', () => {
    useThemeStore.getState().setAccent('#e94560')
    useThemeStore.getState().setAccent('red')
    expect(useThemeStore.getState().accent).toBe('#e94560')
  })
})
