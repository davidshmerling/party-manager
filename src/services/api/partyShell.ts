import type { AdminUserRow } from '../../types/admin'
import type { EventStatsRpc, EventStaffRow } from '../../types/event'
import type { EventFinanceLine } from '../../types/finance'
import type { Guest } from '../../types/guest'
import type { GuestEntryTimeRow } from '../../utils/guestEntrySeries'
import { mapEventFinanceLine, mapGlobalUserRow, mapGuestRow } from './mappers'
import { sb, errMsg } from './client'

function mapEventStaffRow(r: Record<string, unknown>): EventStaffRow {
  const raw = String(r.role ?? '')
  const role: 'admin' | 'scanner' = raw === 'scanner' ? 'scanner' : 'admin'
  return {
    id: String(r.id),
    user_id: String(r.user_id),
    email: String(r.email ?? ''),
    role,
    created_at: String(r.created_at ?? ''),
  }
}

function mapEventStatsRpcFromJson(j: Record<string, unknown>, eventId: string): EventStatsRpc {
  if (j.error === 'forbidden') throw new Error('אין הרשאה לצפות בסטטיסטיקה')
  return {
    event_id: String(j.event_id ?? eventId),
    event_name: j.event_name != null ? String(j.event_name) : null,
    total_guests: Number(j.total_guests ?? 0),
    checked_in_count: Number(j.checked_in_count ?? 0),
    not_checked_in_count: Number(j.not_checked_in_count ?? 0),
    checked_in_percentage: Number(j.checked_in_percentage ?? 0),
    last_check_in_at: j.last_check_in_at != null ? String(j.last_check_in_at) : null,
  }
}

export type PartyEventShell = {
  guests: Guest[]
  financeLines: EventFinanceLine[]
  eventStaff: EventStaffRow[]
  globalUsers: AdminUserRow[]
}

/** RPC אחד: אורחים + שורות כספים (לשותף) + צוות אירוע + משתמשים גלובליים (לאדמין/שותף) */
export async function fetchPartyEventShell(eventId: string): Promise<PartyEventShell> {
  const { data, error } = await sb().rpc('get_party_event_shell', { p_event_id: eventId })
  if (error) throw new Error(errMsg(error))
  if (data == null || typeof data !== 'object') throw new Error('תשובת מעטפת אירוע לא תקינה')
  const j = data as Record<string, unknown>

  const guestsRaw = j.guests
  const guests: Guest[] = Array.isArray(guestsRaw)
    ? guestsRaw.map((r) => mapGuestRow(r as Record<string, unknown>))
    : []

  const finRaw = j.event_finance_lines
  const financeLines: EventFinanceLine[] = Array.isArray(finRaw)
    ? finRaw.map((r) => mapEventFinanceLine(r as Record<string, unknown>))
    : []

  const stRaw = j.event_staff
  const eventStaff: EventStaffRow[] = Array.isArray(stRaw)
    ? stRaw.map((r) => mapEventStaffRow(r as Record<string, unknown>))
    : []

  const guRaw = j.global_users
  const globalUsers: AdminUserRow[] = Array.isArray(guRaw)
    ? guRaw.map((r) => mapGlobalUserRow(r as Record<string, unknown>))
    : []

  return { guests, financeLines, eventStaff, globalUsers }
}

export type FinancePageShell = {
  financeLines: EventFinanceLine[]
  eventStaff: EventStaffRow[]
  adminUsers: AdminUserRow[]
}

/** RPC אחד לדף כספים (שותף) */
export async function fetchFinancePageShell(eventId: string): Promise<FinancePageShell> {
  const { data, error } = await sb().rpc('get_finance_page_shell', { p_event_id: eventId })
  if (error) throw new Error(errMsg(error))
  if (data == null || typeof data !== 'object') throw new Error('תשובת מעטפת כספים לא תקינה')
  const j = data as Record<string, unknown>

  const finRaw = j.event_finance_lines
  const financeLines: EventFinanceLine[] = Array.isArray(finRaw)
    ? finRaw.map((r) => mapEventFinanceLine(r as Record<string, unknown>))
    : []

  const stRaw = j.event_staff
  const eventStaff: EventStaffRow[] = Array.isArray(stRaw)
    ? stRaw.map((r) => mapEventStaffRow(r as Record<string, unknown>))
    : []

  const adRaw = j.admin_users
  const adminUsers: AdminUserRow[] = Array.isArray(adRaw)
    ? adRaw.map((r) => mapGlobalUserRow(r as Record<string, unknown>))
    : []

  return { financeLines, eventStaff, adminUsers }
}

export type EventStatsPageBundle = {
  stats: EventStatsRpc
  entryTimes: GuestEntryTimeRow[]
}

/** RPC אחד: סטטיסטיקה + נקודות זמן לכניסות (לגרף) */
export async function fetchEventStatsPageBundle(eventId: string): Promise<EventStatsPageBundle> {
  const { data, error } = await sb().rpc('get_event_stats_page_bundle', { p_event_id: eventId })
  if (error) throw new Error(errMsg(error))
  if (data == null || typeof data !== 'object') throw new Error('תשובת סטטיסטיקה מקובצת לא תקינה')
  const j = data as Record<string, unknown>
  if (j.error === 'forbidden') throw new Error('אין הרשאה לצפות בסטטיסטיקה')

  const statsRaw = j.stats
  if (statsRaw == null || typeof statsRaw !== 'object') {
    throw new Error('תשובת סטטיסטיקה לא תקינה')
  }
  const stats = mapEventStatsRpcFromJson(statsRaw as Record<string, unknown>, eventId)

  const etRaw = j.entry_times
  const entryTimes: GuestEntryTimeRow[] = Array.isArray(etRaw)
    ? etRaw.map((row) => {
        const r = row as Record<string, unknown>
        return { id: String(r.id), entered_at: String(r.entered_at) }
      })
    : []

  return { stats, entryTimes }
}
