import { useState, useEffect, useCallback } from 'react'
import { useMusicStore } from '../stores/musicStore'
import type { WebDAVConfig, ScanSettings } from '../../main/types'
import { DEFAULT_SCAN_SETTINGS } from '../../main/types'

function useSetting(key: string, defaultValue: boolean): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(() => {
    const saved = localStorage.getItem(key)
    return saved !== null ? saved === '1' : defaultValue
  })
  const update = useCallback((v: boolean) => {
    setValue(v)
    localStorage.setItem(key, v ? '1' : '0')
  }, [key])
  return [value, update]
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
  const [dedup, setDedup] = useSetting('dedup', false)
  const [showForm, setShowForm] = useState(false)
  const [testing, setTesting] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [scanSettings, setScanSettings] = useState<ScanSettings>(DEFAULT_SCAN_SETTINGS)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [form, setForm] = useState<WebDAVConfig>({
    id: '',
    name: '',
    url: 'https://webdav.123pan.cn/webdav',
    username: '',
    password: '',
    port: 443,
    enabled: true,
    createdAt: new Date().toISOString()
  })

  useEffect(() => {
    loadConfigs()
  }, [loadConfigs])

  const handleSave = useCallback(async () => {
    const id = form.id || Date.now().toString()
    const config = { ...form, id, createdAt: form.createdAt || new Date().toISOString() }
    await saveConfig(config)
    setShowForm(false)
    setForm({ id: '', name: '', url: 'https://webdav.123pan.cn/webdav', username: '', password: '', port: 443, enabled: true, createdAt: new Date().toISOString() })
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
    setClearing(false)
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

  const formatTime = (secs: number): string => {
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="page config-page">
      <div className="page-header">
        <h2>设置</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={handleClearCache} disabled={clearing || isScanning}>
            {clearing ? '清理中...' : '清除缓存'}
          </button>
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
          <div className="progress-track">
            <div className="progress-fill animate" />
          </div>
          <button className="btn btn-danger" onClick={cancelScan}>取消</button>
        </div>
      )}

      <div className="scan-settings">
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

      <div className="scan-settings">
        <h3>显示设置</h3>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontSize: 14 }}>繁简去重</span>
            <p className="settings-hint" style={{ marginTop: 4 }}>开启后，音乐库中繁简同名的歌曲只保留简体版本</p>
          </div>
          <button
            className={`btn ${dedup ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setDedup(!dedup)}
          >
            {dedup ? '已开启' : '已关闭'}
          </button>
        </div>
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

      {configs.length === 0 && !showForm && (
        <div className="empty-state">
          <p>未配置音乐源。</p>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>添加第一个服务器</button>
        </div>
      )}

      <div className="config-list">
        {configs.map((config) => (
          <div key={config.id} className="config-item">
            <div className="config-item-info">
              <strong>
                {config.sourceType === 'local' ? '📁 ' : '🌐 '}
                {config.name || (config.sourceType === 'local' ? config.url : config.url)}
              </strong>
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
              <button className="btn btn-sm btn-danger" onClick={() => deleteConfig(config.id)}>删除</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
