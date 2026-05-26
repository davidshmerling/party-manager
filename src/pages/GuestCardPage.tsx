import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { GuestCardPartyBrand } from '../components/guest/GuestCardPartyBrand'
import { GuestCardTicketSlider } from '../components/GuestCardTicketSlider'
import { useGuestCardDocumentMeta } from '../hooks/useGuestCardDocumentMeta'
import {
  fetchGuestCardPublic,
  mergeGuestCardTextsFromEventRow,
  recordGuestCardOpen,
} from '../services/api'
import { buildGuestCardClientAuditMeta } from '../utils/guestCardAuditMeta'
import { GUEST_CARD_STAFF_PREVIEW_PARAM } from '../utils/whatsapp'

type CardPayload = {
  name: string
  codes: string[]
  initialSlideIndex: number
  card_text_above: string | null
  card_text_instruction: string | null
  card_text_below: string | null
  card_text_terms: string | null
}

export function GuestCardPage() {
  const { code } = useParams<{ code: string }>()
  const [searchParams] = useSearchParams()
  const { session } = useAuth()
  const decoded = code ? decodeURIComponent(code) : ''
  const staffPreview = searchParams.get(GUEST_CARD_STAFF_PREVIEW_PARAM) === '1'
  const [payload, setPayload] = useState<CardPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!decoded) {
      setError('קוד חסר')
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const auditClient = buildGuestCardClientAuditMeta()
        const data = await fetchGuestCardPublic(decoded, {
          recordOpen: !staffPreview,
          clientMeta: auditClient,
        })
        if (cancelled) return
        let card_text_above = data.card_text_above
        let card_text_instruction = data.card_text_instruction
        let card_text_below = data.card_text_below
        let card_text_terms = data.card_text_terms
        if (session) {
          const merged = await mergeGuestCardTextsFromEventRow(data.event_id, {
            card_text_above,
            card_text_instruction,
            card_text_below,
            card_text_terms,
          })
          card_text_above = merged.card_text_above
          card_text_instruction = merged.card_text_instruction
          card_text_below = merged.card_text_below
          card_text_terms = merged.card_text_terms
        }
        if (cancelled) return
        const codes = data.sibling_codes.length ? [...new Set(data.sibling_codes)] : [data.code]
        const initialSlideIndex = Math.max(0, codes.findIndex((c) => c === data.code))
        setPayload({
          name: data.name,
          codes,
          initialSlideIndex,
          card_text_above,
          card_text_instruction,
          card_text_below,
          card_text_terms,
        })
        if (!staffPreview) {
          try {
            await recordGuestCardOpen(data.code, auditClient)
          } catch {
            /* כבר עודכן ב־get_public_ticket או רשת */
          }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'שגיאה')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [decoded, staffPreview, session])

  useGuestCardDocumentMeta({
    guestName: payload?.name ?? null,
    ready: Boolean(payload && !error),
  })

  return (
    <div className="guest-card-page guest-card-page--public">
      <GuestCardPartyBrand />
      {error && <p className="banner error">{error}</p>}
      {!error && !payload && <p className="muted guest-card-page__loading">טוען…</p>}
      {payload && (
        <>
          <GuestCardTicketSlider
            key={payload.codes.join('|')}
            codes={payload.codes}
            initialIndex={payload.initialSlideIndex}
            guestName={payload.name}
            textAbove={payload.card_text_above}
            textInstruction={payload.card_text_instruction}
            textBelow={payload.card_text_below}
            textTerms={payload.card_text_terms}
            variant="glass"
          />
        </>
      )}
    </div>
  )
}
