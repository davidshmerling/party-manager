import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MobileToastState } from '../components/MobileToast'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { hapticError, hapticSuccess } from '../utils/haptics'
import type { AdminUserRow } from '../types/admin'
import type { EventStaffRow } from '../types/event'
import type { EventFinanceLine, IncomeRecipientKind } from '../types/finance'
import type { Guest } from '../types/guest'
import type { PartyEventShell } from '../services/api/partyShell'
import { useAuth } from '../auth/AuthProvider'
import { useEvent } from '../context/EventContext'
import {
  createGuest,
  deleteGuestsByIds,
  bulkImportGuests,
  fetchPartyEventShell,
  fetchTwilioBalanceForEvent,
  sendGuestWhatsAppViaTwilio,
  sendWhatsApp,
  syncWhatsAppInviteTemplateStatus,
  updateEventFinanceLine,
} from '../services/api'
import { logUserActivity } from '../services/loggingApi'
import {
  hydratePartyShellCache,
  invalidatePartyEventStatsQueries,
  partyQueryKeys,
  PARTY_EVENT_STALE_MS,
  updateCachedPartyShellFinanceLines,
  updateCachedPartyShellGuests,
} from '../lib/partyEventQueries'
import { groupGuestsByIdentity, guestGroupKey, guestIdentityKey } from '../utils/guestIdentity'
import { findBestGuestGroupMatch, guestRowAnchorId, scoreGuestSearch } from '../utils/guestListSearch'
import { formatIsraelMobileE164 } from '../utils/whatsapp'
import { isTwilioWhatsappInviteTemplateApproved } from '../utils/twilioTemplateApproval'
import type { IncomeRecipientEditOption } from '../components/guest/IncomeRecipientSelect'
import {
  adminLabel,
  errStr,
  guestSnapshotAffectsPartyStats,
  RECIPIENT_SEL_PREFIX,
  sortGuestsLikeFetch,
} from './guestList/guestListPageHelpers'

const EMPTY_GUESTS: Guest[] = []
const EMPTY_FINANCE: EventFinanceLine[] = []
const EMPTY_ADMIN_USERS: AdminUserRow[] = []
const EMPTY_EVENT_STAFF: EventStaffRow[] = []

