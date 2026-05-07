import type { AdminUserRow } from '../../types/admin'
import type { EventFinanceLine, IncomeRecipientKind, TransferFromKind } from '../../types/finance'
import type { EventRow } from '../../types/event'
import type { Guest, ScanResponse } from '../../types/guest'
import { normalizeCardTextField } from '../../utils/cardText'

function mapPgIntArray(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  const out: number[] = []
  for (const x of raw) {
    const n = typeof x === 'number' ? x : Number(x)
    if (Number.isFinite(n)) out.push(n)
  }
  return out
}

export function mapGuestRow(row: Record<string, unknown>): Guest {
  return {
    id: String(row.id),
    event_id: String(row.event_id),
    name: String(row.name),
    phone: String(row.phone),
    unique_code: String(row.unique_code),
    invite_bundle_code:
      row.invite_bundle_code != null
        ? String(row.invite_bundle_code)
        : String(row.unique_code),
    status: row.status as Guest['status'],
    entered_at: row.entered_at != null ? String(row.entered_at) : null,
    card_opened_at: row.card_opened_at != null ? String(row.card_opened_at) : null,
    whatsapp_invite_sent_at:
      row.whatsapp_invite_sent_at != null ? String(row.whatsapp_invite_sent_at) : null,
    invite_sent_method:
      row.invite_sent_method != null && String(row.invite_sent_method).trim()
        ? String(row.invite_sent_method).trim()
        : null,
    whatsapp_last_inbound_at:
      row.whatsapp_last_inbound_at != null ? String(row.whatsapp_last_inbound_at) : null,
    whatsapp_invite_twilio_sid:
      row.whatsapp_invite_twilio_sid != null && String(row.whatsapp_invite_twilio_sid).trim()
        ? String(row.whatsapp_invite_twilio_sid).trim()
        : null,
    whatsapp_invite_twilio_status:
      row.whatsapp_invite_twilio_status != null && String(row.whatsapp_invite_twilio_status).trim()
        ? String(row.whatsapp_invite_twilio_status).trim().toLowerCase()
        : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    source: row.source === 'pay_at_door' ? 'pay_at_door' : 'list',
  }
}

export function mapEventRow(row: Record<string, unknown>): EventRow {
  const created = String(row.created_at)
  return {
    id: String(row.id),
    name: String(row.name),
    slug: row.slug != null ? String(row.slug) : null,
    description: row.description != null ? String(row.description) : null,
    starts_at: row.starts_at != null ? String(row.starts_at) : null,
    ends_at: row.ends_at != null ? String(row.ends_at) : null,
    location: row.location != null ? String(row.location) : null,
    is_active: row.is_active === undefined || row.is_active === null ? true : Boolean(row.is_active),
    created_by: row.created_by != null ? String(row.created_by) : null,
    card_text_above: normalizeCardTextField(
      row.card_text_above != null ? String(row.card_text_above) : null,
    ),
    card_text_instruction: normalizeCardTextField(
      row.card_text_instruction != null ? String(row.card_text_instruction) : null,
    ),
    card_text_below: normalizeCardTextField(
      row.card_text_below != null ? String(row.card_text_below) : null,
    ),
    whatsapp_invite_template:
      row.whatsapp_invite_template != null ? String(row.whatsapp_invite_template) : null,
    whatsapp_twilio_content_sid:
      row.whatsapp_twilio_content_sid != null ? String(row.whatsapp_twilio_content_sid) : null,
    whatsapp_twilio_content_name:
      row.whatsapp_twilio_content_name != null ? String(row.whatsapp_twilio_content_name) : null,
    whatsapp_twilio_content_status:
      row.whatsapp_twilio_content_status != null ? String(row.whatsapp_twilio_content_status) : null,
    whatsapp_twilio_content_category:
      row.whatsapp_twilio_content_category != null ? String(row.whatsapp_twilio_content_category) : null,
    whatsapp_twilio_content_submitted_at:
      row.whatsapp_twilio_content_submitted_at != null
        ? String(row.whatsapp_twilio_content_submitted_at)
        : null,
    whatsapp_twilio_placeholder_slots: mapPgIntArray(row.whatsapp_twilio_placeholder_slots),
    default_ticket_price: (() => {
      const v = row.default_ticket_price
      if (v == null) return 0
      const n = typeof v === 'number' ? v : Number(v)
      return Number.isFinite(n) ? n : 0
    })(),
    created_at: created,
    updated_at: row.updated_at != null ? String(row.updated_at) : created,
  }
}

