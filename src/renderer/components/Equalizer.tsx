import { useEqualizerStore, EQ_BANDS, EQ_PRESETS } from '../stores/equalizerStore'

export default function Equalizer(): JSX.Element {
  const enabled = useEqualizerStore((s) => s.enabled)
  const gains = useEqualizerStore((s) => s.gains)
  const presetName = useEqualizerStore((s) => s.presetName)
  const toggleEnabled = useEqualizerStore((s) => s.toggleEnabled)
  const setGain = useEqualizerStore((s) => s.setGain)
  const applyPreset = useEqualizerStore((s) => s.applyPreset)
  const reset = useEqualizerStore((s) => s.reset)

  return (
    <div className="equalizer-panel">
      <div className="eq-header">
        <span className="eq-title">Equalizer</span>
        <div className="eq-header-actions">
          <select
            className="eq-preset-select"
            value={presetName}
            onChange={(e) => {
              const preset = EQ_PRESETS.find((p) => p.name === e.target.value)
              if (preset) applyPreset(preset)
            }}
          >
            {EQ_PRESETS.map((p) => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
          <button className="btn btn-sm" onClick={toggleEnabled}>
            {enabled ? 'ON' : 'OFF'}
          </button>
          <button className="btn btn-sm btn-secondary" onClick={reset}>Reset</button>
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
