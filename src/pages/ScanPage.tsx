import { useQueryClient } from '@tanstack/react-query'
import { invalidatePartyEventStatsQueries, partyQueryKeys } from '../lib/partyEventQueries'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import type { ScanResponse } from '../types/guest'
import { useEvent } from '../context/EventContext'
import { addPayAtDoorGuest, scanCode } from '../services/api'
import { logTechnicalEvent, logUserActivity } from '../services/loggingApi'
import { hapticError, hapticSuccess } from '../utils/haptics'

/** זמן הצגת שם / הודעה לפני הפעלת מצלמה מחדש */
const FEEDBACK_THEN_RESUME_MS = 2000
/** אותו QR פעמיים ברצף — התעלמות (מניעת סריקה כפולה) */
const DUPLICATE_SCAN_COOLDOWN_MS = 1500

function normalizeQrPayload(raw: string): string {
  let cleaned = raw.trim()
  if (!cleaned) return ''
  if (cleaned.includes('/ticket/')) {
    cleaned = cleaned.split('/ticket/')[1] ?? cleaned
    cleaned = cleaned.split('?')[0] ?? cleaned
    cleaned = cleaned.split('#')[0] ?? cleaned
    cleaned = cleaned.trim()
  } else if (cleaned.includes('/guest/')) {
    cleaned = cleaned.split('/guest/')[1] ?? cleaned
    cleaned = cleaned.split('?')[0] ?? cleaned
    cleaned = cleaned.split('#')[0] ?? cleaned
    cleaned = cleaned.trim()
  }
  return cleaned
}

