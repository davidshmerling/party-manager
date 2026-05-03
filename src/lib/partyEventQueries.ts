import type { QueryClient } from '@tanstack/react-query'
import type { EventFinanceLine } from '../types/finance'
import type { Guest } from '../types/guest'
import {
  fetchEventStatsPageBundle,
  fetchFinancePageShell,
  fetchPartyEventShell,
} from '../services/api'
import type { FinancePageShell, PartyEventShell } from '../services/api/partyShell'

/** מפתחות TanStack Query לאירוע — מקור אחד לרשימת אורחים, prefetch, ו־hover */
export const partyQueryKeys = {
  eventGuests: (eventId: string) => ['event', eventId, 'guests'] as const,
  eventFinanceLines: (eventId: string) => ['event', eventId, 'financeLines'] as const,
  eventStaff: (eventId: string) => ['event', eventId, 'eventStaff'] as const,
  eventStats: (eventId: string) => ['event', eventId, 'eventStats'] as const,
  /** דף «אורחים» — ‎`list_global_users_for_staff` */
  globalStaffUsers: () => ['global', 'adminUsers'] as const,
  /** דף «הכנסות/הוצאות» + אדמינים — ‎`get_all_users_for_admin` */
  fullAdminUsers: () => ['global', 'fullAdminUsers'] as const,
  /** גרף כניסות בדף סטטיסטיקה */
  eventGuestEntryTimes: (eventId: string) => ['event', eventId, 'guestEntryTimes'] as const,
  /** מעטפת — קריאת RPC אחת, ממלאת את המפתחות הנפרדים בדיסק/זיכרון מטמון */
  partyShell: (eventId: string) => ['event', eventId, 'partyShell'] as const,
  eventStatsBundle: (eventId: string) => ['event', eventId, 'statsPageBundle'] as const,
  eventFinanceShell: (eventId: string) => ['event', eventId, 'financePageShell'] as const,
}

/**
 * דאטה לאירוע בודד — קטן; מפחית refetch תכוף ברירת ברקע ובמעברי טאב.
 * משמש למעטפת, סטטיסטיקה, כספים, גרף.
 */
export const PARTY_EVENT_STALE_MS = 120_000

/**
 * לאחר מוטציות באורחים/כניסה — מבטל מטמון סטטיסטיקה כדי שהמספרים והגרף יתאימו ל־`partyShell`.
 * (גרף ה־Recharts נשאר lazy; הנתונים לגרף מתעדכנים מהבאנדל.)
 */
export function invalidatePartyEventStatsQueries(qc: QueryClient, eventId: string) {
  const e = eventId.trim()
  if (!e) return
  void qc.invalidateQueries({ queryKey: partyQueryKeys.eventStatsBundle(e) })
  void qc.invalidateQueries({ queryKey: partyQueryKeys.eventStats(e) })
  void qc.invalidateQueries({ queryKey: partyQueryKeys.eventGuestEntryTimes(e) })
}

/** אין סשן משלו לרשימת האורחים — רק ‎`partyShell` עם `fetch` אחד; המפתחות משניים מלאים ב־`setQueryData` אחרי ה־RPC (בלי תור של בקשות כפולות). */
function hydratePartyShellCache(qc: QueryClient, eventId: string, data: PartyEventShell) {
  qc.setQueryData(partyQueryKeys.eventGuests(eventId), data.guests)
  qc.setQueryData(partyQueryKeys.eventFinanceLines(eventId), data.financeLines)
  qc.setQueryData(partyQueryKeys.eventStaff(eventId), data.eventStaff)
  qc.setQueryData(partyQueryKeys.globalStaffUsers(), data.globalUsers)
}

function hydrateFinanceShellCache(
  qc: QueryClient,
  eventId: string,
  data: Awaited<ReturnType<typeof fetchFinancePageShell>>,
) {
  qc.setQueryData(partyQueryKeys.eventFinanceLines(eventId), data.financeLines)
  qc.setQueryData(partyQueryKeys.eventStaff(eventId), data.eventStaff)
  qc.setQueryData(partyQueryKeys.fullAdminUsers(), data.adminUsers)
}

