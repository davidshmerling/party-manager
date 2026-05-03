import type { GuestStatus } from '../../types/guest'
import { statusTag } from './guestStatusTags'

export const guestStatusText: Record<GuestStatus, string> = {
  pending: 'לא נכנס',
  entered: 'נכנס',
}

export function GuestListStatusBadge({
  allEntered,
  entryMixed,
  enteredCount,
  total,
}: {
  allEntered: boolean
  entryMixed: boolean
  enteredCount: number
  total: number
}) {
  if (entryMixed) {
    return (
      <span
        className="status-badge status-badge--partial"
        title="חלק נכנסו"
        aria-label={`חלקי: ${enteredCount} נכנסו מתוך ${total}`}
      >
        {enteredCount}/{total}
      </span>
    )
  }
  if (allEntered) {
    return (
      <span
        className="status-badge status-badge--entered"
        aria-label={guestStatusText.entered}
        title="נכנס"
      >
        {statusTag.enterYes}
      </span>
    )
  }
  return (
    <span
      className="status-badge status-badge--pending"
      aria-label={guestStatusText.pending}
      title="לא נכנס"
    >
      {statusTag.enterNo}
    </span>
  )
}
