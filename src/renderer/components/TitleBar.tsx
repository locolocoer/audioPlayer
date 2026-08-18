import { useEffect, useState } from 'react'

export default function TitleBar(): JSX.Element {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    window.api.window.isMaximized().then(setMaximized).catch(() => {})
    const unsub = window.api.window.onMaximizedChange(setMaximized)
    return unsub
  }, [])

  return (
    <div className="drag-strip">
      <div className="win-controls">
        <button className="win-btn" title="最小化" onClick={() => window.api.window.minimize()}>
          <svg viewBox="0 0 12 12" width="12" height="12"><path d="M1.5 6h9" stroke="currentColor" strokeWidth="1" fill="none" /></svg>
        </button>
        <button className="win-btn" title={maximized ? '还原' : '最大化'} onClick={() => window.api.window.toggleMaximize()}>
          {maximized ? (
            <svg viewBox="0 0 12 12" width="12" height="12"><rect x="1.5" y="3.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" /><path d="M3.5 3.5V1.5h7v7H8.5" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
          ) : (
            <svg viewBox="0 0 12 12" width="12" height="12"><rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
          )}
        </button>
        <button className="win-btn win-close" title="关闭" onClick={() => window.api.window.close()}>
          <svg viewBox="0 0 12 12" width="12" height="12"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.1" /></svg>
        </button>
      </div>
    </div>
  )
}
