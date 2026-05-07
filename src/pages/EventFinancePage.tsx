import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { useEvent } from '../context/EventContext'
import {
  hydrateFinanceShellCache,
  partyQueryKeys,
  PARTY_EVENT_STALE_MS,
  syncFinanceLinesAcrossEventCaches,
} from '../lib/partyEventQueries'
import type { EventFinanceLine } from '../types/finance'
import type { AdminUserRow } from '../types/admin'
import {
  deleteEventFinanceLine,
  fetchFinancePageShell,
  insertEventFinanceLine,
  updateEventCardTexts,
  updateEventFinanceLine,
} from '../services/api'
import type { EventStaffRow } from '../types/event'
import { computeEqualizingTransfers, EQUAL_SPLIT_PAYBOX_LABEL } from '../utils/financeEqualSplit'
import { financeAdminLabel as adminLabel, formatNis } from './eventFinance/eventFinanceFormat'

type PerAdminRow = {
  key: string
  rowKind: 'paybox' | 'partner' | 'selector' | 'other'
  adminId: string
  label: string
  incomeSum: number
  incomeCount: number
  expenseSum: number
  expenseCount: number
  transferDelta: number
  net: number
}

const EMPTY_LINES: EventFinanceLine[] = []
const EMPTY_ADMINS: AdminUserRow[] = []
const EMPTY_STAFF: EventStaffRow[] = []

