import { useNavigate } from 'react-router-dom'
import { consumeNextMockPartnerSlug } from '../lib/mockPartnerPayRoundRobin'

/** פותח את דף התשלום המוק עם הסולק הבא בסיבוב (מתוך ניווט מסיבה). */
export function PartyPaymentNextMockButton() {
  const navigate = useNavigate()

  return (
    <button
      type="button"
      className="party-nav-tab-like"
      onClick={() => {
        const slug = consumeNextMockPartnerSlug()
        navigate(`/ticket/partner/${encodeURIComponent(slug)}`)
      }}
    >
      תשלום הבא (מוק)
    </button>
  )
}
