/**
 * ייבוא מרוכז אורחים מהטקסט שהודבק — פרסור, ולידציה, DB, תור WhatsApp.
 * POST JSON: { eventId, text }
 * Authorization: Bearer <JWT>
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'
import {
  twilioTemplateMeetsApprovalGate,
} from '../_shared/twilioInviteSend.ts'

const GUEST_SELECT =
  'id, event_id, name, phone, source, unique_code, invite_bundle_code, status, entered_at, card_opened_at, whatsapp_invite_sent_at, invite_sent_method, whatsapp_last_inbound_at, whatsapp_invite_twilio_sid, whatsapp_invite_twilio_status, created_at, updated_at'

const FINANCE_SELECT =
  'id, event_id, line_kind, person_name, phone, amount, recipient_admin_id, transfer_from_admin_id, income_recipient_kind, is_paid, created_by, created_at, updated_at'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

function formatIsraelMobileE164(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 12 && digits.startsWith('972') && digits[3] === '5') {
    return `+${digits}`
  }
  if (digits.length === 10 && digits.startsWith('05')) {
    return `+972${digits.slice(1)}`
  }
  if (digits.length === 9 && digits.startsWith('5')) {
    return `+972${digits}`
  }
  return null
}

type ParsedLine = { name: string; phone: string; adminToken: string; amount: number }

function parseGuestBulkFinanceLine(line: string): ParsedLine | null {
  const t = line.replace(/\t/g, ' ').trim()
  if (!t) return null
  const tokens = t.split(/\s+/).filter(Boolean)
  const n = tokens.length
  if (n < 4) return null
  const amountRaw = tokens[n - 1]!.replace(',', '.')
  const amount = Number(amountRaw)
  if (!Number.isFinite(amount) || amount < 0) return null
  const admin = tokens[n - 2]!
  const phone = tokens[n - 3]!
  const name = tokens.slice(0, n - 3).join(' ')
  const phoneNorm = phone.trim().slice(0, 64)
  const nameTrim = name.trim()
  if (!nameTrim || !phoneNorm || !admin.trim()) return null
  return {
    name: nameTrim,
    phone: phoneNorm,
    adminToken: admin.trim(),
    amount,
  }
}

function shortLinePreview(line: string, max = 72): string {
  const t = line.trim().replace(/\s+/g, ' ')
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

type AdminRow = {
  user_id: string
  email: string
  display_name: string
  is_admin: boolean
  is_partner: boolean
}

type StaffJson = {
  id: string
  user_id: string
  email: string
  role: string
  created_at: string
}

function payboxToken(t: string): boolean {
  const s = t.trim()
  if (s === 'פייבוקס' || s === 'פיי־בוקס' || s === 'פיי בוקס') return true
  return s.toLowerCase() === 'paybox'
}

function selectorKeywordToken(t: string): boolean {
  const s = t.trim()
  if (s === 'סלקטור' || s === 'סורק') return true
  const low = s.toLowerCase()
  return low === 'selector' || low === 'scanner'
}

function firstPartnerId(admins: AdminRow[]): string | null {
  const partners = [...admins].filter((a) => a.is_partner)
  if (partners.length === 0) return null
  partners.sort((a, b) => a.user_id.localeCompare(b.user_id))
  return partners[0]!.user_id
}

function scannersForEvent(staff: StaffJson[]): StaffJson[] {
  return staff
    .filter((r) => r.role === 'scanner')
    .sort((a, b) => {
      const ca = a.created_at || ''
      const cb = b.created_at || ''
      if (ca !== cb) return ca.localeCompare(cb)
      return a.user_id.localeCompare(b.user_id)
    })
}

function resolvePartnerNameTokenToRecipientId(token: string, admins: AdminRow[]): string | null {
  const t = token.trim()
  if (!t) return null
  const partners = admins.filter((a) => a.is_partner)
  for (const a of partners) {
    const d = a.display_name?.trim()
    const label = d || a.email || ''
    if (label === t) return a.user_id
    const first = label.split(/\s+/)[0] ?? ''
    if (first === t) return a.user_id
  }
  return null
}

type IncomeRecipientResolve = { id: string; kind: 'paybox' | 'selector' | 'partner' }

function resolveIncomeRecipientWithKind(
  token: string,
  admins: AdminRow[],
  eventStaff: StaffJson[],
): IncomeRecipientResolve | null {
  if (payboxToken(token)) {
    const id = firstPartnerId(admins)
    return id ? { id, kind: 'paybox' } : null
  }
  if (selectorKeywordToken(token)) {
    const scanners = scannersForEvent(eventStaff)
    if (scanners.length === 1) return { id: scanners[0]!.user_id, kind: 'selector' }
    return null
  }
  const id = resolvePartnerNameTokenToRecipientId(token, admins)
  return id ? { id, kind: 'partner' } : null
}

function generateUniqueCode(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

  let bodyIn: { eventId?: unknown; text?: unknown }
  try {
    bodyIn = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const eventId = typeof bodyIn.eventId === 'string' ? bodyIn.eventId.trim() : ''
  const text = typeof bodyIn.text === 'string' ? bodyIn.text : ''
  if (!eventId) return json({ error: 'eventId נדרש' }, 400)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim()
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')?.trim()
  if (!supabaseUrl || !anonKey) return json({ error: 'Server misconfigured' }, 500)

  const userSb = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
    error: userErr,
  } = await userSb.auth.getUser()
  if (userErr || !user) return json({ error: 'Unauthorized' }, 401)

  const { data: admins, error: adErr } = await userSb.rpc('list_global_users_for_staff')
  if (adErr || !Array.isArray(admins)) {
    return json(
      { error: adErr?.message ?? 'לא ניתן לטעון משתמשים לשיוך תשלום' },
      502,
    )
  }

  const { data: staffJson, error: stErr } = await userSb.rpc('list_event_staff', {
    p_event_id: eventId,
  })
  if (stErr) {
    return json({ error: stErr.message ?? 'אין הרשאה לאירוע' }, 403)
  }
  const eventStaff: StaffJson[] = Array.isArray(staffJson)
    ? (staffJson as StaffJson[])
    : typeof staffJson === 'string'
      ? (JSON.parse(staffJson) as StaffJson[])
      : []

  const adminRows = admins as unknown as AdminRow[]

  const { data: evRow } = await userSb
    .from('events')
    .select(
      'whatsapp_twilio_content_sid, whatsapp_twilio_content_status, whatsapp_twilio_placeholder_slots',
    )
    .eq('id', eventId)
    .maybeSingle()

  const rawSlots = evRow?.whatsapp_twilio_placeholder_slots
  const placeholderSlots = Array.isArray(rawSlots)
    ? rawSlots.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n >= 1 && n <= 9)
    : []
  const contentSidRaw =
    evRow?.whatsapp_twilio_content_sid != null
      ? String(evRow.whatsapp_twilio_content_sid).trim()
      : ''
  const templateApproved = twilioTemplateMeetsApprovalGate(
    contentSidRaw,
    placeholderSlots,
    evRow?.whatsapp_twilio_content_status != null
      ? String(evRow.whatsapp_twilio_content_status)
      : null,
  )

  const rawLines = text.split(/\r?\n/)
  const errors: string[] = []
  let skipped = 0
  const seenNormLine = new Set<string>()
  type WorkRow = { displayNum: number; parsed: ParsedLine; linePreview: string }
  const work: WorkRow[] = []

  let displayLineNum = 0
  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i]!
    if (!raw.trim()) continue
    const norm = raw.trim().replace(/\s+/g, ' ')
    if (seenNormLine.has(norm)) {
      skipped++
      continue
    }
    seenNormLine.add(norm)
    displayLineNum += 1
    const parsed = parseGuestBulkFinanceLine(raw.trim())
    if (!parsed) {
      errors.push(
        `שורה ${displayLineNum}: פורמט שגוי — צריך: שם · טלפון · אדמין · סכום — ${shortLinePreview(raw)}`,
      )
      continue
    }
    const resolved = resolveIncomeRecipientWithKind(parsed.adminToken, adminRows, eventStaff)
    if (!resolved) {
      if (payboxToken(parsed.adminToken) && !firstPartnerId(adminRows)) {
        errors.push(
          `שורה ${displayLineNum}: «פייבוקס» — אין שותף במערכת לשיוך; נדרש לפחות שותף אחד.`,
        )
        continue
      }
      if (selectorKeywordToken(parsed.adminToken)) {
        const scanList = scannersForEvent(eventStaff)
        if (scanList.length === 0) {
          errors.push(
            `שורה ${displayLineNum}: «סלקטור»/«סורק» — לא הוגדר סורק לאירוע.`,
          )
          continue
        }
        if (scanList.length > 1) {
          errors.push(
            `שורה ${displayLineNum}: «סלקטור»/«סורק» — יש ${scanList.length} סורקים; כתבו שם קובל תשלום במקום «סלקטור».`,
          )
          continue
        }
      }
      errors.push(
        `שורה ${displayLineNum}: לא נמצא שותף ל־«${parsed.adminToken}» — ${shortLinePreview(raw)}`,
      )
      continue
    }
    work.push({ displayNum: displayLineNum, parsed, linePreview: shortLinePreview(raw) })
  }

  if (errors.length > 0) {
    return json({
      ok: false as const,
      added: 0,
      skipped,
      queuedForWhatsapp: 0,
      errors,
      createdGuests: [],
      financeLinesCreated: [],
    }, 200)
  }

  if (work.length === 0) {
    return json({
      ok: true as const,
      added: 0,
      skipped,
      queuedForWhatsapp: 0,
      errors: [],
      createdGuests: [],
      financeLinesCreated: [],
    }, 200)
  }

  const createdGuests: Record<string, unknown>[] = []
  const financeLinesCreated: Record<string, unknown>[] = []
  const queueGuestIds: string[] = []
  let added = 0

  for (const w of work) {
    const { name: n, phone: p, amount } = w.parsed
    const resolved = resolveIncomeRecipientWithKind(
      w.parsed.adminToken,
      adminRows,
      eventStaff,
    )!
    try {
      const { data: siblingBundle } = await userSb.rpc(
        'lookup_invite_bundle_code_for_event_identity',
        {
          p_event_id: eventId,
          p_name: n.trim(),
          p_phone: p.trim(),
        },
      )
      const bundle =
        siblingBundle != null && String(siblingBundle).trim()
          ? String(siblingBundle).trim()
          : null
      const wasFirstIdentityTicket = bundle == null

      let guest: Record<string, unknown> | null = null
      let lastInsErr: { code?: string; message: string } | null = null
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateUniqueCode()
        const inviteBundle = bundle ?? code
        const { data: ins, error: insErr } = await userSb
          .from('guests')
          .insert({
            name: n.trim(),
            phone: p.trim(),
            unique_code: code,
            invite_bundle_code: inviteBundle,
            status: 'pending',
            event_id: eventId,
            source: 'list',
          })
          .select(GUEST_SELECT)
          .single()
        if (!insErr && ins) {
          guest = ins as Record<string, unknown>
          break
        }
        lastInsErr = insErr
          ? { code: insErr.code, message: insErr.message }
          : { message: 'insert failed' }
        if (insErr?.code !== '23505') break
      }
      if (!guest) {
        errors.push(
          `שורה ${w.displayNum}: לא נשמר אורח — ${lastInsErr?.message ?? 'שגיאה'}`,
        )
        continue
      }
      const guestId = String(guest.id)
      added++

      const { data: fin, error: finErr } = await userSb
        .from('event_finance_lines')
        .insert({
          event_id: eventId,
          line_kind: 'income',
          person_name: n.trim(),
          phone: p.trim(),
          amount,
          recipient_admin_id: resolved.id,
          income_recipient_kind: resolved.kind,
          is_paid: false,
          created_by: user.id,
        })
        .select(FINANCE_SELECT)
        .single()

      if (finErr) {
        await userSb.from('guests').delete().eq('id', guestId)
        errors.push(`שורה ${w.displayNum}: שמירת כספים נכשלה — ${finErr.message}`)
        added--
        continue
      }

      createdGuests.push(guest)
      if (fin) financeLinesCreated.push(fin as Record<string, unknown>)

      if (
        wasFirstIdentityTicket &&
        templateApproved &&
        formatIsraelMobileE164(p.trim()) != null &&
        String(guest.source ?? 'list') !== 'pay_at_door'
      ) {
        queueGuestIds.push(guestId)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'שגיאה'
      errors.push(`שורה ${w.displayNum}: ${msg}`)
    }
  }

  let queuedForWhatsapp = 0
  if (queueGuestIds.length > 0) {
    const batchStart = Date.now() + 60_000
    const batchEnd = Date.now() + 600_000
    const nq = queueGuestIds.length
    const rows = queueGuestIds.map((guest_id, i) => {
      const segLo = batchStart + (i * (batchEnd - batchStart)) / nq
      const segHi = batchStart + ((i + 1) * (batchEnd - batchStart)) / nq
      const sendAfter = new Date(segLo + Math.random() * Math.max(1, segHi - segLo)).toISOString()
      return {
        event_id: eventId,
        guest_id,
        status: 'pending' as const,
        attempts: 0,
        send_after: sendAfter,
      }
    })
    const { error: qErr } = await userSb.from('whatsapp_send_queue').insert(rows)
    if (qErr) {
      errors.push(`תור WhatsApp: ${qErr.message}`)
    } else {
      queuedForWhatsapp = rows.length
    }
  }

  return json({
    ok: errors.length === 0,
    added,
    skipped,
    queuedForWhatsapp,
    errors,
    createdGuests,
    financeLinesCreated,
  }, 200)
})
