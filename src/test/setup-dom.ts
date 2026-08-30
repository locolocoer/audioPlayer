import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

/**
 * dom 项目（jsdom 环境）setup：
 * 1. 提供与 src/preload/index.ts 结构一致的 window.api mock。
 *    - ipcFn()：模拟 ipcRenderer.invoke，默认返回 resolved Promise（与真实行为一致，
 *      组件/Store 里 `xxx().catch(...)`、`await xxx()` 才不会崩）
 *    - eventApi()：模拟 ipcRenderer.on，返回取消订阅函数
 * 2. 补齐 jsdom 未实现的 DOM API（ResizeObserver / IntersectionObserver / matchMedia / scrollIntoView）
 * 3. 每个测试后自动 cleanup + 清 mock 调用记录 + 清 localStorage
 */

function ipcFn(): ReturnType<typeof vi.fn> {
  return vi.fn(() => Promise.resolve())
}

function eventApi(): () => void {
  return vi.fn(() => () => undefined) as unknown as () => void
}

const api = {
  webdav: { test: ipcFn(), save: ipcFn(), list: ipcFn(), delete: ipcFn() },
  scan: {
    start: ipcFn(),
    startLocal: ipcFn(),
    cancel: ipcFn(),
    onProgress: eventApi(),
    onAutoComplete: eventApi()
  },
  music: {
    list: ipcFn(),
    byIds: ipcFn(),
    count: ipcFn(),
    toggleFavorite: ipcFn(),
    setRating: ipcFn(),
    favoriteList: ipcFn(),
    updateMeta: ipcFn(),
    updateMetaBatch: ipcFn(),
    duplicates: ipcFn(),
    deleteTrack: ipcFn(),
    getAiTags: ipcFn(),
    saveAiTags: ipcFn(),
    enrich: ipcFn(),
    recordPlay: ipcFn(),
    recent: ipcFn(),
    playHistory: ipcFn(),
    audioInfo: ipcFn(),
    alternatives: ipcFn(),
    setSourcePref: ipcFn()
  },
  playlist: { save: ipcFn(), list: ipcFn(), delete: ipcFn(), export: ipcFn(), import: ipcFn() },
  player: {
    getAudioPath: ipcFn(),
    getCover: ipcFn(),
    getLrc: ipcFn(),
    getFallbackAudio: ipcFn(),
    saveLyrics: ipcFn(),
    saveCover: ipcFn(),
    sendCommand: ipcFn(),
    onCommand: eventApi(),
    sendLyrics: ipcFn(),
    sendLyricsTime: ipcFn(),
    onLyricsSync: eventApi(),
    onLyricsResync: eventApi(),
    onLyricsTime: eventApi(),
    sendLyricsPaused: ipcFn(),
    onLyricsPaused: eventApi()
  },
  cache: { clear: ipcFn(), info: ipcFn(), removeFile: ipcFn() },
  backup: { export: ipcFn() },
  app: {
    info: ipcFn(),
    getAutoLaunch: ipcFn(),
    setAutoLaunch: ipcFn(),
    getCloseBehavior: ipcFn(),
    setCloseBehavior: ipcFn(),
    getLang: ipcFn(),
    setLang: ipcFn(),
    quit: ipcFn(),
    onLangChange: eventApi()
  },
  ai: {
    getConfig: ipcFn(),
    setConfig: ipcFn(),
    test: ipcFn(),
    chat: ipcFn(),
    chatStream: ipcFn(),
    onAiChunk: eventApi(),
    onAiEnd: eventApi()
  },
  updater: { check: ipcFn(), install: ipcFn(), onStatus: eventApi() },
  stats: { report: ipcFn(), trend: ipcFn() },
  window: {
    mini: ipcFn(),
    lyrics: ipcFn(),
    setFullscreen: ipcFn(),
    minimize: ipcFn(),
    toggleMaximize: ipcFn(),
    close: ipcFn(),
    isMaximized: ipcFn(),
    onMaximizedChange: eventApi()
  },
  log: ipcFn(),
  chooseFolder: ipcFn(),
  shell: { showItemInFolder: ipcFn() },
  lrc: { search: ipcFn() }
}

// 不依赖 renderer 的全局类型声明（本文件同时参与 node 项目 typecheck）
;(window as unknown as { api: unknown }).api = api

// ---- jsdom 缺失的 DOM API ----
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

class IntersectionObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
window.IntersectionObserver = IntersectionObserverStub as unknown as typeof IntersectionObserver

if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => false)
  })) as unknown as typeof window.matchMedia
}

// jsdom 没有 createObjectURL（cover 缓存等逻辑会用到）
if (!window.URL.createObjectURL) {
  window.URL.createObjectURL = vi.fn(() => 'blob:mock-cover') as unknown as typeof URL.createObjectURL
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn() as unknown as typeof Element.prototype.scrollIntoView
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  localStorage.clear()
})
