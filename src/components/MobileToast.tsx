import { useEffect } from 'react'

export type MobileToastState = {
  kind: 'ok' | 'err' | 'info'
  message: string
  id: number
  /** top (ברירת מחדל) — מתחת ל־safe area; center — אמצע המסך */
  placement?: 'top' | 'center'
  durationMs?: number
} | null

type Props = {
  toast: MobileToastState
  onDismiss: () => void
  durationMs?: number
}

export function MobileToast({ toast, onDismiss, durationMs: defaultDurationMs = 2400 }: Props) {
  const waitMs = toast?.durationMs ?? defaultDurationMs

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => onDismiss(), waitMs)
    return () => clearTimeout(t)
  }, [toast, onDismiss, waitMs])

  if (!toast) return null
  return (
    <div
      className={`mobile-toast mobile-toast--${toast.kind}${
        toast.placement === 'center' ? ' mobile-toast--center' : ''
      }`}
      role="status"
      aria-live="polite"
    >
      {toast.message}
    </div>
  )
}
