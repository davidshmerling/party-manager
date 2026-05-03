export type GuestInviteFilter = 'all' | 'unsent' | 'sent'
export type GuestEntryFilter = 'all' | 'entered' | 'pending'

export function getGuestListEmptyMessage(args: {
  searchQuery: string
  guestInviteFilter: GuestInviteFilter
  guestEntryFilter: GuestEntryFilter
  sortedGroupedRowsLength: number
  filterAdminId: string
}): string {
  if (args.searchQuery.trim()) {
    return 'נסה לשנות את החיפוש או לנקות מסננים.'
  }
  if (args.guestInviteFilter !== 'all' && args.sortedGroupedRowsLength > 0) {
    return 'אין אורחים לפי סינון סטטוס ההזמנה. נסו «כל האורחים» או סינון אחר.'
  }
  if (args.guestEntryFilter !== 'all' && args.sortedGroupedRowsLength > 0) {
    return 'אין אורחים לפי סינון סטטוס הכניסה. נסו «כל האורחים» או סינון אחר.'
  }
  if (args.filterAdminId && args.sortedGroupedRowsLength > 0) {
    return 'אין אורחים שמתאימים לשורת הכנסה לפי הסינון. בדקו את מקבל התשלום או הוסיפו הכנסה תואמת.'
  }
  return 'עדיין לא נוספו אורחים לאירוע.'
}

export function guestListFiltersDirty(args: {
  searchQuery: string
  guestInviteFilter: GuestInviteFilter
  guestEntryFilter: GuestEntryFilter
  filterAdminId: string
}): boolean {
  return (
    Boolean(args.searchQuery.trim()) ||
    args.guestInviteFilter !== 'all' ||
    args.guestEntryFilter !== 'all' ||
    Boolean(args.filterAdminId)
  )
}