export function useGuestListPageModel() {
  const { currentEventId, currentEvent, loading: eventLoading, refreshEvents } = useEvent()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const eventQueryEnabled = Boolean(currentEventId)

  const partyShellQuery = useQuery({
    queryKey: currentEventId
      ? partyQueryKeys.partyShell(currentEventId)
      : (['event', 'none', 'partyShell'] as const),
    queryFn: async () => {
      const data = await fetchPartyEventShell(currentEventId!)
      hydratePartyShellCache(queryClient, currentEventId!, data)
      return data
    },
    enabled: eventQueryEnabled,
    staleTime: PARTY_EVENT_STALE_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })

  const guests = partyShellQuery.data?.guests ?? EMPTY_GUESTS
  const financeLines = partyShellQuery.data?.financeLines ?? EMPTY_FINANCE
  const adminUsers = partyShellQuery.data?.globalUsers ?? EMPTY_ADMIN_USERS
  const eventStaff = partyShellQuery.data?.eventStaff ?? EMPTY_EVENT_STAFF
  /** טעינה ראשונית (אין עדיין נתונים) — UI חוסם; רענון ברקע לא מפעיל את זה (Stale-While-Revalidate) */
  const loading = Boolean(currentEventId && partyShellQuery.isLoading)
  /** רענון שקט אחרי כניסה מלשונית / refetch */
  const listDataRefetching = Boolean(
    currentEventId && partyShellQuery.isFetching && !partyShellQuery.isLoading,
  )

  const [filterAdminId, setFilterAdminId] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const dataFetchError = useMemo(() => errStr(partyShellQuery.error) || null, [partyShellQuery.error])
  const displayError = error || dataFetchError
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newGuestRecipient, setNewGuestRecipient] = useState<string>('')
  const [newGuestPrice, setNewGuestPrice] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [pasteSubmitting, setPasteSubmitting] = useState(false)
  const [pasteMsg, setPasteMsg] = useState<string | null>(null)
  const [pasteErrorLog, setPasteErrorLog] = useState<string[] | null>(null)
  const [listNotice, setListNotice] = useState<string | null>(null)
  const [twilioSendingGuestId, setTwilioSendingGuestId] = useState<string | null>(null)
  /** מיון קבוצות: שם, זמן כניסה לפארטי, או created_at (הוספה לרשימה) */
  const [guestSortMode, setGuestSortMode] = useState<'name' | 'entry_time' | 'added_at'>('name')
  /** סינון לפי סטטוס שליחת הזמנה בוואטסאפ */
  const [guestInviteFilter, setGuestInviteFilter] = useState<'all' | 'unsent' | 'sent'>('all')
  /** סינון לפי כניסה לפארטי (לפי זהות/קבוצת כרטיסים) */
  const [guestEntryFilter, setGuestEntryFilter] = useState<'all' | 'entered' | 'pending'>('all')
  const [guestSearchQuery, setGuestSearchQuery] = useState('')
  const [pendingScrollToGroupKey, setPendingScrollToGroupKey] = useState<string | null>(null)
  const [searchFlashGroupKey, setSearchFlashGroupKey] = useState<string | null>(null)
  /** מנוע גלילה/הבהוב — debounce, כך שלא מריצים scroll על כל תו; הסינון ברשימה — חי לפי ‎`guestSearchQuery` */
  const debouncedSearchNav = useDebouncedValue(guestSearchQuery, 300)
  const [focusedGroupKey, setFocusedGroupKey] = useState<string | null>(null)
  const [mobileToast, setMobileToast] = useState<MobileToastState>(null)
  const toastIdRef = useRef(0)
  const visibleListRef = useRef<Guest[][]>([])
  const lastActionAt = useRef(0)
  /** הוספה/הסרה של כרטיס — UI לפי key; ref נגד לחיצה כפולה */
  const [ticketActionKey, setTicketActionKey] = useState<string | null>(null)
  const ticketActionBusyRef = useRef(false)

  const twilioTemplateApproved = useMemo(
    () => isTwilioWhatsappInviteTemplateApproved(currentEvent),
    [
      currentEvent?.id,
      currentEvent?.whatsapp_twilio_content_sid,
      currentEvent?.whatsapp_twilio_content_status,
      currentEvent?.whatsapp_twilio_placeholder_slots?.join(','),
    ],
  )

  /** סטטוס שמור במסד שעדיין יכול להתעדכן בטווילו אחרי אישור Meta */
  const twilioStatusMaybeStale = useMemo(() => {
    const st = (currentEvent?.whatsapp_twilio_content_status ?? '').trim().toLowerCase()
    if (!st) return true
    if (/\breceived\b/.test(st)) return true
    if (/\bpending\b/.test(st)) return true
    return false
  }, [currentEvent?.whatsapp_twilio_content_status])

  useEffect(() => {
    if (!currentEventId || !currentEvent) return
    const sid = (currentEvent.whatsapp_twilio_content_sid ?? '').trim()
    if (!sid.startsWith('HX')) return
    if (isTwilioWhatsappInviteTemplateApproved(currentEvent)) return
    if (!twilioStatusMaybeStale) return

    let cancelled = false
    void (async () => {
      try {
        await syncWhatsAppInviteTemplateStatus(currentEventId)
        if (cancelled) return
        await queryClient.invalidateQueries({ queryKey: partyQueryKeys.partyShell(currentEventId) })
        await refreshEvents()
      } catch {
        /* Twilio / רשת — נשארים עם הסטטוס המקומי */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    currentEventId,
    currentEvent,
    twilioStatusMaybeStale,
    refreshEvents,
    queryClient,
  ])

  const scannerRecipientOptions = useMemo(
    () =>
      eventStaff
        .filter((s) => s.role === 'scanner')
        .map((s) => {
          const u = adminUsers.find((a) => a.user_id === s.user_id)
          return {
            userId: s.user_id,
            label: u ? adminLabel(u) : s.email || s.user_id,
          }
        })
        .sort((a, b) => a.label.localeCompare(b.label, 'he')),
    [eventStaff, adminUsers],
  )

  /** שותפים בלבד — מקבלי תשלום (התאמות הכנסות) */
  const partnerRecipientRows = useMemo(
    () =>
      [...adminUsers]
        .filter((a) => a.is_partner)
        .sort((a, b) => adminLabel(a).localeCompare(adminLabel(b), 'he')),
    [adminUsers],
  )

  /** כמו ‎`firstPartnerId` ב־ייבוא מרוכז — שיוך «פייבוקס» */
  const payboxDelegateId = useMemo(() => {
    if (partnerRecipientRows.length === 0) return null
    const sorted = [...partnerRecipientRows].sort((a, b) => a.user_id.localeCompare(b.user_id))
    return sorted[0]!.user_id
  }, [partnerRecipientRows])

  /** «למי שולם» ב־filter: שותפים, פייבוקס, סלקטורים, תשלום בכניסה — מסונכרן ל־`income_recipient_kind` */
  const recipientFilterOptions = useMemo(() => {
    const seen = new Set<string>()
    const collected: { value: string; label: string }[] = []
    const push = (value: string, label: string) => {
      if (seen.has(value)) return
      seen.add(value)
      collected.push({ value, label })
    }

    for (const l of financeLines) {
      if (l.line_kind !== 'income') continue
      if (l.income_recipient_kind === 'paybox') {
        if (payboxDelegateId) push('__paybox__', 'פייבוקס')
        continue
      }
      if (l.income_recipient_kind === 'selector') {
        const id = l.recipient_admin_id
        const u = adminUsers.find((a) => a.user_id === id)
        const lab = u ? adminLabel(u) : `משתמש (${id.slice(0, 8)}…)`
        push(`${RECIPIENT_SEL_PREFIX}${id}`, `סלקטור · ${lab}`)
        continue
      }
      {
        const id = l.recipient_admin_id
        const u = adminUsers.find((a) => a.user_id === id)
        const lab = u ? adminLabel(u) : `משתמש (${id.slice(0, 8)}…)`
        push(id, lab)
      }
    }
    for (const a of partnerRecipientRows) {
      push(a.user_id, adminLabel(a))
    }
    if (payboxDelegateId) {
      push('__paybox__', 'פייבוקס')
    }
    for (const s of scannerRecipientOptions) {
      push(
        `${RECIPIENT_SEL_PREFIX}${s.userId}`,
        `סלקטור · ${s.label}`,
      )
    }
    if (guests.some((g) => g.source === 'pay_at_door')) {
      push('__door__', 'תשלום בכניסה (סלקטור)')
    }
    return [...collected].sort((a, b) => a.label.localeCompare(b.label, 'he'))
  }, [
    adminUsers,
    financeLines,
    partnerRecipientRows,
    payboxDelegateId,
    guests,
    scannerRecipientOptions,
  ])

  useEffect(() => {
    if (partnerRecipientRows.length === 0) return
    const u = user?.id
    const ok = u && partnerRecipientRows.some((a) => a.user_id === u)
    setNewGuestRecipient((prev) => {
      if (prev === '__paybox__') return prev
      if (prev.startsWith(RECIPIENT_SEL_PREFIX)) {
        const id = prev.slice(RECIPIENT_SEL_PREFIX.length)
        if (scannerRecipientOptions.some((s) => s.userId === id)) return prev
      }
      if (prev && partnerRecipientRows.some((a) => a.user_id === prev)) return prev
      if (ok) return u!
      return partnerRecipientRows[0]!.user_id
    })
  }, [user?.id, partnerRecipientRows, scannerRecipientOptions])

  useEffect(() => {
    if (partnerRecipientRows.length > 0) return
    if (scannerRecipientOptions.length === 0) return
    setNewGuestRecipient((prev) => {
      if (prev.startsWith(RECIPIENT_SEL_PREFIX)) {
        const id = prev.slice(RECIPIENT_SEL_PREFIX.length)
        if (scannerRecipientOptions.some((s) => s.userId === id)) return prev
      }
      return `${RECIPIENT_SEL_PREFIX}${scannerRecipientOptions[0]!.userId}`
    })
  }, [partnerRecipientRows.length, scannerRecipientOptions])

  useEffect(() => {
    if (filterAdminId === '__door__' && !guests.some((g) => g.source === 'pay_at_door')) {
      setFilterAdminId('')
    }
  }, [filterAdminId, guests])

  useEffect(() => {
    if (!currentEvent) return
    setNewGuestPrice(
      currentEvent.default_ticket_price === 0 ? '' : String(currentEvent.default_ticket_price),
    )
  }, [currentEvent?.id, currentEvent?.default_ticket_price])

  const showMobileToast = useCallback(
    (
      kind: 'ok' | 'err' | 'info',
      message: string,
      options?: { placement?: 'top' | 'center'; durationMs?: number },
    ) => {
      toastIdRef.current += 1
      setMobileToast({ kind, message, id: toastIdRef.current, ...options })
    },
    [],
  )

  const load = useCallback(() => {
    if (!currentEventId) return
    void queryClient.invalidateQueries({ queryKey: ['event', currentEventId] })
    void queryClient.invalidateQueries({ queryKey: partyQueryKeys.globalStaffUsers() })
  }, [currentEventId, queryClient])

  /** אחרי עדכון שורה/כרטיס — ממזג `Guest` בקאש בלי `fetch` של כל האירוע (כולל ‎`partyShell` — ממנו נגזרת הרשימה) */
  const persistGuestRows = useCallback(
    async (updated: Guest[]) => {
      if (updated.length === 0 || !currentEventId) return
      const uMap = new Map(updated.map((g) => [g.id, g]))
      const statsRelevant = updated.some((g) => {
        const b = guests.find((x) => x.id === g.id)
        return guestSnapshotAffectsPartyStats(b, g)
      })
      updateCachedPartyShellGuests(queryClient, currentEventId, (prev) =>
        sortGuestsLikeFetch(prev.map((g) => uMap.get(g.id) ?? g)),
      )
      if (statsRelevant) invalidatePartyEventStatsQueries(queryClient, currentEventId)
    },
    [currentEventId, queryClient, guests],
  )

  /** לאחר מחיקת כרטיס השרת עלול לעדכן שורות כספים — ריענון מלא של המעטפת + סטטיסטיקה */
  const refreshFinanceLinesOnly = useCallback(() => {
    if (!currentEventId) return
    void queryClient.invalidateQueries({ queryKey: partyQueryKeys.partyShell(currentEventId) })
    invalidatePartyEventStatsQueries(queryClient, currentEventId)
  }, [currentEventId, queryClient])

  /** אותן קבוצות כמו בהוספת אורח — לעריכת «למי שולם» בשורה */
  const incomeRecipientEditOptions = useMemo((): IncomeRecipientEditOption[] => {
    const out: IncomeRecipientEditOption[] = []
    if (payboxDelegateId) {
      out.push({ group: 'פייבוקס', value: '__paybox__', label: 'פייבוקס' })
    }
    for (const a of partnerRecipientRows) {
      out.push({ group: 'שותפים', value: a.user_id, label: adminLabel(a) })
    }
    for (const s of scannerRecipientOptions) {
      out.push({
        group: 'סלקטורים',
        value: `${RECIPIENT_SEL_PREFIX}${s.userId}`,
        label: s.label,
      })
    }
    return out
  }, [payboxDelegateId, partnerRecipientRows, scannerRecipientOptions])

  const incomeMetaForMembers = useCallback(
    (members: Guest[]) => {
      const g = members[0]!
      const k = guestIdentityKey(g.name, g.phone)
      const matches = financeLines.filter(
        (l) => l.line_kind === 'income' && guestIdentityKey(l.person_name, l.phone) === k,
      )
      if (matches.length === 0) {
        return {
          ids: [] as string[],
          amount: null as number | null,
          recipientLabel: null as string | null,
          recipientSelectValue: null as string | null,
        }
      }
      const primary = matches[0]!
      const rid = primary.recipient_admin_id
      const incKind = primary.income_recipient_kind
      let recipientSelectValue: string
      if (incKind === 'paybox') {
        recipientSelectValue = '__paybox__'
      } else if (incKind === 'selector') {
        recipientSelectValue = `${RECIPIENT_SEL_PREFIX}${rid}`
      } else {
        recipientSelectValue = rid
      }
      let recipientLabel: string
      if (incKind === 'paybox') {
        recipientLabel = 'פייבוקס'
      } else if (incKind === 'selector') {
        const userRow = adminUsers.find((a) => a.user_id === rid)
        const nm = userRow
          ? adminLabel(userRow)
          : `משתמש (${rid.slice(0, 8)}…)`
        recipientLabel = `סלקטור · ${nm}`
      } else {
        const userRow = adminUsers.find((a) => a.user_id === rid)
        recipientLabel = userRow
          ? adminLabel(userRow)
          : `משתמש (${rid.slice(0, 8)}…)`
      }
      return {
        ids: matches.map((x) => x.id),
        amount: primary.amount,
        recipientLabel,
        recipientSelectValue,
      }
    },
    [financeLines, adminUsers],
  )

  const saveIncomeAmountForMembers = useCallback(
    async (members: Guest[], amount: number) => {
      if (!currentEventId) return
      const { ids } = incomeMetaForMembers(members)
      if (ids.length === 0) return
      const rows: EventFinanceLine[] = []
      for (const id of ids) {
        rows.push(await updateEventFinanceLine(id, { amount }))
      }
      const u = new Map(rows.map((r) => [r.id, r]))
      updateCachedPartyShellFinanceLines(queryClient, currentEventId!, (prev) =>
        prev.map((l) => u.get(l.id) ?? l),
      )
      logUserActivity({
        kind: 'finance',
        action: 'income_amount_update',
        eventId: currentEventId,
        detail: {
          line_ids: ids,
          new_amount: amount,
          identity: members[0]
            ? { name: members[0].name, phone: members[0].phone }
            : undefined,
        },
      })
    },
    [currentEventId, incomeMetaForMembers, queryClient],
  )

  const saveIncomeRecipientForMembers = useCallback(
    async (members: Guest[], recipientValue: string) => {
      const meta = incomeMetaForMembers(members)
      const { ids, recipientSelectValue } = meta
      if (ids.length === 0 || !recipientValue || recipientValue === recipientSelectValue) return

      let incomeAdminId: string
      let incomeKind: IncomeRecipientKind
      if (recipientValue === '__paybox__') {
        if (!payboxDelegateId) {
          setError('אין שותף לשיוך «פייבוקס»')
          return
        }
        incomeAdminId = payboxDelegateId
        incomeKind = 'paybox'
      } else if (
        recipientValue.length > RECIPIENT_SEL_PREFIX.length &&
        recipientValue.startsWith(RECIPIENT_SEL_PREFIX)
      ) {
        incomeKind = 'selector'
        incomeAdminId = recipientValue.slice(RECIPIENT_SEL_PREFIX.length)
        if (!scannerRecipientOptions.some((s) => s.userId === incomeAdminId)) {
          setError('הסלקטור אינו מוגדר לאירוע')
          return
        }
      } else {
        incomeAdminId = recipientValue
        incomeKind = 'partner'
        if (!partnerRecipientRows.some((a) => a.user_id === incomeAdminId)) {
          setError('נמען לא מוכר כשותף')
          return
        }
      }

      setError(null)
      try {
        const rows: EventFinanceLine[] = []
        for (const id of ids) {
          rows.push(
            await updateEventFinanceLine(id, {
              recipient_admin_id: incomeAdminId,
              income_recipient_kind: incomeKind,
            }),
          )
        }
        if (currentEventId) {
          const u = new Map(rows.map((r) => [r.id, r]))
          updateCachedPartyShellFinanceLines(queryClient, currentEventId, (prev) =>
            prev.map((l) => u.get(l.id) ?? l),
          )
        }
        logUserActivity({
          kind: 'finance',
          action: 'income_recipient_update',
          eventId: currentEventId ?? null,
          detail: {
            line_ids: ids,
            income_kind: incomeKind,
            recipient_admin_id: incomeAdminId,
            identity: members[0]
              ? { name: members[0].name, phone: members[0].phone }
              : undefined,
          },
        })
      } catch (e) {
        const m = e instanceof Error ? e.message : 'שגיאה'
        setError(m)
        showMobileToast('err', m)
        hapticError()
        logUserActivity({
          kind: 'finance',
          action: 'income_recipient_update_error',
          eventId: currentEventId ?? null,
          detail: { line_ids: ids, error: m },
        })
      }
    },
    [
      currentEventId,
      incomeMetaForMembers,
      payboxDelegateId,
      queryClient,
      scannerRecipientOptions,
      partnerRecipientRows,
      showMobileToast,
    ],
  )

  /** ריענון כשחוזרים ללשונית / לאפליקציה — חשוב במיוחד בטלפון אחרי WhatsApp (Safari לפעמים לא מספיק עם visibility בלבד) */
  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | undefined
    function scheduleReload() {
      if (!currentEventId || document.visibilityState !== 'visible') return
      clearTimeout(debounce)
      debounce = setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ['event', currentEventId] })
        void queryClient.invalidateQueries({ queryKey: partyQueryKeys.globalStaffUsers() })
      }, 200)
    }
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) scheduleReload()
    }
    document.addEventListener('visibilitychange', scheduleReload)
    window.addEventListener('focus', scheduleReload)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      clearTimeout(debounce)
      document.removeEventListener('visibilitychange', scheduleReload)
      window.removeEventListener('focus', scheduleReload)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [currentEventId, queryClient])

  const groupedRows = useMemo(() => groupGuestsByIdentity(guests), [guests])

  const sortedGroupedRows = useMemo(() => {
    const groups = [...groupedRows]
    if (guestSortMode === 'name') {
      groups.sort((a, b) =>
        a[0]!.name.localeCompare(b[0]!.name, 'he', { sensitivity: 'base' }),
      )
      return groups
    }
    if (guestSortMode === 'added_at') {
      function firstAddedMs(members: Guest[]): number {
        return Math.min(...members.map((m) => new Date(m.created_at).getTime()))
      }
      groups.sort((a, b) => firstAddedMs(b) - firstAddedMs(a))
      return groups
    }
    function entrySortKey(members: Guest[]): { entered: boolean; t: number } {
      const enteredAt = members
        .map((m) => m.entered_at)
        .filter((x): x is string => x != null && x !== '')
      if (enteredAt.length > 0) {
        return {
          entered: true,
          t: Math.max(...enteredAt.map((s) => new Date(s).getTime())),
        }
      }
      const created = members.map((m) => new Date(m.created_at).getTime())
      return { entered: false, t: Math.max(...created) }
    }
    groups.sort((a, b) => {
      const ka = entrySortKey(a)
      const kb = entrySortKey(b)
      if (ka.entered !== kb.entered) return ka.entered ? -1 : 1
      return kb.t - ka.t
    })
    return groups
  }, [groupedRows, guestSortMode])

  const displayedGroupedRows = useMemo(() => {
    let rows = sortedGroupedRows
    if (guestInviteFilter === 'unsent') {
      rows = rows.filter((members) =>
        members.some((m) => m.whatsapp_invite_sent_at == null),
      )
    } else if (guestInviteFilter === 'sent') {
      rows = rows.filter((members) =>
        members.some((m) => m.whatsapp_invite_sent_at != null),
      )
    }
    if (guestEntryFilter === 'entered') {
      rows = rows.filter((members) => members.every((m) => m.status === 'entered'))
    } else if (guestEntryFilter === 'pending') {
      rows = rows.filter((members) => !members.every((m) => m.status === 'entered'))
    }
    return rows
  }, [guestInviteFilter, guestEntryFilter, sortedGroupedRows])

  const clearGuestListFilters = useCallback(() => {
    setGuestSearchQuery('')
    setFilterAdminId('')
    setGuestInviteFilter('all')
    setGuestEntryFilter('all')
  }, [])

  /** לפי שורות «הכנסה» (שם+פלאפון) — ‎`__paybox__` / ‎`__sel__`+מזהה / שותף; ‎`__door__` */
  const financeFilteredGroups = useMemo(() => {
    if (!filterAdminId) return displayedGroupedRows

    if (filterAdminId === '__door__') {
      return displayedGroupedRows.filter((members) => members[0]!.source === 'pay_at_door')
    }

    const isPayboxF = filterAdminId === '__paybox__'
    const isSelectorF =
      filterAdminId.length > RECIPIENT_SEL_PREFIX.length &&
      filterAdminId.startsWith(RECIPIENT_SEL_PREFIX)
    const selectorFilterId = isSelectorF ? filterAdminId.slice(RECIPIENT_SEL_PREFIX.length) : null

    const income = financeLines.filter((l) => l.line_kind === 'income')
    const byIdentity = new Map<string, EventFinanceLine[]>()
    for (const l of income) {
      const gk = guestIdentityKey(l.person_name, l.phone)
      const arr = byIdentity.get(gk) ?? []
      arr.push(l)
      byIdentity.set(gk, arr)
    }
    return displayedGroupedRows.filter((members) => {
      const g = members[0]!
      if (g.source === 'pay_at_door') return false
      const gk2 = guestIdentityKey(g.name, g.phone)
      const mlines = byIdentity.get(gk2) ?? []
      if (mlines.length === 0) return false
      return mlines.some((l) => {
        if (isPayboxF) {
          if (l.income_recipient_kind !== 'paybox') return false
        } else if (isSelectorF && selectorFilterId) {
          if (l.income_recipient_kind !== 'selector' || l.recipient_admin_id !== selectorFilterId) {
            return false
          }
        } else if (filterAdminId) {
          if (l.recipient_admin_id !== filterAdminId) return false
          if (l.income_recipient_kind === 'paybox' || l.income_recipient_kind === 'selector') {
            return false
          }
        }
        return true
      })
    })
  }, [displayedGroupedRows, financeLines, filterAdminId])

  /** סינון חי — כל שינוי תו (ללא debounce) */
  const searchFilteredGroups = useMemo(() => {
    const q = guestSearchQuery.trim()
    if (!q) return financeFilteredGroups
    const scored = financeFilteredGroups
      .map((members) => {
        const rep = members[0]!
        return { members, s: scoreGuestSearch(q, rep.name, rep.phone) }
      })
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
    return scored.map((x) => x.members)
  }, [financeFilteredGroups, guestSearchQuery])

  const sortedGroupedRowsForNavRef = useRef<Guest[][]>([])
  const searchFilteredForNavRef = useRef<Guest[][]>([])
  sortedGroupedRowsForNavRef.current = sortedGroupedRows
  searchFilteredForNavRef.current = searchFilteredGroups

  /** מוזמנים מהרשימה / תשלום בכניסה — אזורי תצוגה נפרדים */
  const { listGroups, doorGroups } = useMemo(() => {
    const list: Guest[][] = []
    const door: Guest[][] = []
    for (const m of searchFilteredGroups) {
      if (m[0]!.source === 'pay_at_door') door.push(m)
      else list.push(m)
    }
    door.sort(
      (a, b) => new Date(b[0]!.created_at).getTime() - new Date(a[0]!.created_at).getTime(),
    )
    return { listGroups: list, doorGroups: door }
  }, [searchFilteredGroups])

  useEffect(() => {
    visibleListRef.current = searchFilteredGroups
  }, [searchFilteredGroups])

  const guestListTableSummary = useMemo(() => {
    const groups = guestSearchQuery.trim() ? searchFilteredGroups : financeFilteredGroups
    let totalTickets = 0
    const byTicketCount = new Map<number, number>()
    for (const m of groups) {
      const c = m.length
      totalTickets += c
      byTicketCount.set(c, (byTicketCount.get(c) ?? 0) + 1)
    }
    const keys = [...byTicketCount.keys()].sort((a, b) => a - b)
    /** ticketCount = כרטיסים לאותה זהות (שם+טלפון); people = כמה זהויות כאלה */
    const breakdownParts = keys.map((ticketCount) => {
      const identitiesInBucket = byTicketCount.get(ticketCount)!
      if (ticketCount === 1) {
        if (identitiesInBucket === 1) return 'אדם אחד — כרטיס אחד'
        return `${identitiesInBucket} אנשים — כרטיס אחד`
      }
      if (identitiesInBucket === 1) {
        return `אדם אחד — ${ticketCount} כרטיסים`
      }
      return `${identitiesInBucket} אנשים — ${ticketCount} כרטיסים לכל אחד`
    })
    return {
      identities: groups.length,
      totalTickets,
      breakdownParts,
    }
  }, [guestSearchQuery, searchFilteredGroups, financeFilteredGroups])

  /** ספירה לפי כרטיס ולפי זהות (אדם) — כל הרשימה באירוע */
  const guestInviteOpenTotals = useMemo(() => {
    let totalTickets = 0
    let inviteSentTickets = 0
    let cardOpenedTickets = 0
    for (const g of guests) {
      totalTickets += 1
      if (g.whatsapp_invite_sent_at != null) inviteSentTickets += 1
      if (g.card_opened_at != null) cardOpenedTickets += 1
    }
    const groups = groupGuestsByIdentity(guests)
    const totalIdentities = groups.length
    let inviteSentIdentities = 0
    let cardOpenedIdentities = 0
    for (const members of groups) {
      if (members.some((m) => m.whatsapp_invite_sent_at != null)) inviteSentIdentities += 1
      if (members.some((m) => m.card_opened_at != null)) cardOpenedIdentities += 1
    }
    return {
      totalTickets,
      inviteSentTickets,
      cardOpenedTickets,
      totalIdentities,
      inviteSentIdentities,
      cardOpenedIdentities,
    }
  }, [guests])

  /** סיכום כניסה — לפי כרטיס, לכל האירוע */
  const guestEntrySnapshot = useMemo(() => {
    let entered = 0
    let pending = 0
    for (const g of guests) {
      if (g.status === 'entered') entered += 1
      else pending += 1
    }
    const idents = groupGuestsByIdentity(guests).length
    return { entered, pending, tickets: guests.length, identities: idents }
  }, [guests])

  async function handleAdd() {
    if (!currentEventId || !newName.trim() || !newPhone.trim()) return
    if (!newGuestRecipient) {
      setError('בחרו אדמין (מי שולם) או המתינו לטעינת הרשאות')
      return
    }
    let incomeAdminId: string
    let incomeKind: IncomeRecipientKind = 'partner'
    if (newGuestRecipient === '__paybox__') {
      if (!payboxDelegateId) {
        setError('אין שותף לשיוך «פייבוקס»')
        return
      }
      incomeAdminId = payboxDelegateId
      incomeKind = 'paybox'
    } else if (
      newGuestRecipient.length > RECIPIENT_SEL_PREFIX.length &&
      newGuestRecipient.startsWith(RECIPIENT_SEL_PREFIX)
    ) {
      incomeKind = 'selector'
      incomeAdminId = newGuestRecipient.slice(RECIPIENT_SEL_PREFIX.length)
      if (!scannerRecipientOptions.some((s) => s.userId === incomeAdminId)) {
        setError('הסלקטור אינו מוגדר לאירוע')
        return
      }
    } else {
      incomeAdminId = newGuestRecipient
      incomeKind = 'partner'
    }
    setError(null)
    try {
      const raw = newGuestPrice.trim().replace(',', '.')
      const parsed = raw === '' ? 0 : Number(raw)
      const amount = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
      const { guest, financeLine, wasFirstIdentityTicket } = await createGuest(
        newName.trim(),
        newPhone.trim(),
        currentEventId,
        {
          incomeRecipientAdminId: incomeAdminId,
          incomeRecipientKind: incomeKind,
          isPaid: false,
          amount,
        },
      )
      updateCachedPartyShellGuests(queryClient, currentEventId, (prev) =>
        sortGuestsLikeFetch([...prev, guest]),
      )
      if (financeLine) {
        updateCachedPartyShellFinanceLines(queryClient, currentEventId, (fPrev) => [financeLine, ...fPrev])
      }
      invalidatePartyEventStatsQueries(queryClient, currentEventId)
      setNewName('')
      setNewPhone('')
      if (currentEvent) {
        setNewGuestPrice(
          currentEvent.default_ticket_price === 0 ? '' : String(currentEvent.default_ticket_price),
        )
      }
      logUserActivity({
        kind: 'guest',
        action: 'create_single',
        eventId: currentEventId,
        detail: {
          guest_id: guest.id,
          name: guest.name,
          phone: guest.phone,
          amount,
          income_kind: incomeKind,
          income_admin_id: incomeAdminId,
          finance_line_id: financeLine?.id ?? null,
        },
      })

      /** שליחה אוטומטית רק אם: זהות ראשונה, תבנית מאושרת, מספר תקין, יתרת Twilio ≥ 2 (כשהבדיקה מצליחה) */
      let twilioBalanceAllowsSend = true
      try {
        const bal = await fetchTwilioBalanceForEvent(currentEventId)
        twilioBalanceAllowsSend = bal.balance >= 2
      } catch {
        /* אם לא הצלחנו לקרוא יתרה — ממשיכים לנסות; send-whatsapp יחסום ב-402 אם אין מספיק */
        twilioBalanceAllowsSend = true
      }

      if (
        wasFirstIdentityTicket &&
        currentEvent &&
        isTwilioWhatsappInviteTemplateApproved(currentEvent) &&
        formatIsraelMobileE164(guest.phone) &&
        twilioBalanceAllowsSend
      ) {
        setTwilioSendingGuestId(guest.id)
        try {
          const out = await sendGuestWhatsAppViaTwilio(currentEventId, guest.id)
          const shell = queryClient.getQueryData<PartyEventShell>(
            partyQueryKeys.partyShell(currentEventId),
          )
          const gList = shell?.guests ?? []
          await persistGuestRows(
            gList
              .filter((row) => out.marked_guest_ids.includes(row.id))
              .map((row) => ({
                ...row,
                whatsapp_invite_sent_at: out.sent_at,
                invite_sent_method: 'twilio',
                updated_at: out.sent_at,
                whatsapp_invite_twilio_sid: out.twilio_sid?.trim() ? out.twilio_sid.trim() : null,
                whatsapp_invite_twilio_status: (out.twilio_status ?? 'sent').toLowerCase(),
              })),
          )
          hapticSuccess()
          showMobileToast('ok', 'נשלחה הזמנה WhatsApp אוטומטית', { durationMs: 2400 })
          logUserActivity({
            kind: 'whatsapp',
            action: 'twilio_auto_after_create',
            eventId: currentEventId,
            detail: { guest_id: guest.id },
          })
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'שליחה אוטומטית נכשלה'
          hapticError()
          showMobileToast('err', msg, { durationMs: 3600 })
          logUserActivity({
            kind: 'whatsapp',
            action: 'twilio_auto_after_create_error',
            eventId: currentEventId,
            detail: { guest_id: guest.id, error: msg },
          })
        } finally {
          setTwilioSendingGuestId(null)
        }
      } else if (
        wasFirstIdentityTicket &&
        currentEvent &&
        isTwilioWhatsappInviteTemplateApproved(currentEvent) &&
        formatIsraelMobileE164(guest.phone) &&
        !twilioBalanceAllowsSend
      ) {
        showMobileToast('info', 'לא נשלחה הזמנה אוטומטית — יתרת Twilio מתחת לסף ($2). השתמשו בכפתור הווטסאפ או בהעתקה.', {
          durationMs: 4200,
        })
      }
    } catch (e) {
      const em = e instanceof Error ? e.message : 'שגיאה'
      setError(em)
      logUserActivity({
        kind: 'guest',
        action: 'create_single_error',
        eventId: currentEventId,
        detail: {
          error: em,
          name: newName.trim(),
          phone: newPhone.trim(),
          income_kind: incomeKind,
          income_admin_id: incomeAdminId,
        },
      })
    }
  }

  async function rowDeleteGroup(ids: string[]) {
    if (ids.length === 0) return
    const t = Date.now()
    if (t - lastActionAt.current < 320) return
    const g0 = guests.find((x) => x.id === ids[0])
    const gk = g0 ? guestGroupKey(g0) : null
    const msg =
      ids.length > 1
        ? `להסיר ${ids.length} כרטיסים לאותו אורח (שם וטלפון זהים) מהרשימה?`
        : 'להסיר אורח זה מהרשימה?'
    if (!window.confirm(msg)) return
    setError(null)
    try {
      lastActionAt.current = t
      const list = visibleListRef.current
      let nextKey: string | null = null
      if (gk) {
        const idx = list.findIndex((m) => guestGroupKey(m[0]!) === gk)
        if (idx >= 0) {
          if (idx < list.length - 1) {
            const next = list[idx + 1]!
            nextKey = guestGroupKey(next[0]!)
          } else if (idx > 0) {
            const prev = list[idx - 1]!
            nextKey = guestGroupKey(prev[0]!)
          }
        }
      }
      await deleteGuestsByIds(ids)
      updateCachedPartyShellGuests(queryClient, currentEventId!, (prev) =>
        prev.filter((g) => !ids.includes(g.id)),
      )
      refreshFinanceLinesOnly()
      if (gk && focusedGroupKey === gk) setFocusedGroupKey(null)
      if (nextKey) setPendingScrollToGroupKey(nextKey)
      hapticSuccess()
      showMobileToast('ok', ids.length > 1 ? 'הוסרו מהרשימה' : 'הוסר מהרשימה')
      logUserActivity({
        kind: 'guest',
        action: 'delete_group',
        eventId: currentEventId ?? null,
        detail: {
          guest_ids: ids,
          guest_names: ids.map((id) => guests.find((g) => g.id === id)?.name ?? id),
          count: ids.length,
        },
      })
    } catch (e) {
      hapticError()
      const m = e instanceof Error ? e.message : 'שגיאה'
      showMobileToast('err', m)
      setError(m)
      logUserActivity({
        kind: 'guest',
        action: 'delete_group_error',
        eventId: currentEventId ?? null,
        detail: { guest_ids: ids, error: m },
      })
    }
  }

  const onStatusCommitted = useCallback(
    (kind: 'entered' | 'pending' | 'partial', name: string) => {
      logUserActivity({
        kind: 'guest',
        action: 'status_committed_ui',
        eventId: currentEventId ?? null,
        detail: { kind, name },
      })
      hapticSuccess()
      showMobileToast('ok', kind === 'entered' ? 'נרשם כנכנס' : 'הסטטוס עודכן')
    },
    [currentEventId, showMobileToast],
  )

  const onGuestCardFocus = useCallback((key: string) => {
    setFocusedGroupKey(key)
  }, [])

  const handleAddTicket = useCallback(
    async (members: Guest[]) => {
      if (!currentEventId) return
      const g0 = members[0]!
      if (g0.source === 'pay_at_door') return
      if (!g0.name?.trim() || !g0.phone?.trim()) {
        setError('מלאו שם ופלאפון לפני הוספת כרטיס (שמירה בשדה)')
        hapticError()
        return
      }
      if (!window.confirm('להוסיף כרטיס נוסף לאותה זהות (אותו שם וטלפון)?')) return
      const gk = guestGroupKey(g0)
      if (ticketActionBusyRef.current) return
      ticketActionBusyRef.current = true
      setTicketActionKey(gk)
      setError(null)
      try {
        const name = g0.name.trim()
        const phone = g0.phone.trim()
        const idKey = guestIdentityKey(name, phone)
        const existingIncome = financeLines
          .filter(
            (l) =>
              l.line_kind === 'income' && guestIdentityKey(l.person_name, l.phone) === idKey,
          )
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
        const template = existingIncome[0]
        const rk = template?.income_recipient_kind
        const incomeRecipientKind: IncomeRecipientKind =
          rk === 'paybox' || rk === 'selector' || rk === 'partner' ? rk : 'partner'
        const createOpts =
          template?.recipient_admin_id?.trim()
            ? {
                skipIncomeLine: false as const,
                incomeRecipientAdminId: template.recipient_admin_id,
                incomeRecipientKind,
                amount: template.amount,
                isPaid: template.is_paid,
              }
            : { skipIncomeLine: true as const }
        const { guest, financeLine } = await createGuest(name, phone, currentEventId, createOpts)
        updateCachedPartyShellGuests(queryClient, currentEventId, (prev) =>
          sortGuestsLikeFetch([...prev, guest]),
        )
        if (financeLine) {
          updateCachedPartyShellFinanceLines(queryClient, currentEventId, (fPrev) => [
            financeLine,
            ...fPrev,
          ])
        }
        invalidatePartyEventStatsQueries(queryClient, currentEventId)
        hapticSuccess()
        showMobileToast('ok', 'נוסף כרטיס')
        logUserActivity({
          kind: 'guest',
          action: 'add_ticket',
          eventId: currentEventId,
          detail: {
            base_guest_id: g0.id,
            name,
            phone,
            new_guest_id: guest.id,
            finance_line_id: financeLine?.id ?? null,
          },
        })
      } catch (e) {
        hapticError()
        const em = e instanceof Error ? e.message : 'שגיאה'
        setError(em)
        logUserActivity({
          kind: 'guest',
          action: 'add_ticket_error',
          eventId: currentEventId,
          detail: { base_guest_id: g0.id, error: em },
        })
      } finally {
        ticketActionBusyRef.current = false
        setTicketActionKey(null)
      }
    },
    [currentEventId, financeLines, queryClient, showMobileToast],
  )

  const handleRemoveOneTicket = useCallback(
    async (members: Guest[]) => {
      if (members.length <= 1) return
      const g0 = members[0]!
      if (g0.source === 'pay_at_door') return
      if (!window.confirm(`להסיר כרטיס אחד מאותה זהות? יישארו ${members.length - 1} כרטיסים.`)) return
      const gk = guestGroupKey(g0)
      if (ticketActionBusyRef.current) return
      ticketActionBusyRef.current = true
      setTicketActionKey(gk)
      setError(null)
      try {
        const sorted = [...members].sort((a, b) => a.created_at.localeCompare(b.created_at))
        const toRemove = sorted[sorted.length - 1]!
        await deleteGuestsByIds([toRemove.id])
        updateCachedPartyShellGuests(queryClient, currentEventId!, (prev) =>
          prev.filter((g) => g.id !== toRemove.id),
        )
        refreshFinanceLinesOnly()
        hapticSuccess()
        showMobileToast('ok', 'הוסר כרטיס')
        logUserActivity({
          kind: 'guest',
          action: 'remove_ticket',
          eventId: currentEventId ?? null,
          detail: {
            removed_guest_id: toRemove.id,
            name: toRemove.name,
            phone: toRemove.phone,
            remaining_in_group: members.length - 1,
          },
        })
      } catch (e) {
        hapticError()
        const em = e instanceof Error ? e.message : 'שגיאה'
        setError(em)
        logUserActivity({
          kind: 'guest',
          action: 'remove_ticket_error',
          eventId: currentEventId ?? null,
          detail: { error: em },
        })
      } finally {
        ticketActionBusyRef.current = false
        setTicketActionKey(null)
      }
    },
    [currentEventId, queryClient, refreshFinanceLinesOnly, showMobileToast],
  )

  async function rowCopyWhatsAppMessage(id: string) {
    setError(null)
    try {
      const data = await sendWhatsApp(id, { markSent: false })
      await navigator.clipboard.writeText(data.message)
      showMobileToast('info', 'ההודעה הועתקה ללוח — אפשר להדביק בוואטסאפ ידנית.', {
        placement: 'center',
        durationMs: 1000,
      })
      const g = guests.find((x) => x.id === id)
      logUserActivity({
        kind: 'whatsapp',
        action: 'copy_message_preview',
        eventId: currentEventId ?? null,
        detail: {
          guest_id: id,
          guest_name: g?.name,
          phone: g?.phone,
          message_length: data.message.length,
          mark_sent: false,
        },
      })
    } catch (e) {
      const em = e instanceof Error ? e.message : 'שגיאה בהעתקה'
      setError(em)
      logUserActivity({
        kind: 'whatsapp',
        action: 'copy_message_preview_error',
        eventId: currentEventId ?? null,
        detail: { guest_id: id, error: em },
      })
    }
  }

  async function rowCopyGuestPhoneE164(id: string) {
    setError(null)
    const g = guests.find((x) => x.id === id)
    if (!g) {
      setError('לא נמצא אורח')
      return
    }
    const formatted = formatIsraelMobileE164(g.phone)
    if (!formatted) {
      showMobileToast('err', 'מספר הטלפון לא מזוהה כנייד ישראלי (05…) להעתקה')
      hapticError()
      logUserActivity({
        kind: 'guest',
        action: 'copy_phone_invalid',
        eventId: currentEventId ?? null,
        detail: { guest_id: id, raw_phone: g.phone },
      })
      return
    }
    try {
      await navigator.clipboard.writeText(formatted)
      showMobileToast('info', `הועתק ללוח: ${formatted}`, { placement: 'center', durationMs: 1600 })
      hapticSuccess()
      logUserActivity({
        kind: 'guest',
        action: 'copy_phone_e164',
        eventId: currentEventId ?? null,
        detail: { guest_id: id, guest_name: g.name, e164: formatted },
      })
    } catch (e) {
      hapticError()
      const em = e instanceof Error ? e.message : 'לא ניתן להעתיק ללוח'
      setError(em)
      logUserActivity({
        kind: 'guest',
        action: 'copy_phone_e164_error',
        eventId: currentEventId ?? null,
        detail: { guest_id: id, error: em },
      })
    }
  }

  async function rowSendTwilio(guestId: string) {
    if (!currentEventId) {
      throw new Error('אין אירוע פעיל')
    }
    if (!isTwilioWhatsappInviteTemplateApproved(currentEvent)) {
      showMobileToast(
        'err',
        'שליחת WhatsApp דרך Twilio זמינה רק אחרי אישור תבנית ההודעה ב-Meta. עברו ללשונית «וואטסאפ».',
        { placement: 'center', durationMs: 2600 },
      )
      hapticError()
      logUserActivity({
        kind: 'whatsapp',
        action: 'twilio_blocked_template',
        eventId: currentEventId,
        detail: { guest_id: guestId },
      })
      throw new Error('template_not_approved')
    }
    const g = guests.find((x) => x.id === guestId)
    if (g?.source === 'pay_at_door') {
      showMobileToast('err', 'אין מספר טלפון לתשלום בכניסה')
      hapticError()
      logUserActivity({
        kind: 'whatsapp',
        action: 'twilio_blocked_pay_at_door',
        eventId: currentEventId,
        detail: { guest_id: guestId },
      })
      throw new Error('pay_at_door')
    }
    setError(null)
    setTwilioSendingGuestId(guestId)
    try {
      const out = await sendGuestWhatsAppViaTwilio(currentEventId, guestId)
      const shell = queryClient.getQueryData<PartyEventShell>(
        partyQueryKeys.partyShell(currentEventId),
      )
      const gList = shell?.guests ?? []
      await persistGuestRows(
        gList
          .filter((guest) => out.marked_guest_ids.includes(guest.id))
          .map((guest) => ({
            ...guest,
            whatsapp_invite_sent_at: out.sent_at,
            invite_sent_method: 'twilio',
            updated_at: out.sent_at,
            whatsapp_invite_twilio_sid: out.twilio_sid?.trim() ? out.twilio_sid.trim() : null,
            whatsapp_invite_twilio_status: (out.twilio_status ?? 'sent').toLowerCase(),
          })),
      )
      hapticSuccess()
      logUserActivity({
        kind: 'whatsapp',
        action: 'twilio_send_ok',
        eventId: currentEventId,
        detail: {
          guest_id: guestId,
          guest_name: g?.name,
          phone: g?.phone,
          twilio_response: out,
        },
      })
    } catch (e) {
      hapticError()
      const msg = e instanceof Error ? e.message : 'שגיאה בשליחת Twilio'
      setError(msg)
      logUserActivity({
        kind: 'whatsapp',
        action: 'twilio_send_error',
        eventId: currentEventId,
        detail: { guest_id: guestId, guest_name: g?.name, error: msg },
      })
      throw e instanceof Error ? e : new Error(msg)
    } finally {
      setTwilioSendingGuestId(null)
    }
  }

  async function onPasteBulk() {
    if (!currentEventId || !pasteText.trim() || pasteSubmitting) return
    setError(null)
    setPasteMsg(null)
    setPasteErrorLog(null)
    setPasteSubmitting(true)
    try {
      const result = await bulkImportGuests({ text: pasteText, eventId: currentEventId })
      if (!result.ok && result.added === 0 && result.errors.length > 0) {
        setPasteErrorLog(result.errors)
        logUserActivity({
          kind: 'guest',
          action: 'paste_bulk_validation_errors',
          eventId: currentEventId,
          detail: {
            errors: result.errors,
            input_line_count: pasteText.split(/\r?\n/).length,
            input_char_count: pasteText.length,
          },
        })
        return
      }
      setPasteText('')
      const parts: string[] = []
      if (result.added > 0) {
        parts.push(
          result.added === 1 ? 'נוסף כרטיס אחד' : `נוספו ${result.added} כרטיסים`,
        )
      }
      if (result.skipped > 0) {
        parts.push(
          result.skipped === 1 ? 'שורה כפולה דולגה' : `דולגו ${result.skipped} שורות כפולות`,
        )
      }
      if (result.queuedForWhatsapp > 0) {
        parts.push(
          result.queuedForWhatsapp === 1
            ? 'הוזמנה שליחת WhatsApp אחת לתור (עד ~10 דק׳)'
            : `${result.queuedForWhatsapp} הזמנות בוצעו לתור WhatsApp (פיזור עד ~10 דק׳)`,
        )
      }
      if (parts.length === 0) {
        parts.push('לא נוספו שורות — רק שורות ריקות או אין תוכן')
      }
      setPasteMsg(parts.join(' · '))
      if (result.errors.length > 0) {
        setPasteErrorLog(result.errors)
      } else {
        setPasteErrorLog(null)
      }
      if (result.added > 0 && result.createdGuests.length > 0) {
        updateCachedPartyShellGuests(queryClient, currentEventId, (prev) => {
          const existing = new Set(prev.map((g) => g.id))
          const toAdd = result.createdGuests.filter((g) => !existing.has(g.id))
          return sortGuestsLikeFetch([...prev, ...toAdd])
        })
        if (result.financeLinesCreated.length > 0) {
          updateCachedPartyShellFinanceLines(queryClient, currentEventId, (fp) => {
            const have = new Set(fp.map((l) => l.id))
            const toAdd = result.financeLinesCreated.filter((l) => !have.has(l.id))
            return [...toAdd, ...fp]
          })
        }
        invalidatePartyEventStatsQueries(queryClient, currentEventId)
      }
      logUserActivity({
        kind: 'guest',
        action: 'paste_bulk_done',
        eventId: currentEventId,
        detail: {
          added: result.added,
          skipped: result.skipped,
          queued_for_whatsapp: result.queuedForWhatsapp,
          created_guest_ids: result.createdGuests.map((g) => g.id),
          finance_line_ids: result.financeLinesCreated.map((l) => l.id),
          message: parts.join(' · '),
          errors: result.errors,
        },
      })
    } catch (e) {
      const em = e instanceof Error ? e.message : 'שגיאה בהוספה מרשימה'
      setError(em)
      logUserActivity({
        kind: 'guest',
        action: 'paste_bulk_error',
        eventId: currentEventId,
        detail: { error: em, input_char_count: pasteText.length },
      })
    } finally {
      setPasteSubmitting(false)
    }
  }

  function runGuestSearchNavigation(
    qRaw: string,
    options: { showEmptyMessage: boolean; queryForMatch: string },
  ) {
    const q = qRaw.trim()
    setError(null)
    if (!q) {
      if (options.showEmptyMessage) {
        setListNotice('הקלידו טקסט לחיפוש')
      }
      setPendingScrollToGroupKey(null)
      setSearchFlashGroupKey(null)
      return
    }
    setListNotice(null)
    const matchQ = options.queryForMatch.trim()
    const best = findBestGuestGroupMatch(matchQ, sortedGroupedRowsForNavRef.current)
    if (!best) {
      setListNotice('לא נמצאה התאמה.')
      setPendingScrollToGroupKey(null)
      setSearchFlashGroupKey(null)
      return
    }
    const gk = guestGroupKey(best[0]!)
    const inDisplayed = searchFilteredForNavRef.current.some(
      (m) => guestGroupKey(m[0]!) === gk,
    )
    if (!inDisplayed) {
      const anyInviteSent = best.some((m) => m.whatsapp_invite_sent_at != null)
      const allEnteredRow = best.every((m) => m.status === 'entered')
      let notice = false
      if (guestInviteFilter === 'unsent' && anyInviteSent) {
        setGuestInviteFilter('all')
        notice = true
      }
      if (guestInviteFilter === 'sent' && !anyInviteSent) {
        setGuestInviteFilter('all')
        notice = true
      }
      if (guestEntryFilter === 'entered' && !allEnteredRow) {
        setGuestEntryFilter('all')
        notice = true
      }
      if (guestEntryFilter === 'pending' && allEnteredRow) {
        setGuestEntryFilter('all')
        notice = true
      }
      if (filterAdminId) {
        setFilterAdminId('')
        notice = true
      }
      if (notice) {
        setListNotice('מוצגת הרשימה המלאה — גלילה לשורה המתאימה.')
      }
    }
    setPendingScrollToGroupKey(gk)
    setSearchFlashGroupKey(gk)
  }

  function handleGuestSearch() {
    runGuestSearchNavigation(guestSearchQuery, {
      showEmptyMessage: true,
      queryForMatch: guestSearchQuery,
    })
  }

  // גלילה + הבהוב אחרי debounce (כשמפסיקים להקליד) — בלי scroll על כל אות; הסינון כבר בזמן אמת
  useEffect(() => {
    runGuestSearchNavigation(debouncedSearchNav, {
      showEmptyMessage: false,
      queryForMatch: debouncedSearchNav,
    })
  }, [debouncedSearchNav])

  useEffect(() => {
    if (!pendingScrollToGroupKey) return
    const id = guestRowAnchorId(pendingScrollToGroupKey)
    const t = window.setTimeout(() => {
      const el = document.getElementById(id)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      setPendingScrollToGroupKey(null)
    }, 80)
    return () => clearTimeout(t)
  }, [pendingScrollToGroupKey, searchFilteredGroups, loading, guestInviteFilter, guestEntryFilter])

  useEffect(() => {
    if (!searchFlashGroupKey) return
    const t = window.setTimeout(() => setSearchFlashGroupKey(null), 2600)
    return () => clearTimeout(t)
  }, [searchFlashGroupKey])

  const listDisabled = !currentEventId || eventLoading
  const searchDisabled = listDisabled || loading
  return {
    adminLabel,
    currentEventId,
    currentEvent,
    eventLoading,
    user,
    guests,
    financeLines,
    adminUsers,
    filterAdminId,
    setFilterAdminId,
    recipientFilterOptions,
    loading,
    listDataRefetching,
    error: displayError,
    setError,
    newName,
    setNewName,
    newPhone,
    setNewPhone,
    newGuestRecipient,
    setNewGuestRecipient,
    newGuestPrice,
    setNewGuestPrice,
    pasteText,
    setPasteText,
    pasteSubmitting,
    setPasteSubmitting,
    pasteMsg,
    setPasteMsg,
    pasteErrorLog,
    setPasteErrorLog,
    listNotice,
    setListNotice,
    twilioSendingGuestId,
    twilioTemplateApproved,
    guestSortMode,
    setGuestSortMode,
    guestInviteFilter,
    setGuestInviteFilter,
    guestEntryFilter,
    setGuestEntryFilter,
    clearGuestListFilters,
    guestSearchQuery,
    setGuestSearchQuery,
    pendingScrollToGroupKey,
    setPendingScrollToGroupKey,
    searchFlashGroupKey,
    setSearchFlashGroupKey,
    focusedGroupKey,
    setFocusedGroupKey,
    mobileToast,
    setMobileToast,
    toastIdRef,
    visibleListRef,
    lastActionAt,
    ticketActionKey,
    setTicketActionKey,
    ticketActionBusyRef,
    partnerRecipientRows,
    scannerRecipientOptions,
    payboxDelegateId,
    showMobileToast,
    load,
    persistGuestRows,
    incomeMetaForMembers,
    incomeRecipientEditOptions,
    saveIncomeAmountForMembers,
    saveIncomeRecipientForMembers,
    groupedRows,
    sortedGroupedRows,
    displayedGroupedRows,
    financeFilteredGroups,
    searchFilteredGroups,
    listGroups,
    doorGroups,
    guestListTableSummary,
    guestInviteOpenTotals,
    guestEntrySnapshot,
    handleAdd,
    rowDeleteGroup,
    onStatusCommitted,
    onGuestCardFocus,
    handleAddTicket,
    handleRemoveOneTicket,
    rowCopyWhatsAppMessage,
    rowCopyGuestPhoneE164,
    rowSendTwilio,
    onPasteBulk,
    handleGuestSearch,
    listDisabled,
    searchDisabled
  }
}