export function ScanPage({ embedded = false }: { embedded?: boolean }) {
  const queryClient = useQueryClient()
  const { currentEventId, currentEvent, loading: eventLoading } = useEvent()
  const [result, setResult] = useState<ScanResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  /** true רק אחרי שהמשתמש לחץ «עצור» — כדי להציג «המשך סריקה» בלי הבזק בטעינה ראשונה */
  const [userStoppedCamera, setUserStoppedCamera] = useState(false)
  /** כשל בהפעלת מצלמה (הרשאות וכו') — לכפתור «נסה שוב» */
  const [cameraInitFailed, setCameraInitFailed] = useState(false)
  /** תשלום בכניסה — בחלון +1; עוצר מצלמה בזמן הדו-שיח */
  const [payAtDoorOpen, setPayAtDoorOpen] = useState(false)
  /** מחיר לכרטיס — חובה */
  const [payAtDoorAmount, setPayAtDoorAmount] = useState('')
  /** כמות — ברירת 1, עד 100 */
  const [payAtDoorQuantity, setPayAtDoorQuantity] = useState('1')
  const [payAtDoorLoading, setPayAtDoorLoading] = useState(false)
  const [walkInFeedback, setWalkInFeedback] = useState<string | null>(null)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  /** מונע כפילות וידאו כששני startCamera רצים במקביל (Strict Mode / effect + resume) */
  const cameraGenerationRef = useRef(0)
  const busyRef = useRef(false)
  const startCameraRef = useRef<() => Promise<void>>(async () => {})
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastScanDedupRef = useRef<{ code: string; at: number } | null>(null)
  /** דור סריקה — תשובת רשת מאוחרת לא דורסת תוצאה אם כבר התחילה סריקה חדשה */
  const scanGenerationRef = useRef(0)

  function clearResumeTimer() {
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current)
      resumeTimerRef.current = null
    }
  }

  const scheduleFeedbackAndResume = useCallback(() => {
    clearResumeTimer()
    resumeTimerRef.current = setTimeout(() => {
      resumeTimerRef.current = null
      setResult(null)
      setError(null)
      setWalkInFeedback(null)
      busyRef.current = false
      void startCameraRef.current()
    }, FEEDBACK_THEN_RESUME_MS)
  }, [])

  const handleScan = useCallback(
    async (raw: string) => {
      if (busyRef.current) return
      if (!currentEventId) {
        setError('בחרו מסיבה כדי לסרוק כרטיסים לאירוע הזה')
        scheduleFeedbackAndResume()
        return
      }
      busyRef.current = true
      setError(null)
      setWalkInFeedback(null)
      const gen = ++scanGenerationRef.current
      try {
        const res = await scanCode(raw.trim(), currentEventId)
        if (gen !== scanGenerationRef.current) return
        setResult(res)
        const norm = normalizeQrPayload(raw)
        logUserActivity({
          kind: 'scan',
          action: 'client_result',
          eventId: currentEventId,
          detail: {
            raw_trimmed: raw.trim().slice(0, 2500),
            normalized_code: norm,
            response: res,
          },
        })
        if (res.result === 'ok') {
          void queryClient.invalidateQueries({ queryKey: partyQueryKeys.partyShell(currentEventId) })
          invalidatePartyEventStatsQueries(queryClient, currentEventId)
        }
        if (
          res.result === 'ok' ||
          res.result === 'already_entered' ||
          res.result === 'already_checked_in'
        ) {
          hapticSuccess()
        } else {
          hapticError()
        }
      } catch (e) {
        if (gen !== scanGenerationRef.current) return
        hapticError()
        const msg = e instanceof Error ? e.message : 'שגיאת רשת'
        setError(msg)
        logTechnicalEvent({
          level: 'error',
          source: 'frontend',
          operation: 'scanCode',
          message: msg,
          eventId: currentEventId,
          context: { stage: 'process_guest_scan' },
        })
      } finally {
        scheduleFeedbackAndResume()
      }
    },
    [queryClient, scheduleFeedbackAndResume, currentEventId],
  )

  const teardownScanner = useCallback(async () => {
    clearResumeTimer()
    const h = scannerRef.current
    scannerRef.current = null
    if (h) {
      try {
        await h.stop()
        await h.clear()
      } catch {
        /* ignore */
      }
    }
    const el = document.getElementById('scan-reader')
    if (el) el.innerHTML = ''
  }, [])

  const stopCamera = useCallback(
    async (opts?: { markUserStopped?: boolean }) => {
      cameraGenerationRef.current += 1
      await teardownScanner()
      setCameraOn(false)
      if (opts?.markUserStopped) setUserStoppedCamera(true)
    },
    [teardownScanner],
  )

  const startCamera = useCallback(async () => {
    const gen = ++cameraGenerationRef.current
    clearResumeTimer()
    busyRef.current = false
    setUserStoppedCamera(false)
    setCameraInitFailed(false)
    setResult(null)
    setError(null)
    setWalkInFeedback(null)
    await teardownScanner()
    if (gen !== cameraGenerationRef.current) return

    const el = document.getElementById('scan-reader')
    if (el) el.innerHTML = ''

    try {
      setCameraOn(true)
      await new Promise((r) => requestAnimationFrame(r))
      if (gen !== cameraGenerationRef.current) return

      const h = new Html5Qrcode('scan-reader')
      scannerRef.current = h
      await h.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 260, height: 260 },
          aspectRatio: 1.7777778,
        },
        (decoded) => {
          const normalized = normalizeQrPayload(decoded)
          if (!normalized) return
          const now = Date.now()
          const prev = lastScanDedupRef.current
          if (prev && prev.code === normalized && now - prev.at < DUPLICATE_SCAN_COOLDOWN_MS) {
            return
          }
          lastScanDedupRef.current = { code: normalized, at: now }
          void h.stop().then(() => {
            setCameraOn(false)
            void handleScan(decoded)
          })
        },
        () => {},
      )
      if (gen !== cameraGenerationRef.current) {
        await teardownScanner()
        setCameraOn(false)
      }
    } catch (e) {
      setCameraOn(false)
      setCameraInitFailed(true)
      setError(e instanceof Error ? e.message : 'לא ניתן להפעיל מצלמה')
    }
  }, [handleScan, teardownScanner])

  useEffect(() => {
    startCameraRef.current = startCamera
  }, [startCamera])

  const openPayAtDoorModal = useCallback(() => {
    if (!currentEventId || eventLoading) return
    const def = currentEvent?.default_ticket_price
    setPayAtDoorAmount(
      def != null && def > 0 && Number.isFinite(def) ? String(def) : '',
    )
    setPayAtDoorQuantity('1')
    setError(null)
    setPayAtDoorOpen(true)
    setUserStoppedCamera(false)
    void stopCamera()
  }, [currentEventId, currentEvent, eventLoading, stopCamera])

  const closePayAtDoorModal = useCallback(
    (opts?: { resumeCamera?: boolean }) => {
      setPayAtDoorOpen(false)
      setPayAtDoorLoading(false)
      if (opts?.resumeCamera !== false) {
        void startCamera()
      }
    },
    [startCamera],
  )

  const submitPayAtDoor = useCallback(async () => {
    if (!currentEventId || payAtDoorLoading) return
    const rawAmount = payAtDoorAmount.trim().replace(',', '.')
    const amount = rawAmount === '' ? NaN : Number(rawAmount)
    if (!Number.isFinite(amount) || amount < 0.01) {
      setError('נא להזין סכום (חובה) — מינימום 0.01 ‏₪ לכל כרטיס')
      return
    }
    const qRaw = payAtDoorQuantity.trim()
    const qty = qRaw === '' ? 1 : Math.max(1, Math.min(100, Math.floor(Number(qRaw.replace(',', '.')))))
    if (!Number.isFinite(qty) || qty < 1) {
      setError('נא לציין כמות (מספר בין 1 ל־100)')
      return
    }
    setPayAtDoorLoading(true)
    setError(null)
    try {
      const added = await addPayAtDoorGuest(currentEventId, {
        amount,
        quantity: qty,
      })
      void queryClient.invalidateQueries({ queryKey: ['event', currentEventId] })
      invalidatePartyEventStatsQueries(queryClient, currentEventId)
      hapticSuccess()
      setPayAtDoorOpen(false)
      setPayAtDoorAmount('')
      setPayAtDoorQuantity('1')
      setWalkInFeedback(added.map((g) => g.name).join(' · '))
      setResult(null)
      setPayAtDoorLoading(false)
      logUserActivity({
        kind: 'pay_at_door',
        action: 'submit_ok',
        eventId: currentEventId,
        detail: {
          amount,
          quantity: qty,
          guest_ids: added.map((g) => g.id),
          names: added.map((g) => g.name),
        },
      })
      scheduleFeedbackAndResume()
    } catch (e) {
      hapticError()
      setPayAtDoorLoading(false)
      const em = e instanceof Error ? e.message : 'שגיאה'
      setError(em)
      logUserActivity({
        kind: 'pay_at_door',
        action: 'submit_error',
        eventId: currentEventId,
        detail: { error: em, amount: payAtDoorAmount, quantity: payAtDoorQuantity },
      })
    }
  }, [
    currentEventId,
    payAtDoorLoading,
    payAtDoorAmount,
    payAtDoorQuantity,
    queryClient,
    scheduleFeedbackAndResume,
  ])

  /** Auto Scan: הפעלת מצלמה כשנכנסים לדף / כשיש אירוע — בלי כפתור «הפעל מצלמה» */
  useEffect(() => {
    if (eventLoading || !currentEventId) {
      void stopCamera()
      return
    }
    void startCamera()
    return () => {
      void stopCamera()
    }
  }, [currentEventId, eventLoading, startCamera, stopCamera])

  const scanBody = (
    <>
      {error && <div className="banner error">{error}</div>}

      <div className="scan-panel">
        <div className="scan-toolbar">
          {cameraOn && currentEventId ? (
            <button type="button" className="btn small secondary" onClick={() => void stopCamera({ markUserStopped: true })}>
              עצור
            </button>
          ) : null}
          {!cameraOn && currentEventId && !eventLoading && userStoppedCamera ? (
            <button type="button" className="btn small secondary" onClick={() => void startCamera()}>
              המשך סריקה
            </button>
          ) : null}
          {!cameraOn && currentEventId && !eventLoading && cameraInitFailed ? (
            <button type="button" className="btn small" onClick={() => void startCamera()}>
              נסה שוב
            </button>
          ) : null}
        </div>

        <div id="scan-reader" className={cameraOn ? 'scan-reader active' : 'scan-reader'} />

        {currentEventId && !eventLoading ? (
          <div className="scan-toolbar scan-toolbar--after" aria-label="תשלום בכניסה">
            <button
              type="button"
              className="btn small scan-walkin-open"
              disabled={payAtDoorOpen}
              onClick={() => openPayAtDoorModal()}
            >
              +1
            </button>
          </div>
        ) : null}
      </div>

      <ScanResultBanner result={result} walkInName={walkInFeedback} />
      {payAtDoorOpen && currentEventId ? (
        <div className="modal-backdrop" role="presentation" onClick={() => closePayAtDoorModal()}>
          <div
            className="modal scan-walkin-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="scan-walkin-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <h2 id="scan-walkin-title">תשלום בכניסה</h2>
            <p>
              {(() => {
                const q = Math.max(1, Math.min(100, Math.floor(Number(payAtDoorQuantity) || 1)))
                return q <= 1
                  ? 'נרשם אורח אחד כנכנס, בשם «נכנס בכניסה 1».'
                  : `יירשמו ${q} אורחים כנכנסים, בשמות «נכנס בכניסה 1» … «נכנס בכניסה ${q}».`
              })()}
            </p>
            <label className="scan-walkin-label" htmlFor="pay-at-door-amount">
              סכום (₪) — חובה <span className="muted small">(לכל כרטיס)</span>
            </label>
            <input
              id="pay-at-door-amount"
              className="input"
              type="text"
              inputMode="decimal"
              dir="ltr"
              placeholder="0"
              value={payAtDoorAmount}
              onChange={(e) => setPayAtDoorAmount(e.target.value)}
              disabled={payAtDoorLoading}
              required
            />
            <label className="scan-walkin-label" htmlFor="pay-at-door-qty">
              כמות
            </label>
            <input
              id="pay-at-door-qty"
              className="input"
              type="text"
              inputMode="numeric"
              dir="ltr"
              placeholder="1"
              value={payAtDoorQuantity}
              onChange={(e) => setPayAtDoorQuantity(e.target.value)}
              disabled={payAtDoorLoading}
            />
            <div className="modal-actions">
              <button
                type="button"
                className="btn secondary"
                disabled={payAtDoorLoading}
                onClick={() => closePayAtDoorModal()}
              >
                ביטול
              </button>
              <button
                type="button"
                className="btn"
                disabled={payAtDoorLoading || !payAtDoorAmount.trim()}
                onClick={() => void submitPayAtDoor()}
              >
                {payAtDoorLoading ? 'מבצע…' : 'מאשר'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )

  if (embedded) {
    return (
      <section className="scanner-event-home__scan" aria-labelledby="scanner-scan-heading">
        <h2 id="scanner-scan-heading" className="scanner-section-title">
          סריקות כניסה
        </h2>
        <p className="muted small" style={{ marginBottom: '0.75rem' }}>
          {eventLoading ? (
            'טוען…'
          ) : currentEvent ? (
            <>
              <strong>{currentEvent.name}</strong> — רק כרטיסים של מסיבה זו יסומנו כנכנסו. סרקו QR עם המצלמה.
            </>
          ) : (
            'אין מסיבה נבחרת — חזרו לדף הבית.'
          )}
        </p>
        {scanBody}
      </section>
    )
  }

  return (
    <div className="page scan-page">
      <header className="page-head">
        <h1>סריקות כניסה</h1>
        <p className="muted">
          {eventLoading ? (
            'טוען…'
          ) : currentEvent ? (
            <>
              מסיבה נוכחית: <strong>{currentEvent.name}</strong> — רק כרטיסים של מסיבה זו יסומנו כנכנסו. סרקו QR עם
              המצלמה.
            </>
          ) : (
            'אין מסיבה נבחרת — חזרו לדף הבית.'
          )}
        </p>
      </header>
      {scanBody}
    </div>
  )
}

function ScanResultBanner({
  result,
  walkInName,
}: {
  result: ScanResponse | null
  walkInName: string | null
}) {
  if (walkInName) {
    return (
      <div className="scan-result ok" role="status">
        <div className="scan-result-title">נוספו — תשלום בכניסה</div>
        <div className="scan-result-name" style={{ whiteSpace: 'pre-wrap' }}>
          {walkInName}
        </div>
        <p className="scan-result-sub muted small" style={{ margin: '0.5rem 0 0' }}>
          נרשמו כנכנסים, עם הכנסה בדוח הכספים
        </p>
      </div>
    )
  }

  if (!result) return null

  const g = result.guest
  const time =
    g?.entered_at &&
    new Date(g.entered_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'medium' })

  if (result.result === 'ok') {
    return (
      <div className="scan-result ok" role="status">
        <div className="scan-result-title">מותר להכניס</div>
        {g && <div className="scan-result-name">{g.name}</div>}
      </div>
    )
  }

  if (result.result === 'already_entered') {
    return (
      <div className="scan-result warn" role="status">
        <div className="scan-result-title">כבר נכנס בעבר</div>
        {g && (
          <>
            <div className="scan-result-name">{g.name}</div>
            {time && <div className="scan-result-sub">{time}</div>}
          </>
        )}
      </div>
    )
  }

  if (result.result === 'wrong_event') {
    return (
      <div className="scan-result warn" role="status">
        <div className="scan-result-title">שייך למסיבה אחרת</div>
        <p className="scan-result-sub muted small" style={{ margin: '0.25rem 0 0' }}>
          הכרטיס לא סומן — חזרו לדף הבית והחליפו מסיבה, או השתמשו בכרטיס של האירוע הנוכחי.
        </p>
        {g && <div className="scan-result-name">{g.name}</div>}
      </div>
    )
  }

  if (result.result === 'forbidden') {
    return (
      <div className="scan-result bad" role="status">
        <div className="scan-result-title">אין הרשאה</div>
        <p className="scan-result-sub muted small" style={{ margin: '0.25rem 0 0' }}>
          {result.message ?? 'לא ניתן לסרוק לאירוע זה.'}
        </p>
      </div>
    )
  }

  return (
    <div className="scan-result bad" role="status">
      <div className="scan-result-title">לא קיים / לא מורשה</div>
    </div>
  )
}
