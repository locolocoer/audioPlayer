import { useToastStore } from '../stores/toastStore'

export default function Toaster(): JSX.Element | null {
  const toasts = useToastStore((s) => s.toasts)
  if (toasts.length === 0) return null
  return (
    <div className="toaster">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {t.message}
        </div>
      ))}
    </div>
  )
}
