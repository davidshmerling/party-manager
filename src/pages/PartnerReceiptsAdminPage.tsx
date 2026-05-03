import { useMemo, useState } from 'react'

/** תור מוק — בהמשך נמשך מסולק אחרי שמירת אמצעי תשלום (תפיסת סכום רק אחרי אישור כאן). */
type PendingCaptureRow = {
  id: string
  payerName: string
  payerHint: string
  amountNis: number
  eventName: string
  submittedAtLabel: string
}

type ApprovedCaptureRow = PendingCaptureRow & { approvedAtLabel: string }

const MOCK_PENDING_INITIAL: PendingCaptureRow[] = [
  {
    id: 'mock-p1',
    payerName: 'דנה ל.',
    payerHint: '**** 4242 · 052-***78',
    amountNis: 120,
    eventName: 'מסיבת דמו · קיץ',
    submittedAtLabel: 'לפני כשעה',
  },
  {
    id: 'mock-p2',
    payerName: 'עומר כהן',
    payerHint: '**** 9911 · 054-***03',
    amountNis: 85,
    eventName: 'מסיבת דמו · קיץ',
    submittedAtLabel: 'אתמול',
  },
]

/** כשמחוברים לסולק — החזירו true כדי להציג שוב כפתורי אישור/דחייה במוק */
const ENABLE_MOCK_RECEIPT_ACTIONS = false

function fmtNis(n: number): string {
  try {
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
      maximumFractionDigits: 0,
    }).format(n)
  } catch {
    return `${n} ₪`
  }
}

/** דף ניהול קבלות — אישור גבייה אחרי שמירת אשראי (לא דרך ניהול אורחים). מוק ללא סולק. */
export function PartnerReceiptsAdminPage() {
  const [pending, setPending] = useState<PendingCaptureRow[]>(() => [...MOCK_PENDING_INITIAL])
  const [approved, setApproved] = useState<ApprovedCaptureRow[]>([])

  const pendingTotal = useMemo(() => pending.reduce((s, r) => s + r.amountNis, 0), [pending])

  function approveCapture(id: string) {
    const row = pending.find((r) => r.id === id)
    if (!row) return
    setPending((rows) => rows.filter((r) => r.id !== id))
    setApproved((prev) => [{ ...row, approvedAtLabel: 'זה עתה (מוק)' }, ...prev])
  }

  function rejectWithoutCapture(id: string) {
    setPending((rows) => rows.filter((r) => r.id !== id))
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>ניהול קבלות</h1>
      </header>

      <section className="dash-card receipts-flow-intro">
        <h2 className="dash-card-title">תהליך התשלום (מתוכנן)</h2>
        <ol className="receipts-flow-steps muted small">
          <li>הרוכש משאיר פרטי אשראי אצל הסולק — ללא גבייה סופית עד לאישור שלכם.</li>
          <li>כאן, ב«ניהול קבלות», מאשרים מי יחויב בפועל.</li>
          <li>רק לאחר אישור נשלחת גבייה / תפיסת סכום — מי שלא אושר לא משלם.</li>
        </ol>
        <p className="muted small receipts-flow-note">
          רשימת ההמתנה למטה היא <strong>מוק מקומי</strong> לתצוגה בלבד. חיבור למורנינג / גרו ולנתוני רכישות אמיתיות יבוא בשלב הבא.
        </p>
      </section>

      <section className="dash-card">
        <h2 className="dash-card-title">ממתינים לאישור גבייה</h2>
        <p className="muted small dash-card-lead">
          סכום כולל בהמתנה: <strong>{fmtNis(pendingTotal)}</strong> · {pending.length} רוכשים
        </p>
        {pending.length === 0 ? (
          <p className="muted small receipts-empty">אין רוכשים בהמתנה לאישור (מוק).</p>
        ) : (
          <div className="receipts-pending-stack">
            {pending.map((row) => (
              <div key={row.id} className="receipts-pending-row">
                <div className="receipts-pending-meta">
                  <div className="receipts-pending-name">{row.payerName}</div>
                  <div className="muted tiny receipts-pending-hint">{row.payerHint}</div>
                  <div className="muted small receipts-pending-event">{row.eventName}</div>
                  <div className="muted tiny">{row.submittedAtLabel}</div>
                </div>
                <div className="receipts-pending-side">
                  <span className="receipts-pending-amount">{fmtNis(row.amountNis)}</span>
                  {ENABLE_MOCK_RECEIPT_ACTIONS ? (
                    <div className="receipts-pending-actions">
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => approveCapture(row.id)}
                        aria-label={`אשר גבייה עבור ${row.payerName}`}
                      >
                        אשר וגבה
                      </button>
                      <button
                        type="button"
                        className="btn small secondary"
                        onClick={() => rejectWithoutCapture(row.id)}
                        aria-label={`דחה ללא גבייה — ${row.payerName}`}
                      >
                        דחה · ללא חיוב
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {approved.length > 0 ? (
        <section className="dash-card">
          <h2 className="dash-card-title">אושרו לאחרונה (מוק בסשן זה)</h2>
          <p className="muted small dash-card-lead">רק מה שאושר במסך הנוכחי — מתאפס אחרי רענון דף.</p>
          <ul className="receipts-approved-list">
            {approved.map((row) => (
              <li key={row.id} className="receipts-approved-item">
                <span className="receipts-approved-name">{row.payerName}</span>
                <span className="receipts-approved-amount">{fmtNis(row.amountNis)}</span>
                <span className="muted tiny receipts-approved-when">{row.approvedAtLabel}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
