import { useEffect, useRef } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { newCorrelationId } from '../lib/correlationId'
import { logTechnicalEvent } from '../services/loggingApi'

/**
 * רישום שגיאות דפדפן ל־technical_log — **רק לצוות** (אדמין / שותף / סורק).
 */
export function ClientTechnicalLogBridge() {
  const { isStaff } = useAuth()
  const mounted = useRef(true)
  useEffect(() => {
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!isStaff) return

    const onError = (ev: ErrorEvent) => {
      if (!mounted.current) return
      const msg = ev.message || 'window.error'
      const cid = newCorrelationId()
      logTechnicalEvent({
        level: 'error',
        source: 'frontend',
        operation: 'window.onerror',
        message: msg.slice(0, 2000),
        context: { filename: ev.filename, lineno: ev.lineno, colno: ev.colno },
        correlationId: cid,
      })
    }

    const onRej = (ev: PromiseRejectionEvent) => {
      if (!mounted.current) return
      const reason = ev.reason
      const str =
        reason instanceof Error
          ? reason.message + (reason.stack ? `\n${String(reason.stack).slice(0, 500)}` : '')
          : String(reason)
      const cid = newCorrelationId()
      logTechnicalEvent({
        level: 'error',
        source: 'frontend',
        operation: 'unhandledrejection',
        message: str.slice(0, 2000),
        correlationId: cid,
      })
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRej)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRej)
    }
  }, [isStaff])

  return null
}
