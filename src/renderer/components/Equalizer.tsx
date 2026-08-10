import { useState } from 'react'
import { useEqualizerStore, EQ_BANDS, EQ_PRESETS } from '../stores/equalizerStore'

export default function Equalizer(): JSX.Element {
  const enabled = useEqualizerStore((s) => s.enabled)
  const gains = useEqualizerStore((s) => s.gains)
  const presetName = useEqualizerStore((s) => s.presetName)
  const customPresets = useEqualizerStore((s) => s.customPresets)
  const toggleEnabled = useEqualizerStore((s) => s.toggleEnabled)
  const setGain = useEqualizerStore((s) => s.setGain)
  const applyPreset = useEqualizerStore((s) => s.applyPreset)
  const savePreset = useEqualizerStore((s) => s.savePreset)
  const deletePreset = useEqualizerStore((s) => s.deletePreset)
  const reset = useEqualizerStore((s) => s.reset)
  const [saving, setSaving] = useState(false)
  const [presetInput, setPresetInput] = useState('')

  const isCustomPreset = customPresets.some((p) => p.name === presetName)

  const allPresets = [...EQ_PRESETS, ...customPresets]

  const commitSave = (): void => {
    if (presetInput.trim()) {
      savePreset(presetInput)
    }
    setPresetInput('')
    setSaving(false)
  }

  return (
    <div className="equalizer-panel">
      <div className="eq-header">
        <span className="eq-title">Equalizer</span>
        <div className="eq-header-actions">
          {saving ? (
            <>
              <input
                type="text"
                className="eq-preset-input"
                value={presetInput}
                onChange={(e) => setPresetInput(e.target.value)}
                placeholder="预设名称"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') commitSave() }}
              />
              <button className="btn btn-sm" onClick={commitSave}>保存</button>
              <button className="btn btn-sm btn-secondary" onClick={() => { setPresetInput(''); setSaving(false) }}>取消</button>
            </>
          ) : (
            <>
              <select
                className="eq-preset-select"
                value={presetName}
                onChange={(e) => {
                  const preset = allPresets.find((p) => p.name === e.target.value)
                  if (preset) applyPreset(preset)
                }}
              >
                {EQ_PRESETS.map((p) => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
                {customPresets.map((p) => (
                  <option key={p.name} value={p.name}>{p.name} *</option>
                ))}
              </select>
              {isCustomPreset && (
                <button className="btn btn-sm btn-secondary" title="删除该自定义预设" onClick={() => deletePreset(presetName)}>删除</button>
              )}
              <button className="btn btn-sm" title="将当前设置保存为自定义预设" onClick={() => setSaving(true)}>保存</button>
              <button className="btn btn-sm" onClick={toggleEnabled}>
                {enabled ? 'ON' : 'OFF'}
              </button>
              <button className="btn btn-sm btn-secondary" onClick={reset}>Reset</button>
            </>
          )}
        </div>
      </div>
      <div className="eq-bands">
        {EQ_BANDS.map((freq, idx) => {
          const label = freq >= 1000 ? `${freq / 1000}k` : String(freq)
          return (
            <div key={freq} className="eq-band">
              <input
                type="range"
                className="eq-slider"
                min={-12}
                max={12}
                step={0.5}
                value={gains[idx] ?? 0}
                onChange={(e) => setGain(idx, parseFloat(e.target.value))}
                disabled={!enabled}
              />
              <span className="eq-gain">{(gains[idx] ?? 0) > 0 ? '+' : ''}{Number(gains[idx] ?? 0).toFixed(0)}</span>
              <span className="eq-label">{label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
