import { useState, useEffect, useCallback } from 'react'
import { useMusicStore } from '../stores/musicStore'
import { usePlaylistStore } from '../stores/playlistStore'
import { useThemeStore } from '../stores/themeStore'
import { useLyricsStyleStore } from '../stores/lyricsStyleStore'
import { useSkinStore, SKINS } from '../stores/skinStore'
import { useVisualizerStore } from '../stores/visualizerStore'
import { useShortcutsStore, SHORTCUT_LABELS, formatShortcut } from '../stores/shortcutsStore'
import type { ShortcutAction } from '../stores/shortcutsStore'
import Modal from '../components/Modal'
import type { WebDAVConfig, ScanSettings, AppInfo, UpdateStatus } from '../../main/types'
import { DEFAULT_SCAN_SETTINGS } from '../../main/types'
import { useI18nStore, useT } from '../i18n'

interface DLStyle { fontSize: number; color: string; backdrop: number; align: 'left' | 'center' | 'right' }
const DL_DEFAULT: DLStyle = { fontSize: 26, color: '#ffffff', backdrop: 0, align: 'center' }
const DL_SWATCHES = ['#ffffff', '#ffe066', '#ff6b6b', '#ff8a80', '#b388ff', '#80ffea', '#69f0ae']

function loadDlStyle(): DLStyle {
  try {
    const raw = localStorage.getItem('desktop_lyrics_style')
    if (raw) return { ...DL_DEFAULT, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return DL_DEFAULT
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${n} B`
}

function renderUpdateStatus(s: UpdateStatus, t: (key: string, vars?: Record<string, string | number>) => string): string {
  switch (s.state) {
    case 'checking': return t('update.checking')
    case 'available': return t('update.available', { version: s.version || '' })
    case 'downloading': return t('update.downloadingPercent', { percent: s.percent ?? 0 })
    case 'downloaded': return t('update.downloaded', { version: s.version || '' })
    case 'not-available': return t('update.notAvailable')
    case 'error': return t('update.checkFailed', { msg: s.message || t('update.unknownError') })
    case 'dev': return t('update.devMode')
    default: return ''
  }
}

function formatServerUrl(config: WebDAVConfig): string {
  if (config.sourceType === 'local') return config.url
  const hasPort = /:\d+(\/|$)/.test(config.url)
  return hasPort ? config.url : `${config.url}:${config.port}`
}

export default function ConfigPage(): JSX.Element {
  const t = useT()
  const lang = useI18nStore((s) => s.lang)
  const setLang = useI18nStore((s) => s.setLang)
  const configs = useMusicStore((s) => s.configs)
  const loadConfigs = useMusicStore((s) => s.loadConfigs)
  const saveConfig = useMusicStore((s) => s.saveConfig)
  const deleteConfig = useMusicStore((s) => s.deleteConfig)
  const startScan = useMusicStore((s) => s.startScan)
  const cancelScan = useMusicStore((s) => s.cancelScan)
  const isScanning = useMusicStore((s) => s.isScanning)
  const scanProgress = useMusicStore((s) => s.scanProgress)
  const theme = useThemeStore((s) => s.theme)
  const accent = useThemeStore((s) => s.accent)
  const setTheme = useThemeStore((s) => s.setTheme)
  const setAccent = useThemeStore((s) => s.setAccent)
  const lyricsFontSize = useLyricsStyleStore((s) => s.fontSize)
  const lyricsAlign = useLyricsStyleStore((s) => s.align)
  const setLyricsFontSize = useLyricsStyleStore((s) => s.setFontSize)
  const setLyricsAlign = useLyricsStyleStore((s) => s.setAlign)
  const skin = useSkinStore((s) => s.skin)
  const setSkin = useSkinStore((s) => s.setSkin)
  const visualizerEnabled = useVisualizerStore((s) => s.enabled)
  const setVisualizerEnabled = useVisualizerStore((s) => s.setEnabled)

  const [showForm, setShowForm] = useState(false)
  const [testing, setTesting] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [scanSettings, setScanSettings] = useState<ScanSettings>(() => {
    try {
      const raw = localStorage.getItem('scan_settings')
      if (raw) {
        const p = JSON.parse(raw)
        return {
          delayMs: Number(p.delayMs) || DEFAULT_SCAN_SETTINGS.delayMs,
          maxRetries: Number(p.maxRetries) || DEFAULT_SCAN_SETTINGS.maxRetries,
          backoffMultiplier: Number(p.backoffMultiplier) || DEFAULT_SCAN_SETTINGS.backoffMultiplier
        }
      }
    } catch { /* ignore */ }
    return DEFAULT_SCAN_SETTINGS
  })
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [form, setForm] = useState<WebDAVConfig>({
    id: '',
    name: '',
    url: 'https://webdav.123pan.cn/webdav',
    username: '',
    password: '',
    port: 443,
    enabled: true,
    createdAt: new Date().toISOString(),
    sourceType: 'webdav'
  })
  const [desktopLyricsOn, setDesktopLyricsOn] = useState(() => localStorage.getItem('desktop_lyrics') === '1')
  const [dlStyle, setDlStyle] = useState<DLStyle>(loadDlStyle)
  const [cacheInfo, setCacheInfo] = useState<{ size: number; files: { name: string; size: number }[] } | null>(null)
  const [backupMsg, setBackupMsg] = useState('')
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'idle' })
  const [checking, setChecking] = useState(false)
  const shortcuts = useShortcutsStore((s) => s.shortcuts)
  const setShortcut = useShortcutsStore((s) => s.setShortcut)
  const resetShortcuts = useShortcutsStore((s) => s.resetShortcuts)
  const [recording, setRecording] = useState<ShortcutAction | null>(null)
  const [autoLaunch, setAutoLaunch] = useState(false)
  const [closeBehavior, setCloseBehavior] = useState<'quit' | 'tray'>('quit')
  const [aiConfig, setAiConfig] = useState<{ enabled: boolean; provider: 'openai' | 'anthropic'; baseUrl: string; apiKey: string; model: string }>({
    enabled: false, provider: 'openai', baseUrl: '', apiKey: '', model: ''
  })
  const [aiTestState, setAiTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [aiTestMsg, setAiTestMsg] = useState('')
  const [aiSaved, setAiSaved] = useState(false)

  useEffect(() => {
    window.api.ai.getConfig().then((cfg) => setAiConfig(cfg)).catch(() => {})
  }, [])

  const saveAi = async (): Promise<void> => {
    await window.api.ai.setConfig(aiConfig)
    setAiSaved(true)
    setTimeout(() => setAiSaved(false), 2000)
  }

  const testAi = async (): Promise<void> => {
    setAiTestState('testing')
    setAiTestMsg('')
    // 直接使用当前表单配置测试；通过后自动保存，让 AI 功能立即生效
    const cfg = { ...aiConfig, enabled: true }
    const r = await window.api.ai.test(cfg)
    setAiTestState(r.ok ? 'ok' : 'fail')
    setAiTestMsg(r.error || '')
    if (r.ok) {
      await window.api.ai.setConfig(cfg)
      setAiConfig(cfg)
      setAiSaved(true)
      setTimeout(() => setAiSaved(false), 2000)
    }
  }

  useEffect(() => {
    if (!recording) return
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setRecording(null)
        return
      }
      if (e.code === 'Backspace' || e.code === 'Delete') {
        setShortcut(recording, '')
        setRecording(null)
        return
      }
      if (['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(e.code)) return
      setShortcut(recording, formatShortcut(e))
      setRecording(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording, setShortcut])

  useEffect(() => {
    window.api.app.getAutoLaunch().then(setAutoLaunch).catch(() => {})
    window.api.app.getCloseBehavior().then((v) => setCloseBehavior(v === 'tray' ? 'tray' : 'quit')).catch(() => {})
  }, [])

  useEffect(() => {
    window.api.app.info().then(setAppInfo).catch(() => {})
  }, [])

  useEffect(() => {
    const unsub = window.api.updater.onStatus((status) => {
      setUpdateStatus(status)
      if (status.state === 'available' || status.state === 'not-available' || status.state === 'error' || status.state === 'dev') {
        setChecking(false)
      }
    })
    return unsub
  }, [])

  const handleCheckUpdate = useCallback(async () => {
    setChecking(true)
    setUpdateStatus({ state: 'idle' })
    await window.api.updater.check()
  }, [])

  const handleInstallUpdate = useCallback(() => {
    window.api.updater.install()
  }, [])

  useEffect(() => {
    loadConfigs()
    window.api.cache.info().then((info) => setCacheInfo(info)).catch(() => {})
  }, [loadConfigs])

  useEffect(() => {
    try {
      localStorage.setItem('desktop_lyrics_style', JSON.stringify(dlStyle))
    } catch { /* ignore */ }
  }, [dlStyle])

  useEffect(() => {
    try {
      localStorage.setItem('scan_settings', JSON.stringify(scanSettings))
    } catch { /* ignore */ }
  }, [scanSettings])

  const handleSave = useCallback(async () => {
    const id = form.id || Date.now().toString()
    const config = { ...form, id, createdAt: form.createdAt || new Date().toISOString() }
    await saveConfig(config)
    setShowForm(false)
    setForm({ id: '', name: '', url: 'https://webdav.123pan.cn/webdav', username: '', password: '', port: 443, enabled: true, createdAt: new Date().toISOString(), sourceType: 'webdav' })
  }, [form, saveConfig])

  const handleTest = useCallback(async () => {
    setTesting(true)
    setTestResult(null)
    const result = await window.api.webdav.test(form)
    setTestResult({ ok: result.ok, message: result.ok ? t('settings.testOk') : (result.error || t('settings.testFailed')) })
    setTesting(false)
  }, [form])

  const handleScan = useCallback(async (config: WebDAVConfig) => {
    await startScan(config, scanSettings)
  }, [startScan, scanSettings])

  const handleClearCache = useCallback(async () => {
    setClearing(true)
    await window.api.cache.clear()
    const store = useMusicStore.getState()
    await store.loadTracks(undefined, true)
    await store.loadCount()
    await usePlaylistStore.getState().loadPlaylists()
    window.api.cache.info().then((info) => setCacheInfo(info)).catch(() => {})
    setClearing(false)
  }, [])

  const handleRemoveCacheFile = useCallback(async (name: string) => {
    await window.api.cache.removeFile(name)
    window.api.cache.info().then((info) => setCacheInfo(info)).catch(() => {})
  }, [])

  const handleBackup = useCallback(async () => {
    setBackupMsg('')
    const result = await window.api.backup.export()
    if (result.ok && result.path) setBackupMsg(t('settings.backupDone', { path: result.path }))
    else setBackupMsg(result.error || t('settings.backupFailed'))
  }, [])

  const handleAddLocal = useCallback(async () => {
    const result = await window.api.chooseFolder()
    if (!result) return
    const config: WebDAVConfig = {
      id: 'local_' + Date.now().toString(),
      name: result.name,
      url: result.path,
      username: '',
      password: '',
      port: 0,
      enabled: true,
      createdAt: new Date().toISOString(),
      sourceType: 'local'
    }
    await saveConfig(config)
  }, [saveConfig])

  const toggleDesktopLyrics = (): void => {
    const next = !desktopLyricsOn
    setDesktopLyricsOn(next)
    localStorage.setItem('desktop_lyrics', next ? '1' : '0')
    window.api.window.lyrics(next)
  }

  const visibleCacheFiles = cacheInfo ? cacheInfo.files.slice(0, 200) : []

  return (
    <div className="page config-page">
      <div className="page-header">
        <h2>{t('nav.settings')}</h2>
      </div>

      {/* 音乐源 */}
      <div className="settings-section">
        <div className="settings-section-header">
          <h3>{t('settings.sources')}</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>{t('settings.addServer')}</button>
            <button className="btn btn-primary" onClick={handleAddLocal}>{t('settings.addLocalFolder')}</button>
          </div>
        </div>
        {scanProgress && scanProgress.status === 'scanning' && (
          <div className="scan-progress-bar">
            <div className="scan-info">
              <span>{t('settings.scanning', { path: scanProgress.currentPath })}</span>
              <span>{t('settings.scannedFiles', { n: scanProgress.scannedCount })}</span>
            </div>
            <div className="progress-track"><div className="progress-fill animate" /></div>
            <button className="btn btn-danger" onClick={cancelScan}>{t('common.cancel')}</button>
          </div>
        )}
        {configs.length === 0 && !showForm ? (
          <div className="empty-state">
            <p>{t('settings.noSources')}</p>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>{t('settings.addFirstServer')}</button>
          </div>
        ) : (
          <div className="config-list">
            {configs.map((config) => (
              <div key={config.id} className="config-item">
                <div className="config-item-info">
                  <strong>{config.sourceType === 'local' ? '📁 ' : '🌐 '}{config.name || config.url}</strong>
                  {config.sourceType === 'local' ? (
                    <span className="config-url">{config.url}</span>
                  ) : (
                    <>
                      <span className="config-url">{formatServerUrl(config)}</span>
                      <span className="config-user">{config.username}</span>
                    </>
                  )}
                </div>
                <div className="config-item-actions">
                  <button className="btn btn-sm" onClick={() => handleScan(config)} disabled={isScanning}>{t('settings.scan')}</button>
                  {config.sourceType !== 'local' && (
                    <button className="btn btn-sm" onClick={() => { setForm(config); setShowForm(true) }}>{t('settings.edit')}</button>
                  )}
                  <button className="btn btn-sm btn-danger" onClick={() => { deleteConfig(config.id); usePlaylistStore.getState().loadPlaylists() }}>{t('common.delete')}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 外观 */}
      <div className="settings-section">
        <h3>{t('settings.appearance')}</h3>
        <div className="settings-row">
          <span className="settings-label">{t('settings.theme')}</span>
          <div className="settings-controls">
            <button className={`btn btn-sm${theme === 'dark' ? ' btn-primary' : ' btn-secondary'}`} onClick={() => setTheme('dark')}>{t('settings.dark')}</button>
            <button className={`btn btn-sm${theme === 'light' ? ' btn-primary' : ' btn-secondary'}`} onClick={() => setTheme('light')}>{t('settings.light')}</button>
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-label">{t('settings.accent')}</span>
          <div className="settings-controls">
            <input
              type="color"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              style={{ width: 40, height: 28, padding: 0, border: '1px solid var(--border)', background: 'none', cursor: 'pointer' }}
            />
            <span className="settings-hint">{t('settings.accentHint')}</span>
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-label">{t('settings.playerSkin')}</span>
          <div className="settings-controls">
            {SKINS.map((s) => (
              <button key={s.key} className={`btn btn-sm${skin === s.key ? ' btn-primary' : ' btn-secondary'}`} onClick={() => setSkin(s.key)}>
                {t(s.labelKey)}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-label">{t('settings.visualizer')}</span>
          <div className="settings-controls">
            <button className={`btn btn-sm${visualizerEnabled ? ' btn-primary' : ' btn-secondary'}`} onClick={() => setVisualizerEnabled(!visualizerEnabled)}>
              {visualizerEnabled ? t('settings.enabled') : t('settings.disabled')}
            </button>
          </div>
        </div>
      </div>

      {/* 快捷键 */}
      <div className="settings-section">
        <div className="settings-section-header">
          <h3>{t('settings.shortcuts')}</h3>
          <button className="btn btn-sm" onClick={resetShortcuts}>{t('settings.resetShortcuts')}</button>
        </div>
        {(Object.keys(SHORTCUT_LABELS) as ShortcutAction[]).map((action) => (
          <div className="settings-row" key={action}>
            <span className="settings-label">{t(SHORTCUT_LABELS[action])}</span>
            <div className="settings-controls">
              <button className={`btn btn-sm${recording === action ? ' btn-primary' : ''}`} onClick={() => setRecording(action)}>
                {recording === action ? t('settings.pressNewKey') : (shortcuts[action] || t('settings.notSet'))}
              </button>
            </div>
          </div>
        ))}
        <p className="settings-hint">{t('settings.shortcutHint')}</p>
      </div>

      {/* 系统 */}
      <div className="settings-section">
        <h3>{t('settings.system')}</h3>
        <div className="settings-row">
          <span className="settings-label">{t('settings.language')}</span>
          <div className="settings-controls">
            <button className={`btn btn-sm${lang === 'zh' ? ' btn-primary' : ' btn-secondary'}`} onClick={() => setLang('zh')}>
              {t('settings.language.zh')}
            </button>
            <button className={`btn btn-sm${lang === 'en' ? ' btn-primary' : ' btn-secondary'}`} onClick={() => setLang('en')}>
              {t('settings.language.en')}
            </button>
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-label">{t('settings.autoLaunch')}</span>
          <div className="settings-controls">
            <button className={`btn btn-sm${autoLaunch ? ' btn-primary' : ' btn-secondary'}`} onClick={() => { const next = !autoLaunch; setAutoLaunch(next); window.api.app.setAutoLaunch(next) }}>
              {autoLaunch ? t('settings.enabled') : t('settings.disabled')}
            </button>
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-label">{t('settings.closeBehavior')}</span>
          <div className="settings-controls">
            <button className={`btn btn-sm${closeBehavior === 'quit' ? ' btn-primary' : ' btn-secondary'}`} onClick={() => { setCloseBehavior('quit'); window.api.app.setCloseBehavior('quit') }}>
              {t('settings.quitApp')}
            </button>
            <button className={`btn btn-sm${closeBehavior === 'tray' ? ' btn-primary' : ' btn-secondary'}`} onClick={() => { setCloseBehavior('tray'); window.api.app.setCloseBehavior('tray') }}>
              {t('settings.minimizeToTray')}
            </button>
          </div>
        </div>
        <p className="settings-hint">{t('settings.closeBehaviorHint')}</p>
      </div>

      {/* 歌词 */}
      <div className="settings-section">
        <h3>{t('settings.lyrics')}</h3>
        <div className="settings-row">
          <span className="settings-label">{t('settings.playerLyricsFontSize')}</span>
          <div className="settings-controls">
            <button className="btn btn-sm" onClick={() => setLyricsFontSize(lyricsFontSize - 2)}>−</button>
            <span className="settings-value">{lyricsFontSize}px</span>
            <button className="btn btn-sm" onClick={() => setLyricsFontSize(lyricsFontSize + 2)}>＋</button>
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-label">{t('settings.playerLyricsAlign')}</span>
          <div className="settings-controls">
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} className={`btn btn-sm${lyricsAlign === a ? ' btn-primary' : ' btn-secondary'}`} onClick={() => setLyricsAlign(a)}>
                {a === 'left' ? t('desktopLyrics.left') : a === 'center' ? t('desktopLyrics.center') : t('desktopLyrics.right')}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-label">{t('player.desktopLyrics')}</span>
          <div className="settings-controls">
            <button className={`btn btn-sm${desktopLyricsOn ? ' btn-primary' : ' btn-secondary'}`} onClick={toggleDesktopLyrics}>
              {desktopLyricsOn ? t('settings.enabled') : t('settings.disabled')}
            </button>
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-label">{t('settings.desktopLyricsFontSize')}</span>
          <div className="settings-controls">
            <button className="btn btn-sm" onClick={() => setDlStyle((s) => ({ ...s, fontSize: Math.max(14, s.fontSize - 2) }))}>−</button>
            <span className="settings-value">{dlStyle.fontSize}px</span>
            <button className="btn btn-sm" onClick={() => setDlStyle((s) => ({ ...s, fontSize: Math.min(48, s.fontSize + 2) }))}>＋</button>
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-label">{t('settings.desktopLyricsColor')}</span>
          <div className="settings-controls">
            {DL_SWATCHES.map((c) => (
              <button key={c} className={`dls-swatch${dlStyle.color === c ? ' active' : ''}`} style={{ background: c }} onClick={() => setDlStyle((s) => ({ ...s, color: c }))} />
            ))}
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-label">{t('settings.desktopLyricsBackdrop')}</span>
          <div className="settings-controls">
            <input
              type="range" min={0} max={60} step={5}
              value={dlStyle.backdrop * 100}
              onChange={(e) => setDlStyle((s) => ({ ...s, backdrop: Number(e.target.value) / 100 }))}
              style={{ width: 160 }}
            />
            <span className="settings-value">{Math.round(dlStyle.backdrop * 100)}%</span>
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-label">{t('settings.desktopLyricsAlign')}</span>
          <div className="settings-controls">
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} className={`btn btn-sm${dlStyle.align === a ? ' btn-primary' : ' btn-secondary'}`} onClick={() => setDlStyle((s) => ({ ...s, align: a }))}>
                {a === 'left' ? t('desktopLyrics.left') : a === 'center' ? t('desktopLyrics.center') : t('desktopLyrics.right')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 数据管理 */}
      <div className="settings-section">
        <h3>{t('settings.data')}</h3>
        <div className="settings-row">
          <span className="settings-label">{t('settings.audioCache')}</span>
          <div className="settings-controls">
            <span className="settings-value">{cacheInfo ? t('settings.cacheSummary', { size: formatBytes(cacheInfo.size), count: cacheInfo.files.length }) : '...'}</span>
            <button className="btn btn-sm" onClick={handleClearCache} disabled={clearing || isScanning}>
              {clearing ? t('settings.clearing') : t('settings.clearCache')}
            </button>
          </div>
        </div>
        {cacheInfo && cacheInfo.files.length > 0 && (
          <div className="cache-list">
            {visibleCacheFiles.map((f) => (
              <div key={f.name} className="cache-item">
                <span className="cache-name">{f.name}</span>
                <span className="cache-size">{formatBytes(f.size)}</span>
                <button className="btn btn-sm" onClick={() => handleRemoveCacheFile(f.name)}>{t('common.delete')}</button>
              </div>
            ))}
            {cacheInfo.files.length > 200 && <div className="settings-hint">{t('settings.cacheMore', { n: cacheInfo.files.length })}</div>}
          </div>
        )}
        <div className="settings-row">
          <span className="settings-label">{t('settings.dbBackup')}</span>
          <div className="settings-controls">
            <button className="btn btn-sm" onClick={handleBackup}>{t('settings.exportBackup')}</button>
            {backupMsg && <span className="settings-hint">{backupMsg}</span>}
          </div>
        </div>
      </div>

      {/* 扫描设置 */}
      <div className="settings-section">
        <h3>{t('settings.scanSettings')}</h3>
        <div className="settings-grid">
          <div className="form-group">
            <label>{t('settings.requestInterval')}</label>
            <input type="number" min={500} max={30000} step={500}
              value={scanSettings.delayMs}
              onChange={(e) => setScanSettings({ ...scanSettings, delayMs: parseInt(e.target.value) || 3000 })} />
          </div>
          <div className="form-group">
            <label>{t('settings.maxRetries')}</label>
            <input type="number" min={0} max={20}
              value={scanSettings.maxRetries}
              onChange={(e) => setScanSettings({ ...scanSettings, maxRetries: parseInt(e.target.value) || 5 })} />
          </div>
          <div className="form-group">
            <label>{t('settings.backoffMultiplier')}</label>
            <input type="number" min={1} max={10} step={0.5}
              value={scanSettings.backoffMultiplier}
              onChange={(e) => setScanSettings({ ...scanSettings, backoffMultiplier: parseFloat(e.target.value) || 2 })} />
          </div>
        </div>
        <p className="settings-hint">{t('settings.backoffHint')}</p>
      </div>

      {/* AI 服务 */}
      <div className="settings-section">
        <div className="settings-section-header">
          <h3>{t('settings.ai')}</h3>
          <button
            className={`btn btn-sm${aiConfig.enabled ? ' btn-primary' : ' btn-secondary'}`}
            onClick={() => setAiConfig({ ...aiConfig, enabled: !aiConfig.enabled })}
          >{aiConfig.enabled ? t('settings.enabled') : t('settings.disabled')}</button>
        </div>
        <div className="settings-row">
          <span className="settings-label">{t('settings.aiProvider')}</span>
          <div className="settings-controls">
            <select
              className="filter-select"
              value={aiConfig.provider}
              onChange={(e) => setAiConfig({ ...aiConfig, provider: e.target.value as 'openai' | 'anthropic' })}
            >
              <option value="openai">{t('settings.aiProviderOpenai')}</option>
              <option value="anthropic">{t('settings.aiProviderAnthropic')}</option>
            </select>
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-label">{t('settings.aiBaseUrl')}</span>
          <div className="settings-controls">
            <input
              type="text"
              className="filter-select"
              style={{ width: 320 }}
              value={aiConfig.baseUrl}
              onChange={(e) => setAiConfig({ ...aiConfig, baseUrl: e.target.value })}
              placeholder={aiConfig.provider === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1'}
            />
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-label">{t('settings.aiModel')}</span>
          <div className="settings-controls">
            <input
              type="text"
              className="filter-select"
              style={{ width: 220 }}
              value={aiConfig.model}
              onChange={(e) => setAiConfig({ ...aiConfig, model: e.target.value })}
              placeholder={aiConfig.provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o-mini'}
            />
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-label">{t('settings.aiApiKey')}</span>
          <div className="settings-controls">
            <input
              type="password"
              className="filter-select"
              style={{ width: 320 }}
              value={aiConfig.apiKey}
              onChange={(e) => setAiConfig({ ...aiConfig, apiKey: e.target.value })}
              placeholder="sk-..."
            />
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-label">{t('settings.aiActions')}</span>
          <div className="settings-controls">
            <button className="btn btn-sm btn-secondary" onClick={saveAi}>{aiSaved ? t('settings.saved') : t('common.save')}</button>
            <button className="btn btn-sm btn-secondary" onClick={testAi} disabled={aiTestState === 'testing'}>
              {aiTestState === 'testing' ? t('common.loading') : t('settings.aiTest')}
            </button>
            {aiTestState === 'ok' && <span className="settings-value" style={{ color: 'var(--accent)' }}>{t('settings.testOk')}</span>}
            {aiTestState === 'fail' && <span className="settings-value" style={{ color: '#e94560' }}>{t('settings.testFailed')}{aiTestMsg ? `：${aiTestMsg}` : ''}</span>}
          </div>
        </div>
        <p className="settings-hint">{t('settings.aiHint')}</p>
      </div>

      {/* 关于与更新 */}
      <div className="settings-section">
        <h3>{t('settings.about')}</h3>
        <div className="settings-row">
          <span className="settings-label">{t('settings.appName')}</span>
          <div className="settings-controls">
            <span className="settings-value">{appInfo?.name || t('app.name')}</span>
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-label">{t('settings.version')}</span>
          <div className="settings-controls">
            <span className="settings-value">{appInfo ? `v${appInfo.version}` : '...'}</span>
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-label">{t('settings.commit')}</span>
          <div className="settings-controls">
            <span className="settings-value" style={{ fontFamily: 'monospace' }}>{appInfo?.commit || '...'}</span>
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-label">{t('settings.runtime')}</span>
          <div className="settings-controls">
            <span className="settings-hint">
              {appInfo ? `Electron ${appInfo.electron} · Chromium ${appInfo.chrome} · Node ${appInfo.node}` : '...'}
            </span>
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-label">{t('settings.autoUpdate')}</span>
          <div className="settings-controls">
            <button className="btn btn-sm" onClick={handleCheckUpdate} disabled={checking || updateStatus.state === 'downloading' || updateStatus.state === 'downloaded'}>
              {checking || updateStatus.state === 'checking' ? t('update.checkingBtn') : t('update.check')}
            </button>
            {updateStatus.state === 'downloaded' && (
              <button className="btn btn-sm btn-primary" onClick={handleInstallUpdate}>{t('update.installNow')}</button>
            )}
            <span className="settings-hint">{renderUpdateStatus(updateStatus, t)}</span>
          </div>
        </div>
      </div>

      {showForm && (
        <Modal onClose={() => setShowForm(false)}>
          <h3>{t('settings.editServer')}</h3>
          <div className="form-group">
            <label>{t('settings.name')}</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('settings.serverNamePlaceholder')} />
          </div>
          <div className="form-group">
            <label>{t('settings.address')}</label>
            <input type="text" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="http://localhost" />
          </div>
          <div className="form-group">
            <label>{t('settings.port')}</label>
            <input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 80 })} />
          </div>
          <div className="form-group">
            <label>{t('settings.username')}</label>
            <input type="text" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </div>
          <div className="form-group">
            <label>{t('settings.password')}</label>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          {testResult && <div className={`test-result ${testResult.ok ? 'success' : 'error'}`}>{testResult.message}</div>}
          <div className="modal-actions">
            <button className="btn" onClick={handleTest} disabled={testing}>{testing ? t('settings.testing') : t('settings.testConnection')}</button>
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>{t('common.cancel')}</button>
            <button className="btn btn-primary" onClick={handleSave}>{t('common.save')}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
