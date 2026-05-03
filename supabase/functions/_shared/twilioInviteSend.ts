/**
 * לוגיקת שליחת הזמנת WhatsApp דרך Twilio + עדכון DB — משותף ל־send-whatsapp ול־whatsapp-send-queue-worker.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'

export class TwilioInviteError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
    public readonly phase: string,
  ) {
    super(message)
    this.name = 'TwilioInviteError'
  }
}

export type TwilioInviteSendResult = {
  twilio_sid: string
  twilio_status: string
  sent_at: string
  marked_guest_ids: string[]
}

/** מסונכרן עם ‎src/utils/twilioTemplateApproval.ts */
export function twilioTemplateMeetsApprovalGate(
  contentSidRaw: string,
  placeholderSlots: number[],
  statusRaw: string | null | undefined,
): boolean {
  if (!contentSidRaw.startsWith('HX') || placeholderSlots.length === 0) return false
  const st = (statusRaw ?? '').trim().toLowerCase()
  if (!st) return false
  if (/\bpending\b/.test(st)) return false
  if (/\breceived\b/.test(st)) return false
  if (/\breject|\bfail/.test(st)) return false
  if (/\bpaused\b/.test(st)) return false
  return /\bapproved\b/.test(st)
}

export function normalizePhoneForWa(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 10 && digits.startsWith('05')) return `972${digits.slice(1)}`
  if (digits.length === 9 && digits.startsWith('5')) return `972${digits}`
  return digits
}

function formatWhatsAppInviteLink(cardUrls: string[]): string {
  const u = cardUrls.map((x) => x.trim()).filter(Boolean)
  return u[0] ?? ''
}

const DEFAULT_WHATSAPP_INVITE_TEMPLATE =
  'שלום {name},\nהכרטיס האישי שלך (ברקוד / QR):\n{link}\nשמור את הקישור להצגה בכניסה.'

function renderWhatsAppInvite(
  template: string | null | undefined,
  guestName: string,
  cardUrls: string[],
  eventName: string,
): string {
  const linkText = formatWhatsAppInviteLink(cardUrls)
  const t = template?.trim() ? template.trim() : DEFAULT_WHATSAPP_INVITE_TEMPLATE
  return t
    .replace(/\{name\}/g, guestName)
    .replace(/\{links\}/g, linkText)
    .replace(/\{link\}/g, linkText)
    .replace(/\{event\}/g, eventName)
}

function normalizePhoneForDedup(input: string): string {
  let d = input.replace(/\D/g, '')
  if (d.startsWith('972')) {
    d = d.slice(3)
    if (d.length === 9 && d.startsWith('5')) d = `0${d}`
  }
  if (d.length === 9 && d.startsWith('5')) d = `0${d}`
  return d
}

function guestIdentityKey(name: string, phone: string): string {
  const n = name.trim().replace(/\s+/g, ' ').toLowerCase()
  const p = normalizePhoneForDedup(phone)
  return `${n}\u0000${p}`
}

function maskPhoneForAudit(raw: string | null | undefined): string | null {
  const d = String(raw ?? '').replace(/\D/g, '')
  if (!d) return null
  if (d.length <= 4) return '****'
  return `…${d.slice(-4)}`
}

function auditInviteTwilioFail(
  serviceSb: SupabaseClient,
  opts: {
    eventId: string
    guestId: string | null
    guestName?: string | null
    guestPhoneRaw?: string | null
    errorMessage: string
    phase: string
  },
) {
  void serviceSb.rpc('log_service_audit_event', {
    p_action: 'invite.twilio_failed',
    p_entity_type: 'guest',
    p_entity_id: opts.guestId,
    p_event_id: opts.eventId,
    p_status: 'failed',
    p_metadata: {
      error_message: opts.errorMessage,
      phase: opts.phase,
      guest_id: opts.guestId,
      guest_name: opts.guestName != null ? String(opts.guestName).slice(0, 200) : null,
      guest_phone_masked: maskPhoneForAudit(opts.guestPhoneRaw),
      method: 'twilio',
      source: 'edge_function',
    },
  })
}

