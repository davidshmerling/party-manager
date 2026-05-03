type TableSummary = {
  totalTickets: number
  identities: number
  breakdownParts: string[]
}

type InviteTotals = {
  inviteSentTickets: number
  totalTickets: number
  inviteSentIdentities: number
  totalIdentities: number
  cardOpenedTickets: number
  cardOpenedIdentities: number
}

type EntrySnap = {
  identities: number
  tickets: number
  entered: number
  pending: number
}

type Props = {
  loading: boolean
  guestsLength: number
  searchFilteredCount: number
  guestListTableSummary: TableSummary
  searchQuery: string
  filterAdminId: string
  guestInviteOpenTotals: InviteTotals
  guestEntrySnapshot: EntrySnap
}

export function GuestListFooterSummary({
  loading,
  guestsLength,
  searchFilteredCount,
  guestListTableSummary,
  searchQuery,
  filterAdminId,
  guestInviteOpenTotals,
  guestEntrySnapshot,
}: Props) {
  if (loading || guestsLength === 0) {
    return null
  }

  return (
    <div
      className="guest-list-summary guest-list-summary--mobile guest-list-summary--modern guest-manage-card"
      aria-live="polite"
    >
      {guestEntrySnapshot.tickets > 0 ? (
        <div className="guest-list-summary__entry-row" role="status">
          <span>
            <strong dir="ltr">{guestEntrySnapshot.identities}</strong> אנשים
          </span>
          <span aria-hidden>|</span>
          <span>
            <strong dir="ltr">{guestEntrySnapshot.tickets}</strong> כרטיסים
          </span>
          <span aria-hidden>|</span>
          <span className="guest-desk-snapshot__metric guest-desk-snapshot__metric--ok">
            <strong dir="ltr">{guestEntrySnapshot.entered}</strong> נכנסו
          </span>
          <span aria-hidden>|</span>
          <span className="guest-desk-snapshot__metric guest-desk-snapshot__metric--pending">
            <strong dir="ltr">{guestEntrySnapshot.pending}</strong> טרם נכנסו
          </span>
        </div>
      ) : null}
      {searchFilteredCount > 0 ? (
        <>
          <div className="guest-list-summary__total">
            סה״כ: {guestListTableSummary.totalTickets}{' '}
            {guestListTableSummary.totalTickets === 1 ? 'כרטיס' : 'כרטיסים'} ·{' '}
            {guestListTableSummary.identities === 1
              ? 'אדם אחד'
              : `${guestListTableSummary.identities} אנשים`}
            {searchQuery.trim()
              ? ' (לפי חיפוש)'
              : filterAdminId
                ? ' (לפי סינון תשלומים)'
                : null}
          </div>
          {guestListTableSummary.breakdownParts.length > 0 ? (
            <div className="guest-list-summary__breakdown muted small">
              <div className="guest-list-summary__breakdown-title">פילוח:</div>
              <div className="guest-list-summary__breakdown-lines">
                {guestListTableSummary.breakdownParts.map((line, i) => (
                  <div key={`${line}-${i}`}>{line}</div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
      <div
        className={
          searchFilteredCount > 0
            ? 'guest-list-summary__reach guest-list-summary__reach--after-total'
            : 'guest-list-summary__reach'
        }
      >
        <div className="guest-list-summary__reach-line">
          <span className="guest-list-summary__reach-label">שליחת הזמנה (וואטסאפ):</span>{' '}
          <strong>{guestInviteOpenTotals.inviteSentTickets}</strong>
          <span className="muted"> מתוך </span>
          <strong>{guestInviteOpenTotals.totalTickets}</strong>
          <span className="muted"> כרטיסים</span>
          <span className="muted"> · </span>
          <strong>{guestInviteOpenTotals.inviteSentIdentities}</strong>
          <span className="muted"> מתוך </span>
          <strong>{guestInviteOpenTotals.totalIdentities}</strong>
          <span className="muted"> אנשים</span>
        </div>
        <div className="guest-list-summary__reach-line">
          <span className="guest-list-summary__reach-label">פתיחת כרטיס:</span>{' '}
          <strong>{guestInviteOpenTotals.cardOpenedTickets}</strong>
          <span className="muted"> מתוך </span>
          <strong>{guestInviteOpenTotals.totalTickets}</strong>
          <span className="muted"> כרטיסים</span>
          <span className="muted"> · </span>
          <strong>{guestInviteOpenTotals.cardOpenedIdentities}</strong>
          <span className="muted"> מתוך </span>
          <strong>{guestInviteOpenTotals.totalIdentities}</strong>
          <span className="muted"> אנשים</span>
        </div>
      </div>
    </div>
  )
}
