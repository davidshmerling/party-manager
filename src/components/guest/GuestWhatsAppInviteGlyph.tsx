import { memo, useMemo } from 'react'
import type { Guest } from '../../types/guest'

export type InviteGlyphKind = 'not_sent' | 'sent' | 'delivered' | 'read' | 'failed' | 'pay_door'

export function resolveInviteTwilioGlyph(members: Guest[]): {
  kind: InviteGlyphKind
  title: string
} {
  if (!members.length) return { kind: 'not_sent', title: 'לא נשלח' }
  if (members[0]!.source === 'pay_at_door') {
    return { kind: 'pay_door', title: 'תשלום בכניסה' }
  }
  const allTwilio =
    members.every((m) => m.whatsapp_invite_sent_at != null) &&
    members.every((m) => String(m.invite_sent_method ?? '').trim().toLowerCase() === 'twilio')
  if (!allTwilio) {
    return { kind: 'not_sent', title: 'לא נשלח דרך Twilio' }
  }
  const st = (members[0]!.whatsapp_invite_twilio_status ?? '').trim().toLowerCase()
  if (st === 'read') return { kind: 'read', title: 'נקרא' }
  if (st === 'delivered') return { kind: 'delivered', title: 'הגיע' }
  if (st === 'failed' || st === 'undelivered' || st === 'canceled') {
    return { kind: 'failed', title: 'שליחה נכשלה' }
  }
  if (st === 'sent' || st === 'queued' || st === 'sending' || st === '') {
    return { kind: 'sent', title: 'נשלח' }
  }
  return { kind: 'sent', title: st }
}

function GuestWhatsAppInviteGlyphInner({ members }: { members: Guest[] }) {
  const { kind, title } = useMemo(() => resolveInviteTwilioGlyph(members), [members])

  if (kind === 'pay_door') {
    return (
      <span className="guest-wa-invite-glyph guest-wa-invite-glyph--muted" title={title} aria-hidden>
        —
      </span>
    )
  }
  if (kind === 'not_sent' || kind === 'failed') {
    return (
      <span
        className={`guest-wa-invite-glyph guest-wa-invite-glyph--x${kind === 'failed' ? ' guest-wa-invite-glyph--fail' : ''}`}
        title={title}
        aria-hidden
      >
        ✕
      </span>
    )
  }
  if (kind === 'read') {
    return (
      <span className="guest-wa-invite-glyph guest-wa-invite-glyph--read" title={title} aria-hidden>
        ✓✓
      </span>
    )
  }
  if (kind === 'delivered') {
    return (
      <span className="guest-wa-invite-glyph guest-wa-invite-glyph--delivered" title={title} aria-hidden>
        ✓✓
      </span>
    )
  }
  return (
    <span className="guest-wa-invite-glyph guest-wa-invite-glyph--sent" title={title} aria-hidden>
      ✓
    </span>
  )
}

export const GuestWhatsAppInviteGlyph = memo(GuestWhatsAppInviteGlyphInner)
