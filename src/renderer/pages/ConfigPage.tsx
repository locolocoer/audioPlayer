import { useState, useEffect, useCallback } from 'react'
import { useMusicStore } from '../stores/musicStore'
import { usePlaylistStore } from '../stores/playlistStore'
import { useThemeStore } from '../stores/themeStore'
import { useLyricsStyleStore } from '../stores/lyricsStyleStore'
import type { WebDAVConfig, ScanSettings } from '../../main/types'
import { DEFAULT_SCAN_SETTINGS } from '../../main/types'

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

export default function ConfigPage(): JSX.Element {
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
    setTestResult({ ok: result.ok, message: result.ok ? '连接成功' : (result.error || '连接失败') })
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
    if (result.ok && result.path) setBackupMsg(`已导出到 ${result.path}`)
    else setBackupMsg(result.error || '导出失败')
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
        <h2>设置</h2>
      </div>

      {/* 音乐源 */}
      <div className="settings-section">
        <div className="settings-section-header">
          <h3>音乐源</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>添加服务器</button>
            <button className="btn btn-primary" onClick={handleAddLocal}>添加本地文件夹</button>
          </div>
        </div>
        {scanProgress && scanProgress.status === 'scanning' && (
          <div className="scan-progress-bar">
            <div className="scan-info">
              <span>正在扫描: {scanProgress.currentPath}</span>
              <span>已发现 {scanProgress.scannedCount} 个文件</span>
            </div>
            <div className="progress-track"><div className="progress-fill animate" /></div>
            <button className="btn btn-danger" onClick={cancelScan}>取消</button>
          </div>
        )}
        {configs.length === 0 && !showForm ? (
          <div className="empty-state">
            <p>未配置音乐源。</p>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>添加第一个服务器</button>
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
                      <span className="config-url">{config.url}:{config.port}</span>
                      <span className="config-user">{config.username}</span>
                    </>
                  )}
                </div>
                <div className="config-item-actions">
                  <button className="btn btn-sm" onClick={() => handleScan(config)} disabled={isScanning}>扫描</button>
                  {config.sourceType !== 'local' && (
                    <button className="btn btn-sm" onClick={() => { setForm(config); setShowForm(true) }}>编辑</button>
                  )}
                  <button className="btn btn-sm btn-danger" onClick={() => { deleteConfig(config.id); usePlaylistStore.getState().loadPlaylists() }}>删除</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 外观 */}
      <div className="settings-section">
        <h3>外观</h3>
        <div className="settings-row">
          <span className="settings-label">主题</span>
          <div className="settings-controls">
            <button className={`btn btn-sm${theme === 'dark' ? ' btn-primary' : ' btn-secondary'}`} onClick={() => setTheme('dark')}>深色</button>
            <button className={`btn btn-sm${theme === 'light' ? ' btn-primary' : ' btn-secondary'}`} onClick={() => setTheme('light')}>浅色</button>
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-label">强调色</span>
          <div className="settings-controls">
            <input
              type="color"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              style={{ width: 40, height: 28, padding: 0, border: '1px solid var(--border)', background: 'none', cursor: 'pointer' }}
            />
            <span className="settings-hint">全局按钮/高亮主色调</span>
          </div>
        </div>
      </div>

      {/* 歌词 */}
      <div className="settings-section">
        <h3>歌词</h3>
        <div className="settings-row">
          <span className="settings-label">播放页字号</span>
          <div className="settings-controls">
            <button className="btn btn-sm" onClick={() => setLyricsFontSize(lyricsFontSize - 2)}>−</button>
            <span className="settings-value">{lyricsFontSize}px</span>
            <button className="btn btn-sm" onClick={() => setLyricsFontSize(lyricsFontSize + 2)}>＋</button>
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-label">播放页对齐</span>
          <div className="settings-controls">
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} className={`btn btn-sm${lyricsAlign === a ? ' btn-primary' : ' btn-secondary'}`} onClick={() => setLyricsAlign(a)}>
                {a === 'left' ? '左' : a === 'center' ? '中' : '右'}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-label">桌面歌词</span>
          <div className="settings-controls">
            <button className={`btn btn-sm${desktopLyricsOn ? ' btn-primary' : ' btn-secondary'}`} onClick={toggleDesktopLyrics}>
              {desktopLyricsOn ? '已开启' : '已关闭'}
            </button>
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-label">桌面歌词字号</span>
          <div className="settings-controls">
            <button className="btn btn-sm" onClick={() => setDlStyle((s) => ({ ...s, fontSize: Math.max(14, s.fontSize - 2) }))}>−</button>
            <span className="settings-value">{dlStyle.fontSize}px</span>
            <button className="btn btn-sm" onClick={() => setDlStyle((s) => ({ ...s, fontSize: Math.min(48, s.fontSize + 2) }))}>＋</button>
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-label">桌面歌词颜色</span>
          <div className="settings-controls">
            {DL_SWATCHES.map((c) => (
              <button key={c} className={`dls-swatch${dlStyle.color === c ? ' active' : ''}`} style={{ background: c }} onClick={() => setDlStyle((s) => ({ ...s, color: c }))} />
            ))}
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-label">桌面歌词背景</span>
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
          <span className="settings-label">桌面歌词对齐</span>
          <div className="settings-controls">
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} className={`btn btn-sm${dlStyle.align === a ? ' btn-primary' : ' btn-secondary'}`} onClick={() => setDlStyle((s) => ({ ...s, align: a }))}>
                {a === 'left' ? '左' : a === 'center' ? '中' : '右'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 数据管理 */}
      <div className="settings-section">
        <h3>数据管理</h3>
        <div className="settings-row">
          <span className="settings-label">音频缓存</span>
          <div className="settings-controls">
            <span className="settings-value">{cacheInfo ? `${formatBytes(cacheInfo.size)}（${cacheInfo.files.length} 个文件）` : '...'}</span>
            <button className="btn btn-sm" onClick={handleClearCache} disabled={clearing || isScanning}>
              {clearing ? '清理中...' : '清空缓存'}
            </button>
          </div>
        </div>
        {cacheInfo && cacheInfo.files.length > 0 && (
          <div className="cache-list">
            {visibleCacheFiles.map((f) => (
              <div key={f.name} className="cache-item">
                <span className="cache-name">{f.name}</span>
                <span className="cache-size">{formatBytes(f.size)}</span>
                <button className="btn btn-sm" onClick={() => handleRemoveCacheFile(f.name)}>删除</button>
              </div>
            ))}
            {cacheInfo.files.length > 200 && <div className="settings-hint">… 共 {cacheInfo.files.length} 个缓存文件，仅显示前 200 个</div>}
          </div>
        )}
        <div className="settings-row">
          <span className="settings-label">数据库备份</span>
          <div className="settings-controls">
            <button className="btn btn-sm" onClick={handleBackup}>导出备份</button>
            {backupMsg && <span className="settings-hint">{backupMsg}</span>}
          </div>
        </div>
      </div>

      {/* 扫描设置 */}
      <div className="settings-section">
        <h3>扫描设置</h3>
        <div className="settings-grid">
          <div className="form-group">
            <label>请求间隔 (毫秒)</label>
            <input type="number" min={500} max={30000} step={500}
              value={scanSettings.delayMs}
              onChange={(e) => setScanSettings({ ...scanSettings, delayMs: parseInt(e.target.value) || 3000 })} />
          </div>
          <div className="form-group">
            <label>最大重试次数</label>
            <input type="number" min={0} max={20}
              value={scanSettings.maxRetries}
              onChange={(e) => setScanSettings({ ...scanSettings, maxRetries: parseInt(e.target.value) || 5 })} />
          </div>
          <div className="form-group">
            <label>退避倍数 (指数)</label>
            <input type="number" min={1} max={10} step={0.5}
              value={scanSettings.backoffMultiplier}
              onChange={(e) => setScanSettings({ ...scanSettings, backoffMultiplier: parseFloat(e.target.value) || 2 })} />
          </div>
        </div>
        <p className="settings-hint">退避公式: 延迟 × 倍数<sup>重试次数</sup> (例: 3000×2⁰=3秒, 3000×2¹=6秒, 3000×2²=12秒...)</p>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>编辑服务器</h3>
            <div className="form-group">
              <label>名称</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="我的服务器" />
            </div>
            <div className="form-group">
              <label>地址</label>
              <input type="text" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="http://localhost" />
            </div>
            <div className="form-group">
              <label>端口</label>
              <input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 80 })} />
            </div>
            <div className="form-group">
              <label>用户名</label>
              <input type="text" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </div>
            <div className="form-group">
              <label>密码</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            {testResult && <div className={`test-result ${testResult.ok ? 'success' : 'error'}`}>{testResult.message}</div>}
            <div className="modal-actions">
              <button className="btn" onClick={handleTest} disabled={testing}>{testing ? '测试中...' : '测试连接'}</button>
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleSave}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
