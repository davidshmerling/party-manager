import { memo, useMemo, useState, type CSSProperties, type MouseEvent } from 'react'
import type { Guest } from '../../types/guest'
import {
  groupInviteSegment,
  groupInviteThumbSegment,
  isGuestDbNotSent,
  memberInviteSegment,
  type InviteSegmentGroup,
  type InviteSegmentVisual,
} from '../../utils/guestInviteSegment'

export type GuestInviteSentMarkButtonProps = {
  variant: 'mob' | 'desk-col'
  members: Guest[]
  saveInviteSent: (value: 'sent' | 'not_sent') => Promise<void>
}

function thumbIndex(seg: InviteSegmentVisual): number {
  if (seg === 'not_sent') return 0
  if (seg === 'sent') return 1
  return 2
}

function segmentTitle(groupSeg: InviteSegmentGroup, members: Guest[]): string {
  if (groupSeg === 'mixed') {
    const ms = members.map(memberInviteSegment)
    const n = (s: InviteSegmentVisual) => ms.filter((x) => x === s).length
    return `מעורב: לא נשלח ${n('not_sent')}, נשלח ${n('sent')}, נצפה ${n('seen')} — לחץ ❌ לנקות או ✓✓ אפור לסמן נשלח`
  }
  if (groupSeg === 'not_sent') return 'לא נשלח — לחץ ✓✓ אמצעי לסמן נשלח'
  if (groupSeg === 'sent') return 'נשלח — לחץ ❌ ל«לא נשלח»; נקרא/נפתח יתעדכן אוטומטית'
  return 'נפתח או נקרא בווטסאפ — מצב אוטומטי; ❌ או ✓✓ אפור לשינוי שליחה בלבד'
}

export const GuestInviteSentMarkButton = memo(function GuestInviteSentMarkButton({
  variant,
  members,
  saveInviteSent,
}: GuestInviteSentMarkButtonProps) {
  const [busy, setBusy] = useState(false)

  const groupSeg = useMemo(() => groupInviteSegment(members), [members])
  const thumbSeg = useMemo(() => groupInviteThumbSegment(groupSeg, members), [groupSeg, members])

  const someDbNotSent = useMemo(() => members.some(isGuestDbNotSent), [members])
  const someDbSent = useMemo(() => members.some((m) => !isGuestDbNotSent(m)), [members])

  const title = segmentTitle(groupSeg, members)
  const idx = thumbIndex(thumbSeg)

  async function markNotSent(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    if (busy || !someDbSent) return
    setBusy(true)
    try {
      await saveInviteSent('not_sent')
    } finally {
      setBusy(false)
    }
  }

  async function markSent(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    if (busy || !someDbNotSent) return
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
      className={`${rootClass} guest-invite-seg--thumb-${thumbSeg}${groupSeg === 'mixed' ? ' guest-invite-seg--mixed' : ''}${busy ? ' guest-invite-seg--busy' : ''}`}
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
          disabled={busy || !someDbSent}
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
          disabled={busy || !someDbNotSent}
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