export function EventFinancePage() {
  const { currentEventId, currentEvent, loading: eventLoading, refreshEvents } = useEvent()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const finEnabled = Boolean(currentEventId) && !eventLoading

  const financeShellQuery = useQuery({
    queryKey: currentEventId
      ? partyQueryKeys.eventFinanceShell(currentEventId)
      : (['event', 'none', 'financePageShell'] as const),
    queryFn: async () => {
      const data = await fetchFinancePageShell(currentEventId!)
      hydrateFinanceShellCache(queryClient, currentEventId!, data)
      return data
    },
    enabled: finEnabled,
    staleTime: PARTY_EVENT_STALE_MS,
    refetchOnWindowFocus: true,
  })

  const lines = financeShellQuery.data?.financeLines ?? EMPTY_LINES
  const admins = financeShellQuery.data?.adminUsers ?? EMPTY_ADMINS
  const eventStaff = financeShellQuery.data?.eventStaff ?? EMPTY_STAFF
  const loading = Boolean(
    currentEventId && !eventLoading && financeShellQuery.isLoading,
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [expenseLabel, setExpenseLabel] = useState('')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseRecipient, setExpenseRecipient] = useState<string>('')

  const [defaultTicketPrice, setDefaultTicketPrice] = useState('')
  const [savingDefaultTicket, setSavingDefaultTicket] = useState(false)

  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<{
    person_name: string
    phone: string
    amount: string
    recipient_admin_id: string
  } | null>(null)

  const [payoutFromId, setPayoutFromId] = useState('')
  const [payoutToId, setPayoutToId] = useState('')
  const [payoutAmount, setPayoutAmount] = useState('')
  const [payoutReason, setPayoutReason] = useState('')

  const partnerOnlyRows = useMemo(
    () =>
      [...admins].filter((a) => a.is_partner).sort((a, b) => adminLabel(a).localeCompare(adminLabel(b), 'he')),
    [admins],
  )

  const scannerStaffForEvent = useMemo(
    () => eventStaff.filter((s) => s.role === 'scanner'),
    [eventStaff],
  )

  const scannerStaffIdSet = useMemo(
    () => new Set(scannerStaffForEvent.map((s) => s.user_id)),
    [scannerStaffForEvent],
  )

  /** כמו בניהול אורחים: נמען טכני לתשלומי «פייבוקס» — בפועל שותף אחד, ב־UI מוצג כישות «פייבוקס» */
  const payboxDelegateId = useMemo(() => {
    if (partnerOnlyRows.length > 0) {
      const sortedPartners = [...partnerOnlyRows].sort((a, b) => a.user_id.localeCompare(b.user_id))
      return sortedPartners[0]!.user_id
    }
    if (admins.length > 0) {
      const sortedAdmins = [...admins].sort((a, b) => a.user_id.localeCompare(b.user_id))
      return sortedAdmins[0]!.user_id
    }
    return null
  }, [partnerOnlyRows, admins])

  const fallbackPayboxDelegateId = useMemo(() => {
    if (!payboxDelegateId) return null
    const sortedAdmins = [...admins].sort((a, b) => a.user_id.localeCompare(b.user_id))
    return sortedAdmins.find((a) => a.user_id !== payboxDelegateId)?.user_id ?? null
  }, [admins, payboxDelegateId])

  type InternalTransferParticipant = {
    optionId: string
    adminId: string
    label: string
  }

  /** כל אדמין באירוע + פייבוקס (כישות נפרדת ב־UI) — להעברות מ־ / ל־ */
  const internalTransferParticipants = useMemo(() => {
    const seen = new Set<string>()
    const rows: InternalTransferParticipant[] = []
    function add(optionId: string, adminId: string, label: string) {
      if (!optionId || !adminId || seen.has(optionId)) return
      seen.add(optionId)
      rows.push({ optionId, adminId, label })
    }
    for (const a of admins) {
      add(a.user_id, a.user_id, adminLabel(a))
    }
    if (payboxDelegateId) {
      add('paybox', payboxDelegateId, 'פייבוקס')
    }
    rows.sort((a, b) => a.label.localeCompare(b.label, 'he'))
    return rows
  }, [admins, payboxDelegateId])

  const dataErr = financeShellQuery.error
    ? financeShellQuery.error instanceof Error
      ? financeShellQuery.error.message
      : 'שגיאה'
    : null
  const displayError = error || dataErr

  const expensePayerOptions = useMemo(() => {
    const rows = partnerOnlyRows.map((a) => ({
      optionId: a.user_id,
      adminId: a.user_id,
      label: adminLabel(a),
    }))
    if (payboxDelegateId) {
      rows.push({ optionId: 'paybox', adminId: payboxDelegateId, label: 'פייבוקס' })
    }
    rows.sort((a, b) => a.label.localeCompare(b.label, 'he'))
    return rows
  }, [partnerOnlyRows, payboxDelegateId])

  useEffect(() => {
    if (expensePayerOptions.length === 0) {
      setExpenseRecipient('')
      return
    }
    const u = user?.id
    const ok = u && expensePayerOptions.some((a) => a.optionId === u)
    setExpenseRecipient((prev) => {
      if (prev && expensePayerOptions.some((a) => a.optionId === prev)) return prev
      if (ok) return u!
      const firstNonPaybox = expensePayerOptions.find((a) => a.optionId !== 'paybox')
      return (firstNonPaybox ?? expensePayerOptions[0])!.optionId
    })
  }, [user?.id, expensePayerOptions])

  useEffect(() => {
    if (internalTransferParticipants.length === 0) {
      setPayoutFromId('')
      return
    }
    setPayoutFromId((prev) =>
      prev && internalTransferParticipants.some((p) => p.optionId === prev)
        ? prev
        : internalTransferParticipants[0]!.optionId,
    )
  }, [internalTransferParticipants])

  useEffect(() => {
    if (internalTransferParticipants.length < 2) {
      setPayoutToId('')
      return
    }
    setPayoutToId((prev) => {
      const okPrev =
        prev &&
        internalTransferParticipants.some((p) => p.optionId === prev) &&
        prev !== payoutFromId
      if (okPrev) return prev
      const alt = internalTransferParticipants.find((p) => p.optionId !== payoutFromId)
      return alt?.optionId ?? ''
    })
  }, [internalTransferParticipants, payoutFromId])

  useEffect(() => {
    if (!currentEvent) {
      setDefaultTicketPrice('')
      return
    }
    setDefaultTicketPrice(
      currentEvent.default_ticket_price === 0 ? '' : String(currentEvent.default_ticket_price),
    )
  }, [currentEvent?.id, currentEvent?.default_ticket_price])

  const totals = useMemo(() => {
    let inc = 0
    let exp = 0
    for (const l of lines) {
      if (l.line_kind === 'income') inc += l.amount
      else exp += l.amount
    }
    return { inc, exp, net: inc - exp }
  }, [lines])

  const expenseLines = useMemo(() => lines.filter((l) => l.line_kind === 'expense'), [lines])

  const internalTransferLines = useMemo(
    () => lines.filter((l) => l.line_kind === 'internal_transfer'),
    [lines],
  )

  const internalTransfersTotal = useMemo(
    () => internalTransferLines.reduce((sum, l) => sum + l.amount, 0),
    [internalTransferLines],
  )

  const perAdminRows: PerAdminRow[] = useMemo(() => {
    const partnerIdSet = new Set(partnerOnlyRows.map((a) => a.user_id))
    const partner = new Map<
      string,
      {
        income: number
        incomeCount: number
        expense: number
        expenseCount: number
        transferIn: number
        transferOut: number
      }
    >()
    for (const a of partnerOnlyRows) {
      partner.set(a.user_id, {
        income: 0,
        incomeCount: 0,
        expense: 0,
        expenseCount: 0,
        transferIn: 0,
        transferOut: 0,
      })
    }
    const selector = new Map<
      string,
      {
        income: number
        incomeCount: number
        expense: number
        expenseCount: number
        transferIn: number
        payoutOut: number
      }
    >()
    const other = new Map<
      string,
      {
        income: number
        incomeCount: number
        expense: number
        expenseCount: number
        transferIn: number
        transferOut: number
      }
    >()
    function ensure(
      m: Map<
        string,
        {
          income: number
          incomeCount: number
          expense: number
          expenseCount: number
          transferIn: number
          transferOut: number
        }
      >,
      id: string,
    ) {
      if (!m.has(id)) {
        m.set(id, { income: 0, incomeCount: 0, expense: 0, expenseCount: 0, transferIn: 0, transferOut: 0 })
      }
      return m.get(id)!
    }
    function ensureSelector(id: string) {
      if (!selector.has(id)) {
        selector.set(id, { income: 0, incomeCount: 0, expense: 0, expenseCount: 0, transferIn: 0, payoutOut: 0 })
      }
      return selector.get(id)!
    }
    let payIncome = 0
    let payIC = 0
    let payExpense = 0
    let payEC = 0
    let payTransferIn = 0
    let payTransferOut = 0
    for (const l of lines) {
      if (l.line_kind === 'income') {
        if (l.income_recipient_kind === 'paybox') {
          payIncome += l.amount
          payIC += 1
        } else if (l.income_recipient_kind === 'selector') {
          const c = ensureSelector(l.recipient_admin_id)
          c.income += l.amount
          c.incomeCount += 1
        } else {
          const id = l.recipient_admin_id
          if (partnerIdSet.has(id) && partner.has(id)) {
            const c = partner.get(id)!
            c.income += l.amount
            c.incomeCount += 1
          } else {
            const c = ensure(other, id)
            c.income += l.amount
            c.incomeCount += 1
          }
        }
      } else if (l.line_kind === 'expense') {
        if (l.income_recipient_kind === 'paybox') {
          payExpense += l.amount
          payEC += 1
          continue
        }
        const id = l.recipient_admin_id
        if (partnerIdSet.has(id) && partner.has(id)) {
          const c = partner.get(id)!
          c.expense += l.amount
          c.expenseCount += 1
        } else {
          const c = ensure(other, id)
          c.expense += l.amount
          c.expenseCount += 1
        }
      } else if (l.line_kind === 'internal_transfer') {
        const fromIsPaybox = l.transfer_from_kind === 'paybox'
        const toIsPaybox = l.income_recipient_kind === 'paybox'
        const fromId = l.transfer_from_admin_id
        const toId = l.recipient_admin_id
        if ((!fromIsPaybox && !fromId) || !toId || (fromId === toId && !fromIsPaybox && !toIsPaybox)) continue
        if (toIsPaybox) {
          payTransferIn += l.amount
          payIncome += l.amount
          payIC += 1
        } else if (partnerIdSet.has(toId) && partner.has(toId)) {
          partner.get(toId)!.transferIn += l.amount
          partner.get(toId)!.income += l.amount
        } else if (scannerStaffIdSet.has(toId)) {
          ensureSelector(toId).transferIn += l.amount
          ensureSelector(toId).income += l.amount
        } else {
          ensure(other, toId).transferIn += l.amount
          ensure(other, toId).income += l.amount
        }
        if (fromIsPaybox) {
          payTransferOut += l.amount
        } else if (fromId && scannerStaffIdSet.has(fromId)) {
          ensureSelector(fromId).payoutOut += l.amount
        } else if (fromId && partnerIdSet.has(fromId) && partner.has(fromId)) {
          partner.get(fromId)!.transferOut += l.amount
        } else if (fromId) {
          ensure(other, fromId).transferOut += l.amount
        }
      }
    }
    const rows: PerAdminRow[] = []
    if (payIC > 0 || payEC > 0) {
      rows.push({
        key: 'income:paybox',
        rowKind: 'paybox',
        adminId: payboxDelegateId ?? 'paybox',
        label: 'פייבוקס',
        incomeSum: payIncome,
        incomeCount: payIC,
        expenseSum: payExpense,
        expenseCount: payEC,
        transferDelta: payTransferIn - payTransferOut,
        net: payIncome - payExpense - payTransferOut,
      })
    }
    for (const a of partnerOnlyRows) {
      const v = partner.get(a.user_id)!
      const net = v.income - v.expense - v.transferOut
      rows.push({
        key: `p:${a.user_id}`,
        rowKind: 'partner',
        adminId: a.user_id,
        label: adminLabel(a),
        incomeSum: v.income,
        incomeCount: v.incomeCount,
        expenseSum: v.expense,
        expenseCount: v.expenseCount,
        transferDelta: v.transferIn - v.transferOut,
        net,
      })
    }
    const selIds = [...selector.keys()].sort()
    for (const sid of selIds) {
      const v = selector.get(sid)!
      const u = admins.find((x) => x.user_id === sid)
      const label = u ? `סלקטור · ${adminLabel(u)}` : `סלקטור · (${sid.slice(0, 8)}…)`
      rows.push({
        key: `s:${sid}`,
        rowKind: 'selector',
        adminId: sid,
        label,
        incomeSum: v.income,
        incomeCount: v.incomeCount,
        expenseSum: v.expense,
        expenseCount: v.expenseCount,
        transferDelta: v.transferIn - v.payoutOut,
        net: v.income - v.expense - v.payoutOut,
      })
    }
    const oids = [...other.keys()].sort()
    for (const oid of oids) {
      const v = other.get(oid)!
      const u = admins.find((x) => x.user_id === oid)
      const label = u ? adminLabel(u) : `אדמין (${oid.slice(0, 8)}…)`
      rows.push({
        key: `o:${oid}`,
        rowKind: 'other',
        adminId: oid,
        label,
        incomeSum: v.income,
        incomeCount: v.incomeCount,
        expenseSum: v.expense,
        expenseCount: v.expenseCount,
        transferDelta: v.transferIn - v.transferOut,
        net: v.income - v.expense - v.transferOut,
      })
    }
    rows.sort((x, y) => x.label.localeCompare(y.label, 'he'))
    return rows
  }, [lines, partnerOnlyRows, admins, payboxDelegateId, scannerStaffIdSet])

  const expensePayerLabel = useCallback(
    (line: EventFinanceLine) => {
      if (line.income_recipient_kind === 'paybox') return 'פייבוקס'
      const a = admins.find((x) => x.user_id === line.recipient_admin_id)
      return a ? adminLabel(a) : `משתמש (${line.recipient_admin_id.slice(0, 8)}…)`
    },
    [admins],
  )

  const equalSplit = useMemo(() => {
    const partners = partnerOnlyRows.map((a) => {
      const row = perAdminRows.find((r) => r.rowKind === 'partner' && r.adminId === a.user_id)
      return { id: a.user_id, label: row?.label ?? adminLabel(a), net: row?.net ?? 0 }
    })
    const poolPayers: { label: string; amount: number }[] = []
    const payboxRow = perAdminRows.find((r) => r.rowKind === 'paybox')
    if (payboxRow && payboxRow.net > 0.005) {
      poolPayers.push({ label: EQUAL_SPLIT_PAYBOX_LABEL, amount: payboxRow.net })
    }
    for (const r of perAdminRows) {
      if (r.rowKind === 'selector' && r.net > 0.005) {
        poolPayers.push({ label: r.label, amount: r.net })
      }
    }
    return computeEqualizingTransfers(totals.net, partners, poolPayers)
  }, [totals.net, partnerOnlyRows, perAdminRows])

  const partnerToPartnerTransferCount = useMemo(
    () =>
      equalSplit.equalizingTransfers.filter(
        (t) => t.fromLabel !== EQUAL_SPLIT_PAYBOX_LABEL && t.toLabel !== EQUAL_SPLIT_PAYBOX_LABEL,
      ).length,
    [equalSplit.equalizingTransfers],
  )

  const listDisabled = !currentEventId || eventLoading

  async function onSaveDefaultTicketPrice() {
    if (!currentEventId || savingDefaultTicket || busy) return
    setSavingDefaultTicket(true)
    setError(null)
    try {
      const raw = defaultTicketPrice.trim().replace(',', '.')
      const p = raw === '' ? 0 : Number(raw)
      const default_ticket_price = Number.isFinite(p) && p >= 0 ? p : 0
      await updateEventCardTexts(currentEventId, { default_ticket_price })
      await refreshEvents()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בשמירת מחיר ברירת מחדל')
    } finally {
      setSavingDefaultTicket(false)
    }
  }

  async function onAddExpense() {
    if (!currentEventId || !expenseRecipient || busy) return
    const expensePayer = expensePayerOptions.find((p) => p.optionId === expenseRecipient)
    if (!expensePayer) {
      setError('נא לבחור מי משלם מהרשימה')
      return
    }
    const name = expenseLabel.trim()
    if (!name) {
      setError('נא למלא תיאור להוצאה')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const raw = expenseAmount.trim() === '' ? 0 : Number(expenseAmount.replace(',', '.'))
      const amt = Number.isFinite(raw) ? Math.abs(raw) : 0
      const line = await insertEventFinanceLine({
        eventId: currentEventId,
        lineKind: 'expense',
        personName: name,
        phone: '',
        amount: amt,
        recipientAdminId: expensePayer.adminId,
        incomeRecipientKind: expensePayer.optionId === 'paybox' ? 'paybox' : 'partner',
        isPaid: false,
      })
      syncFinanceLinesAcrossEventCaches(queryClient, currentEventId, (prev) => [line, ...prev])
      setExpenseLabel('')
      setExpenseAmount('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  async function onDeleteExpense(id: string) {
    if (!window.confirm('למחוק הוצאה זו?')) return
    setBusy(true)
    setError(null)
    try {
      await deleteEventFinanceLine(id)
      syncFinanceLinesAcrossEventCaches(queryClient, currentEventId!, (prev) =>
        prev.filter((x) => x.id !== id),
      )
      if (editingExpenseId === id) {
        setEditingExpenseId(null)
        setEditDraft(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  const adminDisplayById = useCallback(
    (id: string) => {
      const a = admins.find((x) => x.user_id === id)
      return a ? adminLabel(a) : `משתמש (${id.slice(0, 8)}…)`
    },
    [admins],
  )

  const transferFromLabel = useCallback(
    (line: EventFinanceLine) => {
      if (line.transfer_from_kind === 'paybox') return 'פייבוקס'
      const fromId = line.transfer_from_admin_id
      return fromId ? adminDisplayById(fromId) : '—'
    },
    [adminDisplayById],
  )

  const transferToLabel = useCallback(
    (line: EventFinanceLine) => {
      if (line.income_recipient_kind === 'paybox') return 'פייבוקס'
      return adminDisplayById(line.recipient_admin_id)
    },
    [adminDisplayById],
  )

  async function onAddInternalMoneyTransfer() {
    if (!currentEventId || busy) return
    if (!payoutFromId || !payoutToId) {
      setError('נא לבחור מי מעביר ולמי')
      return
    }
    if (payoutFromId === payoutToId) {
      setError('לא ניתן להעביר לאותו אדם')
      return
    }
    const fromParticipant = internalTransferParticipants.find((p) => p.optionId === payoutFromId)
    const toParticipant = internalTransferParticipants.find((p) => p.optionId === payoutToId)
    if (!fromParticipant || !toParticipant) {
      setError('יש לבחור משתתפים מהרשימה')
      return
    }
    if (fromParticipant.optionId === 'paybox' && toParticipant.optionId === 'paybox') {
      setError('לא ניתן לבצע העברה מפייבוקס לפייבוקס')
      return
    }
    let transferFromAdminId = fromParticipant.adminId
    let recipientAdminId = toParticipant.adminId
    if (fromParticipant.optionId === 'paybox' && transferFromAdminId === recipientAdminId) {
      if (!fallbackPayboxDelegateId || fallbackPayboxDelegateId === recipientAdminId) {
        setError('כדי להעביר מפייבוקס לאדמין הזה צריך לפחות אדמין נוסף באירוע')
        return
      }
      transferFromAdminId = fallbackPayboxDelegateId
    }
    if (toParticipant.optionId === 'paybox' && transferFromAdminId === recipientAdminId) {
      if (!fallbackPayboxDelegateId || fallbackPayboxDelegateId === transferFromAdminId) {
        setError('כדי להעביר לאפשרות פייבוקס מאדמין הזה צריך לפחות אדמין נוסף באירוע')
        return
      }
      recipientAdminId = fallbackPayboxDelegateId
    }
    const reason = payoutReason.trim()
    if (!reason) {
      setError('נא למלא סיבה להעברה')
      return
    }
    const raw = payoutAmount.trim().replace(',', '.')
    const amt = raw === '' ? 0 : Number(raw)
    if (!Number.isFinite(amt) || amt < 0.01) {
      setError('נא להזין סכום חיובי')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const line = await insertEventFinanceLine({
        eventId: currentEventId,
        lineKind: 'internal_transfer',
        personName: reason,
        phone: '',
        amount: amt,
        recipientAdminId,
        transferFromAdminId,
        transferFromKind: fromParticipant.optionId === 'paybox' ? 'paybox' : undefined,
        incomeRecipientKind: toParticipant.optionId === 'paybox' ? 'paybox' : undefined,
        isPaid: true,
      })
      syncFinanceLinesAcrossEventCaches(queryClient, currentEventId, (prev) => [line, ...prev])
      setPayoutAmount('')
      setPayoutReason('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  async function onDeleteInternalTransfer(id: string) {
    if (!window.confirm('למחוק רישום העברה זה?')) return
    setBusy(true)
    setError(null)
    try {
      await deleteEventFinanceLine(id)
      syncFinanceLinesAcrossEventCaches(queryClient, currentEventId!, (prev) =>
        prev.filter((x) => x.id !== id),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  function startEditExpense(l: EventFinanceLine) {
    setEditingExpenseId(l.id)
    setEditDraft({
      person_name: l.person_name,
      phone: l.phone,
      amount: l.amount === 0 ? '' : String(l.amount),
      recipient_admin_id: l.recipient_admin_id,
    })
  }

  async function saveExpenseEdit() {
    if (!editingExpenseId || !editDraft) return
    const name = editDraft.person_name.trim()
    if (!name) {
      setError('נא למלא תיאור')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const amt = editDraft.amount.trim() === '' ? 0 : Number(editDraft.amount.replace(',', '.'))
      const before = lines.find((x) => x.id === editingExpenseId)
      const updated = await updateEventFinanceLine(editingExpenseId, {
        person_name: name,
        phone: editDraft.phone,
        amount: Number.isFinite(amt) ? Math.abs(amt) : 0,
        recipient_admin_id: editDraft.recipient_admin_id,
        income_recipient_kind: 'partner',
        is_paid: before?.is_paid ?? false,
      })
      syncFinanceLinesAcrossEventCaches(queryClient, currentEventId!, (prev) =>
        prev.map((x) => (x.id === updated.id ? updated : x)),
      )
      setEditingExpenseId(null)
      setEditDraft(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page guest-list-page--mobile event-finance-page">
      <header className="page-head">
        <h1>הכנסות והוצאות</h1>
        <p className="muted">
          {currentEvent ? (
            <>
              מסיבה: <strong>{currentEvent.name}</strong>
            </>
          ) : (
            'לא נבחרה מסיבה'
          )}
        </p>
      </header>

      {displayError && <div className="banner error">{displayError}</div>}

      <div
        className="event-finance-default-ticket-bar"
        role="region"
        aria-label="מחיר כרטיס ברירת מחדל"
      >
        <span className="event-finance-default-ticket-bar__label" id="event-default-ticket-label">
          מחיר כרטיס (ברירת מחדל)
        </span>
        <input
          id="event-default-ticket-price"
          className="input"
          type="text"
          inputMode="decimal"
          dir="ltr"
          disabled={listDisabled || savingDefaultTicket}
          value={defaultTicketPrice}
          onChange={(e) => setDefaultTicketPrice(e.target.value)}
          placeholder="0"
          aria-labelledby="event-default-ticket-label"
        />
        <button
          type="button"
          className="btn btn-mob event-finance-default-ticket-bar__save"
          disabled={listDisabled || savingDefaultTicket}
          onClick={() => void onSaveDefaultTicketPrice()}
        >
          {savingDefaultTicket ? 'שומר…' : 'שמור'}
        </button>
      </div>

      {!loading && currentEventId ? (
        <div className="event-finance-snapshot" role="status" aria-live="polite">
          <span>
            <strong>סה״כ הכנסות:</strong> {formatNis(totals.inc)}
          </span>
          <span className="event-finance-snapshot__sep">|</span>
          <span>
            <strong>סה״כ הוצאות:</strong> {formatNis(totals.exp)}
          </span>
          <span className="event-finance-snapshot__sep">|</span>
          <span>
            <strong>מאזן:</strong> {formatNis(totals.net)}
          </span>
          <span className="event-finance-snapshot__sep">|</span>
          <span>
            <strong>העברות פנימיות:</strong> {formatNis(internalTransfersTotal)}
          </span>
        </div>
      ) : null}

      <section className="guest-list-section" aria-labelledby="finance-summary-heading">
        <h2 id="finance-summary-heading" className="sheet-section-title">
          סיכום לפי שותף / פייבוקס
        </h2>
        {loading ? (
          <p className="muted">טוען…</p>
        ) : perAdminRows.length === 0 ? (
          <p className="muted">אין נתונים.</p>
        ) : (
          <div className="guest-desk guest-list--desktop-only" style={{ marginBottom: '1rem' }}>
            <div className="sheet-wrap guest-desk-sheet-wrap">
              <table className="sheet guest-desk-table event-finance-table">
                <thead>
                  <tr>
                    <th className="guest-desk-th guest-desk-th--name">נמען / שותף</th>
                    <th className="guest-desk-th">הכנסות (מס׳ אורחים)</th>
                    <th className="guest-desk-th">הוצאות (מס׳ שורות)</th>
                    <th className="guest-desk-th">העברות</th>
                    <th className="guest-desk-th">מאזן</th>
                  </tr>
                </thead>
                <tbody>
                  {perAdminRows.map((r) => (
                    <tr key={r.key} className="guest-desk-tr">
                      <td className="guest-desk-td guest-desk-td--name">{r.label}</td>
                      <td className="guest-desk-td">
                        {formatNis(r.incomeSum)}
                        <span className="muted small">
                          {r.incomeCount > 0 ? ` · ‏${r.incomeCount} אנשים` : ''}
                        </span>
                      </td>
                      <td className="guest-desk-td">
                        {formatNis(r.expenseSum)}
                        <span className="muted small">
                          {r.expenseCount > 0 ? ` · ‏${r.expenseCount} הוצאות` : ''}
                        </span>
                      </td>
                      <td className="guest-desk-td guest-desk-td--center">
                        {r.transferDelta > 0.005
                          ? `+${formatNis(r.transferDelta)}`
                          : r.transferDelta < -0.005
                            ? `-${formatNis(Math.abs(r.transferDelta))}`
                            : '—'}
                      </td>
                      <td className="guest-desk-td guest-desk-td--center">
                        <strong>{formatNis(r.net)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && perAdminRows.length > 0 ? (
          <div className="guest-mob-list guest-list--mobile-only event-finance-mob">
            {perAdminRows.map((r) => (
              <div key={r.key} className="guest-mob-card guest-mob-card--compact event-finance-card">
                <div className="guest-mob-card__title-row event-finance-card__r1">
                  <span className="guest-mob-card__name event-finance-card__name">{r.label}</span>
                </div>
                <div className="event-finance-card__meta muted small">
                  <div>
                    <strong>הכנסות:</strong> {formatNis(r.incomeSum)}
                    {r.incomeCount > 0 ? ` · ‏${r.incomeCount} אנשים` : ' · 0'}
                  </div>
                  <div>
                    <strong>הוצאות:</strong> {formatNis(r.expenseSum)}
                    {r.expenseCount > 0 ? ` · ‏${r.expenseCount} שורות` : ' · 0'}
                  </div>
                  <div>
                    <strong>העברות:</strong>{' '}
                    {r.transferDelta > 0.005
                      ? `+${formatNis(r.transferDelta)}`
                      : r.transferDelta < -0.005
                        ? `-${formatNis(Math.abs(r.transferDelta))}`
                        : '—'}
                  </div>
                  <div>
                    <strong>מאזן:</strong> {formatNis(r.net)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="guest-add-section" aria-labelledby="finance-expense-add-heading">
        <div className="guest-add-surface">
          <h2 id="finance-expense-add-heading" className="sheet-section-title">
            הוספת הוצאה
          </h2>
          <div className="event-finance-expense-add">
            <div>
              <span className="guest-mob-label">תיאור (חובה)</span>
              <input
                className="guest-mob-input"
                placeholder="למשל דלק, ציוד"
                value={expenseLabel}
                onChange={(e) => setExpenseLabel(e.target.value)}
                disabled={listDisabled}
              />
            </div>
            <div>
              <span className="guest-mob-label">סכום (₪)</span>
              <input
                className="guest-mob-input"
                placeholder="0"
                inputMode="decimal"
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
                disabled={listDisabled}
              />
            </div>
            <div>
              <span className="guest-mob-label">מי משלם (אדמין / פייבוקס)</span>
              <select
                className="guest-mob-input event-finance-select"
                value={expenseRecipient}
                onChange={(e) => setExpenseRecipient(e.target.value)}
                disabled={listDisabled || expensePayerOptions.length === 0}
              >
                {expensePayerOptions.map((payer) => (
                  <option key={payer.optionId} value={payer.optionId}>
                    {payer.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="event-finance-add-btn-wrap">
              <button
                type="button"
                className="btn btn-mob btn-mob--primary guest-add-mob__btn"
                disabled={listDisabled || busy}
                onClick={() => void onAddExpense()}
              >
                הוסף הוצאה
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="guest-list-section" aria-labelledby="finance-expense-list-heading">
        <h2 id="finance-expense-list-heading" className="sheet-section-title">
          רשימת הוצאות
        </h2>
        {loading ? (
          <p className="muted">טוען…</p>
        ) : expenseLines.length === 0 ? (
          <p className="muted">אין הוצאות.</p>
        ) : (
          <>
            <div className="guest-mob-list guest-list--mobile-only event-finance-mob">
              {expenseLines.map((l) => {
                const isEdit = editingExpenseId === l.id
                return (
                  <div
                    key={l.id}
                    className="guest-mob-card guest-mob-card--compact event-finance-card"
                  >
                    {!isEdit ? (
                      <>
                        <div className="guest-mob-card__title-row event-finance-card__r1">
                          <span className="guest-mob-card__name event-finance-card__name">{l.person_name}</span>
                          <span className="event-finance-card__amount">−{formatNis(l.amount)}</span>
                        </div>
                        <div className="event-finance-card__meta event-finance-card__meta--expense-line muted small">
                          <span>
                            <strong>מי שילם:</strong> {expensePayerLabel(l)}
                          </span>
                          <span>
                            <strong>הערות:</strong> {l.phone?.trim() ? l.phone : '—'}
                          </span>
                        </div>
                        <div className="event-finance-card__actions">
                          <button
                            type="button"
                            className="btn btn-mob btn-mob--secondary small"
                            onClick={() => startEditExpense(l)}
                            disabled={busy}
                          >
                            ערוך
                          </button>
                          <button
                            type="button"
                            className="btn btn-mob small"
                            onClick={() => void onDeleteExpense(l.id)}
                            disabled={busy}
                          >
                            מחק
                          </button>
                        </div>
                      </>
                    ) : (
                      editDraft && (
                        <div className="event-finance-edit">
                          <input
                            className="guest-mob-input"
                            placeholder="תיאור"
                            value={editDraft.person_name}
                            onChange={(e) => setEditDraft((d) => d && { ...d, person_name: e.target.value })}
                          />
                          <input
                            className="guest-mob-input"
                            placeholder="סכום"
                            value={editDraft.amount}
                            onChange={(e) => setEditDraft((d) => d && { ...d, amount: e.target.value })}
                          />
                          <select
                            className="guest-mob-input"
                            aria-label="מי שילם"
                            value={editDraft.recipient_admin_id}
                            onChange={(e) =>
                              setEditDraft((d) => d && { ...d, recipient_admin_id: e.target.value })
                            }
                          >
                            {partnerOnlyRows.map((x) => (
                              <option key={x.user_id} value={x.user_id}>
                                {adminLabel(x)}
                              </option>
                            ))}
                          </select>
                          <input
                            className="guest-mob-input"
                            placeholder="הערות"
                            value={editDraft.phone}
                            onChange={(e) => setEditDraft((d) => d && { ...d, phone: e.target.value })}
                          />
                          <div className="event-finance-card__actions">
                            <button type="button" className="btn btn-mob btn-mob--primary" onClick={() => void saveExpenseEdit()}>
                              שמור
                            </button>
                            <button
                              type="button"
                              className="btn btn-mob btn-mob--secondary"
                              onClick={() => {
                                setEditingExpenseId(null)
                                setEditDraft(null)
                              }}
                            >
                              בטל
                            </button>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )
              })}
            </div>

            <div className="guest-desk guest-list--desktop-only">
              <div className="sheet-wrap guest-desk-sheet-wrap">
                <table className="sheet guest-desk-table event-finance-table">
                  <thead>
                    <tr>
                      <th className="guest-desk-th guest-desk-th--name">תיאור</th>
                      <th className="guest-desk-th">סכום</th>
                      <th className="guest-desk-th">מי שילם</th>
                      <th className="guest-desk-th">הערות</th>
                      <th className="guest-desk-th guest-desk-th--actions">עריכה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenseLines.map((l) => {
                      const isEdit = editingExpenseId === l.id
                      return (
                        <tr key={l.id} className="guest-desk-tr">
                          {isEdit && editDraft ? (
                            <td className="guest-desk-td" colSpan={5}>
                              <div className="event-finance-desk-edit">
                                <input
                                  className="guest-desk-field guest-desk-field--name"
                                  value={editDraft.person_name}
                                  onChange={(e) => setEditDraft((d) => d && { ...d, person_name: e.target.value })}
                                  placeholder="תיאור"
                                />
                                <input
                                  className="guest-desk-field"
                                  value={editDraft.amount}
                                  onChange={(e) => setEditDraft((d) => d && { ...d, amount: e.target.value })}
                                  placeholder="סכום"
                                />
                                <select
                                  className="guest-desk-field"
                                  aria-label="מי שילם"
                                  value={editDraft.recipient_admin_id}
                                  onChange={(e) =>
                                    setEditDraft((d) => d && { ...d, recipient_admin_id: e.target.value })
                                  }
                                >
                                  {partnerOnlyRows.map((x) => (
                                    <option key={x.user_id} value={x.user_id}>
                                      {adminLabel(x)}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  className="guest-desk-field guest-desk-field--phone"
                                  value={editDraft.phone}
                                  onChange={(e) => setEditDraft((d) => d && { ...d, phone: e.target.value })}
                                  placeholder="הערות"
                                />
                                <div className="event-finance-desk-edit__btns">
                                  <button type="button" className="btn small" onClick={() => void saveExpenseEdit()}>
                                    שמור
                                  </button>
                                  <button
                                    type="button"
                                    className="btn small secondary"
                                    onClick={() => {
                                      setEditingExpenseId(null)
                                      setEditDraft(null)
                                    }}
                                  >
                                    בטל
                                  </button>
                                </div>
                              </div>
                            </td>
                          ) : (
                            <>
                              <td className="guest-desk-td guest-desk-td--name">{l.person_name}</td>
                              <td className="guest-desk-td guest-desk-td--center">−{formatNis(l.amount)}</td>
                              <td className="guest-desk-td guest-desk-td--center">{expensePayerLabel(l)}</td>
                              <td className="guest-desk-td guest-desk-td--notes">
                                {l.phone?.trim() ? l.phone : '—'}
                              </td>
                              <td className="guest-desk-td guest-desk-td--actions">
                                <div className="guest-desk-actions event-finance-desk-actions">
                                  <button type="button" className="guest-desk-act" onClick={() => startEditExpense(l)}>
                                    ערוך
                                  </button>
                                  <button
                                    type="button"
                                    className="guest-desk-act guest-desk-act--del"
                                    onClick={() => void onDeleteExpense(l.id)}
                                  >
                                    מחק
                                  </button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>

      <section className="guest-list-section" aria-labelledby="finance-internal-transfer-heading">
        <h2 id="finance-internal-transfer-heading" className="sheet-section-title">
          העברות כסף (בין חברי צוות)
        </h2>
        <p className="muted small" style={{ marginTop: '-0.35rem', marginBottom: '0.65rem' }}>
          רישום העברה פנימית — לא משנה את סה״כ הכנסות/הוצאות של האירוע. מעדכן מאזן לפי שורה בסיכום למטה.
        </p>
        <div className="guest-add-surface" style={{ marginBottom: '1rem' }}>
          <div className="event-finance-expense-add event-finance-payout-add">
            <div>
              <span className="guest-mob-label">מ (מעביר)</span>
              <select
                className="guest-mob-input event-finance-select"
                value={payoutFromId}
                onChange={(e) => setPayoutFromId(e.target.value)}
                disabled={listDisabled || busy || internalTransferParticipants.length === 0}
              >
                {internalTransferParticipants.length === 0 ? (
                  <option value="">אין משתתפים בצוות</option>
                ) : null}
                {internalTransferParticipants.map((p) => (
                  <option key={p.optionId} value={p.optionId}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className="guest-mob-label">ל (מקבל)</span>
              <select
                className="guest-mob-input event-finance-select"
                value={payoutToId}
                onChange={(e) => setPayoutToId(e.target.value)}
                disabled={listDisabled || busy || internalTransferParticipants.length < 2}
              >
                {internalTransferParticipants.map((p) => (
                  <option key={p.optionId} value={p.optionId}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className="guest-mob-label">כמה (₪)</span>
              <input
                className="guest-mob-input"
                placeholder="0"
                inputMode="decimal"
                value={payoutAmount}
                onChange={(e) => setPayoutAmount(e.target.value)}
                disabled={listDisabled || busy}
              />
            </div>
            <div>
              <span className="guest-mob-label">סיבה (חובה)</span>
              <input
                className="guest-mob-input"
                placeholder="למשל החזר הוצאה, פייבוקס"
                value={payoutReason}
                onChange={(e) => setPayoutReason(e.target.value)}
                disabled={listDisabled || busy}
              />
            </div>
            <div className="event-finance-add-btn-wrap">
              <button
                type="button"
                className="btn btn-mob btn-mob--primary guest-add-mob__btn"
                disabled={
                  listDisabled || busy || internalTransferParticipants.length < 2 || !payoutFromId || !payoutToId
                }
                onClick={() => void onAddInternalMoneyTransfer()}
              >
                שמור העברה
              </button>
            </div>
          </div>
        </div>
        {loading ? (
          <p className="muted">טוען…</p>
        ) : internalTransferLines.length === 0 ? (
          <p className="muted">אין העברות מתועדות.</p>
        ) : (
          <>
            <div className="guest-mob-list guest-list--mobile-only event-finance-mob">
              {internalTransferLines.map((l) => {
                return (
                  <div key={l.id} className="guest-mob-card guest-mob-card--compact event-finance-card">
                    <div className="guest-mob-card__title-row event-finance-card__r1">
                      <span className="guest-mob-card__name event-finance-card__name">{l.person_name}</span>
                      <span className="event-finance-card__amount">{formatNis(l.amount)}</span>
                    </div>
                    <div className="event-finance-card__meta event-finance-card__meta--expense-line muted small">
                      <span>
                        <strong>מ:</strong> {transferFromLabel(l)}
                      </span>
                      <span>
                        <strong>ל:</strong> {transferToLabel(l)}
                      </span>
                    </div>
                    <div className="event-finance-card__actions">
                      <button
                        type="button"
                        className="btn btn-mob small"
                        onClick={() => void onDeleteInternalTransfer(l.id)}
                        disabled={busy}
                      >
                        מחק
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="guest-desk guest-list--desktop-only">
              <div className="sheet-wrap guest-desk-sheet-wrap">
                <table
                  className="sheet guest-desk-table event-finance-table"
                  aria-label="העברות כסף פנימיות"
                >
                  <thead>
                    <tr>
                      <th className="guest-desk-th guest-desk-th--name">סיבה</th>
                      <th className="guest-desk-th">סכום</th>
                      <th className="guest-desk-th">מ</th>
                      <th className="guest-desk-th">ל</th>
                      <th className="guest-desk-th guest-desk-th--actions">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {internalTransferLines.map((l) => {
                      return (
                        <tr key={l.id} className="guest-desk-tr">
                          <td className="guest-desk-td guest-desk-td--name">{l.person_name}</td>
                          <td className="guest-desk-td guest-desk-td--center">{formatNis(l.amount)}</td>
                          <td className="guest-desk-td guest-desk-td--center">
                            {transferFromLabel(l)}
                          </td>
                          <td className="guest-desk-td guest-desk-td--center">{transferToLabel(l)}</td>
                          <td className="guest-desk-td guest-desk-td--actions">
                            <button
                              type="button"
                              className="guest-desk-act guest-desk-act--del"
                              onClick={() => void onDeleteInternalTransfer(l.id)}
                              disabled={busy}
                            >
                              מחק
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>

      {!loading && currentEventId && partnerOnlyRows.length > 0 ? (
        <section className="guest-list-section" aria-labelledby="finance-equal-split-heading">
          <h2 id="finance-equal-split-heading" className="sheet-section-title">
            חלוקה שווה
          </h2>
          <div className="event-finance-equal-card">
            <p className="event-finance-equal-lead">
              <strong>רווח נקי לכל שותף</strong> (חלק שווה):{' '}
              <span className="event-finance-equal-figure">{formatNis(equalSplit.fairShare)}</span>
            </p>
            {partnerOnlyRows.length === 1 ? null : (
              <>
                <h3 className="event-finance-equal-sub">העברות לאיזון (כולל שותף לשותף)</h3>
                {equalSplit.transferCount === 0 ? (
                  <p className="muted">אין העברות.</p>
                ) : (
                  <>
                    <p className="event-finance-equal-count">
                      <strong>מספר הוראות:</strong> {equalSplit.transferCount}
                    </p>
                    {partnerToPartnerTransferCount > 0 ? (
                      <p className="event-finance-equal-count">
                        <strong>מתוכן שותף לשותף:</strong> {partnerToPartnerTransferCount}
                      </p>
                    ) : null}
                    <ol className="event-finance-transfer-ol" dir="rtl">
                      {equalSplit.equalizingTransfers.map((t, idx) => (
                        <li key={`${t.fromLabel}-${t.toLabel}-${idx}`}>
                          <strong>{t.fromLabel}</strong> צריך להעביר ל־<strong>{t.toLabel}</strong> —{' '}
                          {formatNis(t.amount)}
                        </li>
                      ))}
                    </ol>
                  </>
                )}
              </>
            )}
          </div>
        </section>
      ) : null}
    </div>
  )
}
