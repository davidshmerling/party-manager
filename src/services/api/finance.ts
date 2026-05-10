import type {
  EventFinanceLine,
  EventFinanceLineKind,
  IncomeRecipientKind,
  TransferFromKind,
} from '../../types/finance'
import { sb, errMsg } from './client'
import { mapEventFinanceLine } from './mappers'

/** עמודות ל־mapEventFinanceLine — בלי `*` ברשימות */
const EVENT_FINANCE_LINE_COLUMNS =
  'id, event_id, line_kind, guest_id, person_name, phone, amount, recipient_admin_id, transfer_from_admin_id, transfer_from_kind, income_recipient_kind, is_paid, created_by, created_at, updated_at'

export async function fetchEventFinanceLines(eventId: string): Promise<EventFinanceLine[]> {
  const { data, error } = await sb()
    .from('event_finance_lines')
    .select(EVENT_FINANCE_LINE_COLUMNS)
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(errMsg(error))
  return (data ?? []).map((r) => mapEventFinanceLine(r as Record<string, unknown>))
}

export async function insertEventFinanceLine(p: {
  eventId: string
  lineKind: EventFinanceLineKind
  personName: string
  phone?: string
  amount?: number
  recipientAdminId: string
  /** ‎internal_transfer‎ בלבד */
  transferFromAdminId?: string
  /** internal_transfer: מי המקור החשבונאי (למשל paybox) */
  transferFromKind?: TransferFromKind
  /** income: סוג נמען; expense: ניתן להשתמש ב־paybox כדי לסמן בריכת פייבוקס */
  incomeRecipientKind?: IncomeRecipientKind
  isPaid?: boolean
  /** שורת הכנסה מקושרת לכרטיס (רשימת אורחים) */
  guestId?: string | null
}): Promise<EventFinanceLine> {
  const client = sb()
  const {
    data: { session },
  } = await client.auth.getSession()
  if (!session?.user) throw new Error('נדרשת התחברות')

  const nameRaw = p.personName.trim()
  const name =
    nameRaw ||
    (p.lineKind === 'internal_transfer' ? 'העברה פנימית' : '')
  if (!name) throw new Error('נדרש שם')

  const phone = p.phone?.trim() ?? ''
  const amt = p.amount
  const amount = typeof amt === 'number' && Number.isFinite(amt) ? amt : 0

  const incKind: IncomeRecipientKind | null =
    p.lineKind === 'income'
      ? (p.incomeRecipientKind ?? 'partner')
      : p.lineKind === 'expense'
        ? (p.incomeRecipientKind ?? 'partner')
        : null

  const transferFrom =
    p.lineKind === 'internal_transfer' ? (p.transferFromAdminId?.trim() ?? '') : ''
  if (p.lineKind === 'internal_transfer' && !transferFrom) {
    throw new Error('נא לבחור מי מעביר')
  }

  const transferFromKind: TransferFromKind | null =
    p.lineKind === 'internal_transfer' ? (p.transferFromKind ?? null) : null

  const guestId =
    p.guestId != null && String(p.guestId).trim() !== '' ? String(p.guestId).trim() : null

  const { data, error } = await client
    .from('event_finance_lines')
    .insert({
      event_id: p.eventId,
      line_kind: p.lineKind,
      guest_id: guestId,
      person_name: name,
      phone,
      amount,
      recipient_admin_id: p.recipientAdminId,
      transfer_from_admin_id: p.lineKind === 'internal_transfer' ? transferFrom : null,
      transfer_from_kind: transferFromKind,
      income_recipient_kind: incKind,
      is_paid: p.isPaid ?? false,
      created_by: session.user.id,
    })
    .select(EVENT_FINANCE_LINE_COLUMNS)
    .single()

  if (error) throw new Error(errMsg(error))
  if (!data) throw new Error('לא נשמר')
  return mapEventFinanceLine(data as Record<string, unknown>)
}

export async function updateEventFinanceLine(
  id: string,
  patch: Partial<{
    line_kind: EventFinanceLineKind
    guest_id: string | null
    person_name: string
    phone: string
    amount: number
    recipient_admin_id: string
    transfer_from_admin_id: string | null
    transfer_from_kind: TransferFromKind | null
    income_recipient_kind: IncomeRecipientKind | null
    is_paid: boolean
  }>,
): Promise<EventFinanceLine> {
  const row: Record<string, unknown> = {}
  if (patch.line_kind !== undefined) row.line_kind = patch.line_kind
  if (patch.guest_id !== undefined) row.guest_id = patch.guest_id
  if (patch.phone !== undefined) row.phone = patch.phone
  if (patch.amount !== undefined) row.amount = patch.amount
  if (patch.recipient_admin_id !== undefined) row.recipient_admin_id = patch.recipient_admin_id
  if (patch.transfer_from_admin_id !== undefined) row.transfer_from_admin_id = patch.transfer_from_admin_id
  if (patch.transfer_from_kind !== undefined) row.transfer_from_kind = patch.transfer_from_kind
  if (patch.income_recipient_kind !== undefined) row.income_recipient_kind = patch.income_recipient_kind
  if (patch.is_paid !== undefined) row.is_paid = patch.is_paid
  if (patch.person_name !== undefined) {
    const n = String(patch.person_name).trim()
    if (!n) throw new Error('נדרש שם')
    row.person_name = n
  }
  const { data, error } = await sb()
    .from('event_finance_lines')
    .update(row)
    .eq('id', id)
    .select(EVENT_FINANCE_LINE_COLUMNS)
    .single()
  if (error) throw new Error(errMsg(error))
  if (!data) throw new Error('עדכון נכשל')
  return mapEventFinanceLine(data as Record<string, unknown>)
}

export async function deleteEventFinanceLine(id: string): Promise<void> {
  const { error } = await sb().from('event_finance_lines').delete().eq('id', id)
  if (error) throw new Error(errMsg(error))
}