export async function fetchTwilioBalanceUsd(
  accountSid: string,
  authToken: string,
): Promise<number | null> {
  const balanceUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Balance.json`
  const balRes = await fetch(balanceUrl, {
    headers: { Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}` },
  })
  if (!balRes.ok) return null
  try {
    const balJson = (await balRes.json()) as { balance?: string }
    const balN = Number(balJson.balance)
    return Number.isFinite(balN) ? balN : null
  } catch {
    return null
  }
}

export type SendWhatsAppInviteServiceRoleParams = {
  serviceSb: SupabaseClient
  eventId: string
  guestId: string
  accountSid: string
  authToken: string
  fromWa: string
  publicBase: string
  /** ברירת מחדל true — בודק יתרה ≥ 2 לפני שליחה */
  checkTwilioBalanceMin2?: boolean
  logTag?: string
}

export async function sendWhatsAppInviteServiceRole(
  p: SendWhatsAppInviteServiceRoleParams,
): Promise<TwilioInviteSendResult> {
  const logTag = p.logTag ?? '[twilio-invite]'
  const checkBal = p.checkTwilioBalanceMin2 !== false

  if (checkBal) {
    const balN = await fetchTwilioBalanceUsd(p.accountSid, p.authToken)
    if (balN != null && balN < 2) {
      throw new TwilioInviteError(
        'יתרת Twilio נמוכה מדי (מתחת ל־$2)',
        402,
        'twilio_balance',
      )
    }
  }

  const { data: guestRow, error: guestErr } = await p.serviceSb
    .from('guests')
    .select('id, event_id, name, phone, source, invite_bundle_code')
    .eq('id', p.guestId)
    .maybeSingle()

  if (guestErr) {
    auditInviteTwilioFail(p.serviceSb, {
      eventId: p.eventId,
      guestId: p.guestId,
      errorMessage: guestErr.message.slice(0, 500),
      phase: 'guest_query',
    })
    throw new TwilioInviteError(guestErr.message, 500, 'guest_query')
  }
  if (!guestRow || String(guestRow.event_id) !== p.eventId) {
    auditInviteTwilioFail(p.serviceSb, {
      eventId: p.eventId,
      guestId: p.guestId.trim() ? p.guestId : null,
      errorMessage: 'אורח לא נמצא או לא שייך לאירוע',
      phase: 'guest_lookup',
    })
    throw new TwilioInviteError('אורח לא נמצא', 404, 'guest_lookup')
  }

  if (guestRow.source === 'pay_at_door') {
    auditInviteTwilioFail(p.serviceSb, {
      eventId: p.eventId,
      guestId: p.guestId,
      guestName: String(guestRow.name ?? ''),
      guestPhoneRaw: String(guestRow.phone ?? ''),
      errorMessage: 'אין טלפון לתשלום בכניסה — Twilio לא ישיג',
      phase: 'pay_at_door',
    })
    throw new TwilioInviteError('אין מספר טלפון לתשלום בכניסה', 400, 'pay_at_door')
  }

  const phoneRaw = String(guestRow.phone ?? '').trim()
  if (!phoneRaw) {
    auditInviteTwilioFail(p.serviceSb, {
      eventId: p.eventId,
      guestId: p.guestId,
      guestName: String(guestRow.name ?? ''),
      errorMessage: 'חסר מספר טלפון לאורח',
      phase: 'missing_phone',
    })
    throw new TwilioInviteError('חסר מספר טלפון', 400, 'missing_phone')
  }

  const { data: evRow } = await p.serviceSb
    .from('events')
    .select(
      'name, whatsapp_invite_template, whatsapp_twilio_content_sid, whatsapp_twilio_content_status, whatsapp_twilio_placeholder_slots',
    )
    .eq('id', p.eventId)
    .maybeSingle()

  const eventName =
    evRow?.name != null && String(evRow.name).trim()
      ? String(evRow.name).trim()
      : 'האירוע'
  const inviteTemplate =
    evRow?.whatsapp_invite_template != null &&
    String(evRow.whatsapp_invite_template).trim()
      ? String(evRow.whatsapp_invite_template).trim()
      : null

  const code = encodeURIComponent(String(guestRow.invite_bundle_code ?? '').trim())
  const cardUrl = `${p.publicBase.replace(/\/$/, '')}/ticket/${code}`
  const guestName = String(guestRow.name ?? '').trim() || 'אורח'
  const message = renderWhatsAppInvite(inviteTemplate, guestName, [cardUrl], eventName)

  const rawSlots = evRow?.whatsapp_twilio_placeholder_slots
  const placeholderSlots = Array.isArray(rawSlots)
    ? rawSlots.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n >= 1 && n <= 9)
    : []
  const contentSidRaw =
    evRow?.whatsapp_twilio_content_sid != null
      ? String(evRow.whatsapp_twilio_content_sid).trim()
      : ''
  const useApprovedTemplate =
    contentSidRaw.startsWith('HX') && placeholderSlots.length > 0

  if (
    !twilioTemplateMeetsApprovalGate(
      contentSidRaw,
      placeholderSlots,
      evRow?.whatsapp_twilio_content_status != null
        ? String(evRow.whatsapp_twilio_content_status)
        : null,
    )
  ) {
    auditInviteTwilioFail(p.serviceSb, {
      eventId: p.eventId,
      guestId: p.guestId,
      guestName,
      guestPhoneRaw: phoneRaw,
      errorMessage: 'תבנית ההודעה לא אושרה ב‑Meta לשליחה ב‑Twilio',
      phase: 'template_gate',
    })
    throw new TwilioInviteError(
      'תבנית לא מאושרת לשליחה',
      403,
      'template_gate',
    )
  }

  const digits = normalizePhoneForWa(phoneRaw)
  if (!digits) {
    auditInviteTwilioFail(p.serviceSb, {
      eventId: p.eventId,
      guestId: p.guestId,
      guestName: guestName.slice(0, 160),
      guestPhoneRaw: phoneRaw,
      errorMessage: 'מספר טלפון לא תקין לשליחת WhatsApp',
      phase: 'phone_normalize',
    })
    throw new TwilioInviteError('מספר טלפון לא תקין לשליחת WhatsApp', 400, 'phone_normalize')
  }
  const toAddr = `whatsapp:+${digits}`

  const fromNormalized = p.fromWa.startsWith('whatsapp:') ? p.fromWa : `whatsapp:${p.fromWa}`

  let twilioBody: URLSearchParams
  if (useApprovedTemplate) {
    const vars: Record<string, string> = {}
    if (placeholderSlots.includes(1)) vars['1'] = guestName
    if (placeholderSlots.includes(2)) vars['2'] = cardUrl
    if (placeholderSlots.includes(3)) vars['3'] = eventName
    twilioBody = new URLSearchParams({
      From: fromNormalized,
      To: toAddr,
      ContentSid: contentSidRaw,
      ContentVariables: JSON.stringify(vars),
    })
  } else {
    twilioBody = new URLSearchParams({
      From: fromNormalized,
      To: toAddr,
      Body: message,
    })
  }

  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${p.accountSid}/Messages.json`
  const basic = btoa(`${p.accountSid}:${p.authToken}`)
  console.log(`${logTag} twilio request`, {
    toE164Len: digits.length,
    useApprovedTemplate,
    guestId: p.guestId.slice(0, 8),
  })

  const twRes = await fetch(twilioUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body: twilioBody.toString(),
  })

  const twText = await twRes.text()
  if (!twRes.ok) {
    let detail = twText.slice(0, 400)
    try {
      const twJson = JSON.parse(twText) as { message?: string; code?: number }
      if (twJson.message) detail = twJson.message
      if (twRes.status === 402 || twJson.code === 20003) {
        auditInviteTwilioFail(p.serviceSb, {
          eventId: p.eventId,
          guestId: p.guestId,
          guestName,
          guestPhoneRaw: phoneRaw,
          errorMessage: `Twilio 402: ${detail.slice(0, 400)}`,
          phase: 'twilio_402',
        })
        throw new TwilioInviteError(detail, 402, 'twilio_402')
      }
    } catch (e) {
      if (e instanceof TwilioInviteError) throw e
    }
    console.error(`${logTag} twilio http error`, { status: twRes.status, detail: detail.slice(0, 300) })
    auditInviteTwilioFail(p.serviceSb, {
      eventId: p.eventId,
      guestId: p.guestId,
      guestName,
      guestPhoneRaw: phoneRaw,
      errorMessage: `Twilio HTTP ${twRes.status}: ${detail.slice(0, 400)}`,
      phase: 'twilio_http',
    })
    throw new TwilioInviteError(detail, twRes.status >= 400 && twRes.status < 600 ? twRes.status : 502, 'twilio_http')
  }

  let twilioSid = ''
  let twMsgStatus = 'queued'
  try {
    const twOk = JSON.parse(twText) as { sid?: string; status?: string }
    twilioSid = twOk.sid ?? ''
    if (twOk.status) twMsgStatus = String(twOk.status).trim().toLowerCase()
  } catch {
    /* ignore */
  }

  const logBody = useApprovedTemplate ? '[תבנית WhatsApp]' : message.slice(0, 1600)
  const { error: msgInsErr } = await p.serviceSb.from('whatsapp_messages').insert({
    event_id: p.eventId,
    guest_id: p.guestId,
    from_phone: fromNormalized,
    to_phone: toAddr,
    body: logBody,
    direction: 'outbound',
    status: twMsgStatus,
    twilio_sid: twilioSid || null,
    message_kind: 'invite',
  })
  if (msgInsErr) {
    console.error(`${logTag} whatsapp_messages insert failed`, msgInsErr.message)
  }

  const { data: allGuests, error: errAll } = await p.serviceSb
    .from('guests')
    .select('id, name, phone')
    .eq('event_id', p.eventId)
    .is('deleted_at', null)

  if (errAll || !allGuests) {
    auditInviteTwilioFail(p.serviceSb, {
      eventId: p.eventId,
      guestId: p.guestId,
      guestName,
      guestPhoneRaw: phoneRaw,
      errorMessage: errAll?.message?.slice(0, 500) ?? 'רשימת אורחים נכשלה אחרי Twilio',
      phase: 'db_list_guests_after_twilio',
    })
    throw new TwilioInviteError(
      errAll?.message ?? 'עדכון DB נכשל',
      500,
      'db_list_guests_after_twilio',
    )
  }

  const key = guestIdentityKey(String(guestRow.name ?? ''), String(guestRow.phone ?? ''))
  const ids = allGuests
    .filter(
      (g) =>
        guestIdentityKey(String(g.name ?? ''), String(g.phone ?? '')) === key,
    )
    .map((g) => g.id as string)

  const whatsapp_invite_sent_at = new Date().toISOString()
  const { error: errUp } = await p.serviceSb
    .from('guests')
    .update({
      whatsapp_invite_sent_at,
      invite_sent_method: 'twilio',
      whatsapp_invite_twilio_sid: twilioSid || null,
      whatsapp_invite_twilio_status: twMsgStatus,
    })
    .in('id', ids)
    .is('deleted_at', null)

  if (errUp) {
    auditInviteTwilioFail(p.serviceSb, {
      eventId: p.eventId,
      guestId: p.guestId,
      guestName,
      guestPhoneRaw: phoneRaw,
      errorMessage: errUp.message.slice(0, 500),
      phase: 'db_mark_sent_after_twilio',
    })
    throw new TwilioInviteError(errUp.message, 500, 'db_mark_sent_after_twilio')
  }

  console.log(`${logTag} done`, { markedCount: ids.length, twilioSid: twilioSid ? `${twilioSid.slice(0, 8)}…` : null })

  return {
    twilio_sid: twilioSid,
    twilio_status: twMsgStatus,
    sent_at: whatsapp_invite_sent_at,
    marked_guest_ids: ids,
  }
}