/**
 * טעינה מקדימה של מעטפת המסיבה: אורחים, שורות כספים, צוות אירוע, משתמשים גלובליים (RPC אחד).
 * זה המקור המרכזי לדפי האורחים / סריקה / שיוך — מומלץ להריץ מיד בכניסה ל־`PartyLayout`.
 */
export function prefetchPartyEventShell(qc: QueryClient, eventId: string) {
  const e = eventId.trim()
  if (!e) return
  void qc.prefetchQuery({
    queryKey: partyQueryKeys.partyShell(e),
    queryFn: async () => {
      const data = await fetchPartyEventShell(e)
      hydratePartyShellCache(qc, e, data)
      return data
    },
    staleTime: PARTY_EVENT_STALE_MS,
  })
}

/**
 * סטטיסטיקה + נקודות זמן לגרף (באנדל RPC אחד). ב־PartyLayout מופעל יחד עם מעטפת המסיבה בכניסה.
 */
export function prefetchEventStatsPage(qc: QueryClient, eventId: string) {
  const e = eventId.trim()
  if (!e) return
  void qc.prefetchQuery({
    queryKey: partyQueryKeys.eventStatsBundle(e),
    queryFn: async () => {
      const bundle = await fetchEventStatsPageBundle(e)
      qc.setQueryData(partyQueryKeys.eventStats(e), bundle.stats)
      qc.setQueryData(partyQueryKeys.eventGuestEntryTimes(e), bundle.entryTimes)
      return bundle
    },
    staleTime: PARTY_EVENT_STALE_MS,
  })
}

export function prefetchEventFinancePage(qc: QueryClient, eventId: string) {
  const e = eventId.trim()
  if (!e) return
  void qc.prefetchQuery({
    queryKey: partyQueryKeys.eventFinanceShell(e),
    queryFn: async () => {
      const data = await fetchFinancePageShell(e)
      hydrateFinanceShellCache(qc, e, data)
      return data
    },
    staleTime: PARTY_EVENT_STALE_MS,
  })
}

export function prefetchEventGuestsPage(qc: QueryClient, eventId: string) {
  prefetchPartyEventShell(qc, eventId)
}

/** מעדכן גם ‎`partyShell` וגם מפתח משני — דף האורחים קורא מ־`partyShell` */
export function updateCachedPartyShellGuests(
  qc: QueryClient,
  eventId: string,
  update: (prev: Guest[]) => Guest[],
) {
  qc.setQueryData<Guest[]>(partyQueryKeys.eventGuests(eventId), (old) => update(old ?? []))
  qc.setQueryData<PartyEventShell | undefined>(partyQueryKeys.partyShell(eventId), (shell) => {
    if (!shell) return shell
    return { ...shell, guests: update(shell.guests) }
  })
}

export function updateCachedPartyShellFinanceLines(
  qc: QueryClient,
  eventId: string,
  update: (prev: EventFinanceLine[]) => EventFinanceLine[],
) {
  qc.setQueryData<EventFinanceLine[]>(partyQueryKeys.eventFinanceLines(eventId), (old) =>
    update(old ?? []),
  )
  qc.setQueryData<PartyEventShell | undefined>(partyQueryKeys.partyShell(eventId), (shell) => {
    if (!shell) return shell
    return { ...shell, financeLines: update(shell.financeLines) }
  })
}

/** דף הכנסות והוצאות משתמש ב־`eventFinanceShell`; רשימת האורחים ב־`partyShell` — שניהם מקבלים אותה רשימת שורות כספים אחרי מוטציה */
export function syncFinanceLinesAcrossEventCaches(
  qc: QueryClient,
  eventId: string,
  update: (prev: EventFinanceLine[]) => EventFinanceLine[],
) {
  updateCachedPartyShellFinanceLines(qc, eventId, update)
  qc.setQueryData<FinancePageShell | undefined>(partyQueryKeys.eventFinanceShell(eventId), (prev) => {
    if (!prev) return prev
    return { ...prev, financeLines: update(prev.financeLines) }
  })
}

export { hydratePartyShellCache, hydrateFinanceShellCache }
