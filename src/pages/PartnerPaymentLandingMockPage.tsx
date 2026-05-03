import { useParams } from 'react-router-dom'
import { MOCK_PARTNER_ACQUIRERS } from '../constants/mockPartnerAcquirers'

/** דף תשלום ציבורי מוק לכל סולק/שותף — נתיב: `/ticket/partner/:partnerSlug` */
export function PartnerPaymentLandingMockPage() {
  const { partnerSlug = '' } = useParams<{ partnerSlug: string }>()
  const slug = decodeURIComponent(partnerSlug).trim()
  const meta = MOCK_PARTNER_ACQUIRERS.find((p) => p.slug === slug)

  return (
    <div dir="rtl" className="partner-pay-mock-page">
      <div className="partner-pay-mock-card">
        <p className="partner-pay-mock-eyebrow">תשלום · מוק</p>
        <h1 className="partner-pay-mock-title">{meta?.labelHe ?? 'סולק לא מוכר'}</h1>
        <p className="muted partner-pay-mock-slug">
          נתיב: <code className="mono">/ticket/partner/{slug || '…'}</code>
        </p>
        <p className="partner-pay-mock-body">
          {meta
            ? meta.futureProviderNoteHe
            : 'מוק כללי — נוסף בהמשך טופס תשלום אמיתי וחיבור לסולק של השותף.'}
        </p>
        <p className="muted partner-pay-mock-hint">
          בהמשך: שמירת אשראי כאן ואז אישור גבייה ב«ניהול קבלות» — רק אחרי האישור נגבה בפועל. הקצאת רכישות לפי עומס שותפים,
          וחיבור נפרד למורנינג ולגרו לכל שותף.
        </p>
        {/* אינטגרציה: <Link className="partner-pay-mock-back" to="/">חזרה לאתר</Link> */}
      </div>
    </div>
  )
}
