import { useEffect, useState } from 'react'

export type RecipientFilterOption = { value: string; label: string }

export type GuestInviteFilterMode = 'all' | 'unsent' | 'sent'
export type GuestEntryFilterMode = 'all' | 'entered' | 'pending'

type Props = {
  guestSearchQuery: string
  setGuestSearchQuery: (v: string) => void
  handleGuestSearch: () => void
  searchDisabled: boolean
  guestSortMode: 'name' | 'entry_time' | 'added_at'
  setGuestSortMode: (m: 'name' | 'entry_time' | 'added_at') => void
  listDisabled: boolean
  filterAdminId: string
  setFilterAdminId: (v: string) => void
  recipientFilterOptions: RecipientFilterOption[]
  guestInviteFilter: GuestInviteFilterMode
  setGuestInviteFilter: (v: GuestInviteFilterMode) => void
  guestEntryFilter: GuestEntryFilterMode
  setGuestEntryFilter: (v: GuestEntryFilterMode) => void
  loading: boolean
  sortedGroupedRowsLength: number
}

export function GuestListSearchFilters({
  guestSearchQuery,
  setGuestSearchQuery,
  handleGuestSearch,
  searchDisabled,
  guestSortMode,
  setGuestSortMode,
  listDisabled,
  filterAdminId,
  setFilterAdminId,
  recipientFilterOptions,
  guestInviteFilter,
  setGuestInviteFilter,
  guestEntryFilter,
  setGuestEntryFilter,
  loading,
  sortedGroupedRowsLength,
}: Props) {
  const canInviteFilter = !listDisabled && !loading && sortedGroupedRowsLength > 0

  const [filtersExpanded, setFiltersExpanded] = useState(true)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 899px)')
    const sync = () => setFiltersExpanded(!mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  return (
    <div className="guest-filters-align" dir="rtl">
      <div className="guest-filters-card">
        <header className="guest-filters-card-header">
          <h3 className="guest-filters-card-title">חיפוש וסינון</h3>
          <p className="guest-filters-card-desc">
            מצא אורחים לפי שם, טלפון, סטטוס כניסה או הזמנה
          </p>
        </header>

        <form
          className="guest-filters-search-form"
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            handleGuestSearch()
          }}
        >
          <div className="guest-filters-search-row guest-filters-search-joined">
            <input
              id="guest-search-input"
              type="search"
              enterKeyHint="search"
              className="input guest-filters-search-input"
              autoComplete="off"
              value={guestSearchQuery}
              onChange={(e) => setGuestSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleGuestSearch()
                }
              }}
              disabled={searchDisabled}
              placeholder="חפש לפי שם או טלפון"
              aria-label="חיפוש אורחים"
            />
            <button
              type="submit"
              className="guest-filters-search-submit guest-filters-search-submit--blue"
              disabled={searchDisabled}
              aria-label="חיפוש — גלילה לתוצאה"
            >
              חיפוש
            </button>
          </div>
        </form>

        <button
          type="button"
          className="guest-filters-toggle-filters"
          aria-expanded={filtersExpanded}
          onClick={() => setFiltersExpanded((v) => !v)}
        >
          {filtersExpanded ? 'הסתר מסננים' : 'הצג מסננים'}
        </button>

        <div
          className={
            filtersExpanded
              ? 'guest-filters-grid-wrap guest-filters-grid-wrap--open'
              : 'guest-filters-grid-wrap'
          }
          aria-label="סינונים"
        >
          <div className="guest-filters-card__grid">
            <div className="guest-filters-field">
              <label className="guest-filters-field__label" htmlFor="guest-sort-mode">
                מיון
              </label>
              <select
                id="guest-sort-mode"
                className="input guest-filters-control-select"
                value={guestSortMode}
                onChange={(e) => setGuestSortMode(e.target.value as 'name' | 'entry_time' | 'added_at')}
                disabled={listDisabled}
              >
                <option value="name">שם א׳–ת׳</option>
                <option value="entry_time">לפי שעת כניסה</option>
                <option value="added_at">לפי תאריך הוספה</option>
              </select>
            </div>

            <div className="guest-filters-field">
              <label className="guest-filters-field__label" htmlFor="guest-filter-admin">
                מקבל תשלום
              </label>
              <select
                id="guest-filter-admin"
                className="input guest-filters-control-select"
                value={filterAdminId}
                onChange={(e) => setFilterAdminId(e.target.value)}
                disabled={listDisabled}
              >
                <option value="">כל האורחים</option>
                {recipientFilterOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="guest-filters-field">
              <label className="guest-filters-field__label" htmlFor="guest-filter-invite">
                סטטוס הזמנה
              </label>
              <select
                id="guest-filter-invite"
                className="input guest-filters-control-select"
                value={guestInviteFilter}
                onChange={(e) => setGuestInviteFilter(e.target.value as GuestInviteFilterMode)}
                disabled={listDisabled || !canInviteFilter}
              >
                <option value="all">כל האורחים</option>
                <option value="unsent">לא נשלחה הזמנה</option>
                <option value="sent">נשלחה הזמנה</option>
              </select>
            </div>

            <div className="guest-filters-field">
              <label className="guest-filters-field__label" htmlFor="guest-filter-entry">
                סטטוס כניסה
              </label>
              <select
                id="guest-filter-entry"
                className="input guest-filters-control-select"
                value={guestEntryFilter}
                onChange={(e) => setGuestEntryFilter(e.target.value as GuestEntryFilterMode)}
                disabled={listDisabled}
              >
                <option value="all">כל האורחים</option>
                <option value="entered">נכנסו</option>
                <option value="pending">טרם נכנסו</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
