import type { EventFinanceLine, IncomeRecipientKind } from '../../../types/finance'
import type { Guest } from '../../../types/guest'
import { generateUniqueCode } from '../../../utils/codeGenerator'
import { guestIdentityKey } from '../../../utils/guestIdentity'
import { mapGuestRow } from '../mappers'
import { sb, errMsg } from '../client'
import { insertEventFinanceLine } from '../finance'
import { GUEST_ROW_COLUMNS } from './constants'

export type CreateGuestOptions = {
  skipIncomeLine?: boolean
  incomeRecipientAdminId?: string
  /** ברירה ‎partner — חובה לשורות ‎income (פייבוקס / שותף / סלקטור) */
  incomeRecipientKind?: IncomeRecipientKind
  isPaid?: boolean
  amount?: number
}

export type CreateGuestResult = {
  guest: Guest
  /** נוצרה שורת הכנסה — לעדכון מקומי בלי `fetch` מלא */
  financeLine: EventFinanceLine | null
}

async function lookupInviteBundleForNewCard(
  eventId: string,
  name: string,
  phone: string,
): Promise<string | null> {
  const { data, error } = await sb().rpc('lookup_invite_bundle_code_for_event_identity', {
    p_event_id: eventId,
    p_name: name,
    p_phone: phone,
  })
  if (error) throw new Error(errMsg(error))
  if (data == null || data === '') return null
  return String(data)
}

export async function createGuest(
  name: string,
  phone: string,
  eventId: string,
  options?: CreateGuestOptions,
): Promise<CreateGuestResult> {
  const n = name.trim()
  const p = phone.trim()
  const client = sb()
  const siblingBundle = await lookupInviteBundleForNewCard(eventId, n, p)
  for (let i = 0; i < 5; i++) {
    const code = generateUniqueCode()
    const bundle = siblingBundle ?? code
    const { data, error } = await client
      .from('guests')
      .insert({
        name: n,
        phone: p,
        unique_code: code,
        invite_bundle_code: bundle,
        status: 'pending',
        event_id: eventId,
      })
      .select(GUEST_ROW_COLUMNS)
      .single()
    if (!error && data) {
      const guest = mapGuestRow(data as Record<string, unknown>)
      const withIncome =
        !options?.skipIncomeLine && Boolean(options?.incomeRecipientAdminId?.trim())
      if (withIncome) {
        try {
          const amt = options?.amount
          const line = await insertEventFinanceLine({
            eventId,
            lineKind: 'income',
            personName: n,
            phone: p,
            amount: typeof amt === 'number' && Number.isFinite(amt) ? amt : 0,
            recipientAdminId: options!.incomeRecipientAdminId!,
            incomeRecipientKind: options?.incomeRecipientKind ?? 'partner',
            isPaid: options?.isPaid ?? false,
          })
          return { guest, financeLine: line }
        } catch (e) {
          await client.from('guests').delete().eq('id', guest.id)
          throw e instanceof Error ? e : new Error('שמירת הכספים נכשלה — האורח לא נשמר')
        }
      }
      return { guest, financeLine: null }
    }
    if (error?.code !== '23505') throw new Error(errMsg(error))
  }
  throw new Error('לא ניתן ליצור קוד ייחודי')
}

export async function updateGuest(
  id: string,
  body: Partial<
    Pick<
      Guest,
      | 'name'
      | 'phone'
      | 'status'
      | 'entered_at'
      | 'whatsapp_invite_sent_at'
      | 'invite_sent_method'
      | 'card_opened_at'
    >
  >,
): Promise<Guest> {
  const patch: Record<string, string | null> = {}
  if (body.name !== undefined) patch.name = body.name.trim()
  if (body.phone !== undefined) patch.phone = body.phone.trim()
  if (body.status !== undefined) patch.status = body.status
  if (body.entered_at !== undefined) patch.entered_at = body.entered_at
  if (body.whatsapp_invite_sent_at !== undefined) {
    patch.whatsapp_invite_sent_at = body.whatsapp_invite_sent_at
  }
  if (body.invite_sent_method !== undefined) {
    patch.invite_sent_method = body.invite_sent_method?.trim()
      ? body.invite_sent_method.trim()
      : null
  }
  if (body.card_opened_at !== undefined) {
    patch.card_opened_at = body.card_opened_at
  }
  const { data, error } = await sb()
    .from('guests')
    .update(patch)
    .eq('id', id)
    .is('deleted_at', null)
    .select(GUEST_ROW_COLUMNS)
    .single()
  if (error) throw new Error(errMsg(error))
  if (!data) throw new Error('אורח לא נמצא')
  return mapGuestRow(data as Record<string, unknown>)
}

export async function deleteGuest(id: string): Promise<void> {
  await deleteGuestsByIds([id])
}

/** אחרי הסרה מהרשימה: מוחק שורות הכנסה (אורח) אם אין עוד אורח פעיל עם אותו שם+פלאפון באירוע */
async function cleanupOrphanGuestIncomeLines(
  client: ReturnType<typeof sb>,
  removed: { event_id: string; name: string; phone: string }[],
): Promise<void> {
  if (removed.length === 0) return
  const byEvent = new Set(removed.map((r) => r.event_id))
  for (const eventId of byEvent) {
    const { data: rem } = await client
      .from('guests')
      .select('name, phone')
      .eq('event_id', eventId)
      .is('deleted_at', null)
    const still = new Set(
      (rem ?? []).map((g) => guestIdentityKey(String(g.name), String(g.phone))),
    )
    const seen = new Set<string>()
    for (const r of removed) {
      if (r.event_id !== eventId) continue
      const k = guestIdentityKey(r.name, r.phone)
      if (still.has(k) || seen.has(k)) continue
      seen.add(k)
      const { error } = await client
        .from('event_finance_lines')
        .delete()
        .eq('event_id', eventId)
        .eq('line_kind', 'income')
        .eq('person_name', r.name.trim())
        .eq('phone', r.phone.trim())
      if (error) throw new Error(errMsg(error))
    }
  }
}

/** הסרת אורחים מהרשימה — מחיקה רכה (deleted_at), לא מחיקה פיזית */
export async function deleteGuestsByIds(ids: string[]): Promise<void> {
  const uniq = [...new Set(ids.map((x) => x.trim()).filter(Boolean))]
  if (uniq.length === 0) return
  const client = sb()
  const { data: rows, error: fetchErr } = await client
    .from('guests')
    .select('id, event_id, name, phone')
    .in('id', uniq)
    .is('deleted_at', null)
  if (fetchErr) throw new Error(errMsg(fetchErr))
  const toRemove = (rows ?? []) as { id: string; event_id: string; name: string; phone: string }[]
  if (toRemove.length === 0) return
  const now = new Date().toISOString()
  const CHUNK = 200
  const idsToSoftDelete = toRemove.map((r) => r.id)
  for (let i = 0; i < idsToSoftDelete.length; i += CHUNK) {
    const chunk = idsToSoftDelete.slice(i, i + CHUNK)
    const { error } = await client
      .from('guests')
      .update({ deleted_at: now, updated_at: now })
      .in('id', chunk)
      .is('deleted_at', null)
    if (error) throw new Error(errMsg(error))
  }
  await cleanupOrphanGuestIncomeLines(
    client,
    toRemove.map((r) => ({ event_id: r.event_id, name: r.name, phone: r.phone })),
  )
}
