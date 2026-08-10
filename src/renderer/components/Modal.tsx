import { useEffect } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  onClose: () => void
  width?: number
  children: React.ReactNode
}

export default function Modal({ onClose, width, children }: ModalProps): React.ReactPortal {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="modal-overlay">
      <div className="modal" style={width ? { width } : undefined}>
        {children}
      </div>
    </div>,
    document.body
  )
}
