import { memo, useMemo, useState, type CSSProperties, type MouseEvent } from 'react'
import type { Guest } from '../../types/guest'
import {
  groupInviteSegment,
  isGuestInviteSent,
  type InviteSegmentVisual,
} from '../../utils/guestInviteSegment'

export type GuestInviteSentMarkButtonProps = {
  variant: 'mob' | 'desk-col'
  members: Guest[]
  saveInviteSent: (value: 'sent' | 'not_sent') => Promise<void>
  /**
   * שינוי ידני (✗ / ✓✓ אפור) — מותר לשותף כשיש כרטיסים בקבוצה.
   * כש־false — הכפתורים חסומים.
   */
  allowManualToggle?: boolean
}

function thumbIndex(seg: InviteSegmentVisual): number {
  if (seg === 'not_sent') return 0
  if (seg === 'sent') return 1
  return 2
}

function segmentTitle(groupSeg: InviteSegmentVisual, allowManual: boolean): string {
  const perm =
    'שינוי ידני — שותף בלבד. קבוצה: אם כרטיס אחד נשלח — כולם אפור; אם אחד נצפה/read — כולם כחול.'
  if (groupSeg === 'not_sent') return `לא נשלח — ${perm}`
  if (groupSeg === 'sent') return `נשלח — נקרא/נפתח יתעדכן אוטומטית. ${perm}`
  return allowManual
    ? 'נצפה בווטסאפ או נפתח כרטיס — שותף: אפשר לעדכן ידנית ✗ / ✓✓'
    : `נצפה בווטסאפ או נפתח כרטיס — ${perm}`
}

export const GuestInviteSentMarkButton = memo(function GuestInviteSentMarkButton({
  variant,
  members,
  saveInviteSent,
  allowManualToggle = false,
}: GuestInviteSentMarkButtonProps) {
  const [busy, setBusy] = useState(false)

  const groupSeg = useMemo(() => groupInviteSegment(members), [members])

  const someDbSent = useMemo(() => members.some(isGuestInviteSent), [members])

  const title = segmentTitle(groupSeg, allowManualToggle)
  const idx = thumbIndex(groupSeg)

  async function markNotSent(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    if (busy || !allowManualToggle || !someDbSent) return
    setBusy(true)
    try {
      await saveInviteSent('not_sent')
    } finally {
      setBusy(false)
    }
  }

  async function markSent(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    if (busy || !allowManualToggle) return
    setBusy(true)
    try {
      await saveInviteSent('sent')
    } finally {
      setBusy(false)
    }
  }

  const rootClass =
    variant === 'desk-col'
      ? 'guest-invite-seg guest-invite-seg--desk-col'
      : 'guest-invite-seg guest-invite-seg--mob'

  return (
    <div
      className={`${rootClass} guest-invite-seg--thumb-${groupSeg}${busy ? ' guest-invite-seg--busy' : ''}${!allowManualToggle ? ' guest-invite-seg--manual-locked' : ''}`}
      style={{ '--thumb': idx } as CSSProperties}
      role="group"
      title={title}
      aria-label={title}
    >
      <div className="guest-invite-seg__track">
        <div className="guest-invite-seg__thumb" aria-hidden />
        <button
          type="button"
          className="guest-invite-seg__cell guest-invite-seg__cell--tap"
          disabled={busy || !allowManualToggle || !someDbSent}
          aria-label="סמן לא נשלח"
          onClick={(e) => void markNotSent(e)}
        >
          <span className="guest-invite-seg__glyph guest-invite-seg__glyph--not" aria-hidden>
            ✗
          </span>
        </button>
        <button
          type="button"
          className="guest-invite-seg__cell guest-invite-seg__cell--tap"
          disabled={busy || !allowManualToggle}
          aria-label="סמן נשלח (ידני)"
          onClick={(e) => void markSent(e)}
        >
          <span className="guest-invite-seg__glyph guest-invite-seg__glyph--sent" aria-hidden>
            ✓✓
          </span>
        </button>
        <span className="guest-invite-seg__cell guest-invite-seg__cell--seen" aria-hidden title="אוטומטי: נפתח כרטיס או נקרא בווטסאפ">
          <span className="guest-invite-seg__glyph guest-invite-seg__glyph--seen">✓✓</span>
        </span>
      </div>
    </div>
  )
})