function mapFinanceLineKind(raw: unknown): EventFinanceLine['line_kind'] {
  const s = raw != null && typeof raw === 'string' ? raw : ''
  if (s === 'expense') return 'expense'
  if (s === 'internal_transfer') return 'internal_transfer'
  if (s === 'selector_payout') return 'internal_transfer'
  return 'income'
}

function mapIncomeRecipientKind(
  v: unknown,
  lineKind: EventFinanceLine['line_kind'],
): IncomeRecipientKind | null {
  const s = v != null && typeof v === 'string' ? v : ''
  if (s === 'paybox' || s === 'partner' || s === 'selector') return s
  return lineKind === 'income' ? 'partner' : null
}

function mapTransferFromKind(v: unknown): TransferFromKind | null {
  const s = v != null && typeof v === 'string' ? v : ''
  if (s === 'paybox' || s === 'partner' || s === 'selector') return s
  return null
}

export function mapEventFinanceLine(row: Record<string, unknown>): EventFinanceLine {
  const a = row.amount
  const amount = typeof a === 'number' ? a : Number(a ?? 0)
  const line_kind = mapFinanceLineKind(row.line_kind)
  const tf = row.transfer_from_admin_id
  return {
    id: String(row.id),
    event_id: String(row.event_id),
    line_kind,
    person_name: String(row.person_name ?? '').trim() || '—',
    phone: String(row.phone ?? ''),
    amount: Number.isFinite(amount) ? amount : 0,
    recipient_admin_id: String(row.recipient_admin_id),
    transfer_from_admin_id: tf != null && String(tf).trim() !== '' ? String(tf) : null,
    transfer_from_kind: mapTransferFromKind(row.transfer_from_kind),
    income_recipient_kind: mapIncomeRecipientKind(row.income_recipient_kind, line_kind),
    is_paid: Boolean(row.is_paid),
    created_by: row.created_by != null ? String(row.created_by) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

export function mapGlobalUserRow(raw: Record<string, unknown>): AdminUserRow {
  return {
    user_id: String(raw.user_id),
    email: String(raw.email ?? ''),
    display_name: String(raw.display_name ?? ''),
    is_admin: Boolean(raw.is_admin),
    is_partner: Boolean(raw.is_partner),
    profile_role: String(raw.profile_role ?? ''),
  }
}

export function mapRpcScanToResponse(raw: Record<string, unknown>): ScanResponse {
  const status = String(raw.status ?? raw.result ?? 'not_found')
  const guestRaw = raw.guest
  let guest: ScanResponse['guest'] = null
  if (guestRaw && typeof guestRaw === 'object') {
    const g = guestRaw as Record<string, unknown>
    if (typeof g.name === 'string') {
      guest = {
        name: g.name,
        entered_at: g.entered_at != null ? String(g.entered_at) : null,
      }
    }
  }
  let result: ScanResponse['result']
  switch (status) {
    case 'ok':
      result = 'ok'
      break
    case 'already_entered':
    case 'already_checked_in':
      result = 'already_entered'
      break
    case 'wrong_event':
      result = 'wrong_event'
      break
    case 'forbidden':
      result = 'forbidden'
      break
    default:
      result = 'not_found'
  }
  const message = typeof raw.message === 'string' ? raw.message : undefined
  const eventName = raw.event_name != null ? String(raw.event_name) : null
  return { result, guest, message, eventName }
}
