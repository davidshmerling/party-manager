import {
  getGuestListEmptyMessage,
  guestListFiltersDirty,
  type GuestEntryFilter,
  type GuestInviteFilter,
} from './guestListEmptyMessage'

type Props = {
  loading: boolean
  isEmpty: boolean
  searchQuery: string
  guestInviteFilter: GuestInviteFilter
  guestEntryFilter: GuestEntryFilter
  sortedGroupedRowsLength: number
  filterAdminId: string
  onClearFilters?: () => void
}

/** הורה מציג כש־`loading` או אין תוצאות (לפני רשימה). */
export function GuestListEmptyState({
  loading,
  isEmpty,
  searchQuery,
  guestInviteFilter,
  guestEntryFilter,
  sortedGroupedRowsLength,
  filterAdminId,
  onClearFilters,
}: Props) {
  if (loading) {
    return (
      <p className="muted center" style={{ padding: '1.5rem' }}>
        טוען…
      </p>
    )
  }
  if (!isEmpty) {
    return null
  }

  const dirty = guestListFiltersDirty({
    searchQuery,
    guestInviteFilter,
    guestEntryFilter,
    filterAdminId,
  })

  const desc = getGuestListEmptyMessage({
    searchQuery,
    guestInviteFilter,
    guestEntryFilter,
    sortedGroupedRowsLength,
    filterAdminId,
  })

  return (
    <div className="guest-empty-card" role="status">
      <h3 className="guest-empty-card__title">לא נמצאו אורחים</h3>
      <p className="guest-empty-card__desc">{desc}</p>
      {dirty && onClearFilters ? (
        <button type="button" className="btn btn-mob btn-mob--secondary" onClick={() => onClearFilters()}>
          נקה מסננים
        </button>
      ) : null}
    </div>
  )
}
