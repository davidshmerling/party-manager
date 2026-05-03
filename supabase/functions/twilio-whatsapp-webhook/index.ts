/**
 * Webhook Twilio: הודעות נכנסות + עדכוני סטטוס (sent / delivered / read).
 * POST ‎application/x-www-form-urlencoded — ללא JWT (מוגדר ב־config.toml ‎verify_jwt = false).
 * Secrets: TWILIO_AUTH_TOKEN, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL
 * אופציונלי: TWILIO_SKIP_SIGNATURE=1 (רק פיתוח מקומי)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'
import { createHmac } from 'node:crypto'

function log(line: string) {
  console.log(`[twilio-whatsapp-webhook] ${line}`)
}

function logErr(line: string) {
  console.error(`[twilio-whatsapp-webhook] ${line}`)
}

function parseForm(body: string): Record<string, string> {
  const p = new URLSearchParams(body)
  const o: Record<string, string> = {}
  for (const [k, v] of p.entries()) {
    o[k] = v
  }
  return o
}

function twilioSignatureValid(
  authToken: string,
  signature: string | null,
  url: string,
  params: Record<string, string>,
): boolean {
  if (!signature) return false
  const sortedKeys = Object.keys(params).sort()
  let data = url
  for (const k of sortedKeys) {
    data += k + (params[k] ?? '')
  }
  const mac = createHmac('sha1', authToken).update(data, 'utf8').digest('base64')
  return mac === signature
}

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-twilio-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function xmlOk(): Response {
  return new Response(
    '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    { status: 200, headers: { 'Content-Type': 'text/xml; charset=utf-8', ...corsHeaders } },
  )
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim()
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')?.trim()
  if (!supabaseUrl || !serviceKey || !authToken) {
    logErr('missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or TWILIO_AUTH_TOKEN')
    return new Response('Server misconfigured', { status: 500, headers: corsHeaders })
  }

  const rawBody = await req.text()
  const params = parseForm(rawBody)
  const skipSig = Deno.env.get('TWILIO_SKIP_SIGNATURE') === '1'
  const sig = req.headers.get('X-Twilio-Signature')
  const publicUrl = (Deno.env.get('TWILIO_WEBHOOK_PUBLIC_URL') ?? req.url).split('?')[0] ?? req.url

  if (!skipSig && !twilioSignatureValid(authToken, sig, publicUrl, params)) {
    logErr('invalid Twilio signature', { publicUrl: publicUrl.slice(0, 80) })
    return new Response('Forbidden', { status: 403, headers: corsHeaders })
  }

  const serviceSb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const messageSid = (params.MessageSid ?? params.SmsSid ?? '').trim()
  const messageStatus = (params.MessageStatus ?? '').trim().toLowerCase()
  const smsStatus = (params.SmsStatus ?? '').trim().toLowerCase()

  /** כמו ב-API של Twilio; לעיתים רק MessageStatus או רק SmsStatus (לא «received» של נכנסות) */
  const lifecycle = new Set(['queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'undelivered', 'canceled'])
  const statusFromCallback =
    messageStatus && lifecycle.has(messageStatus)
      ? messageStatus
      : smsStatus && lifecycle.has(smsStatus)
        ? smsStatus
        : ''

  /**
   * עדכון סטטוס יוצא: whatsapp_messages.status + guests.whatsapp_invite_twilio_status (רק אם SID תואם להזמנה).
   * delivered / read / sent וכו׳ — לפי status callbacks של Twilio.
   */
  if (messageSid && statusFromCallback) {
    const st = statusFromCallback
    const { error: upMsgErr } = await serviceSb
      .from('whatsapp_messages')
      .update({ status: st })
      .eq('twilio_sid', messageSid)

    if (upMsgErr) {
      logErr('update whatsapp_messages status', { message: upMsgErr.message, messageSid })
    }

    const { error: upGuestErr } = await serviceSb
      .from('guests')
      .update({ whatsapp_invite_twilio_status: st })
      .eq('whatsapp_invite_twilio_sid', messageSid)
      .is('deleted_at', null)

    if (upGuestErr) {
      logErr('update guests invite status', { message: upGuestErr.message })
    }

    log('status', { messageSid, st })
    return xmlOk()
  }

  /**
   * הודעה נכנסת: שורה ב-whatsapp_messages + עדכון whatsapp_last_inbound_at לכל כרטיסי אותה זהות.
   * Twilio: לרוב SmsStatus=received או MessageStatus=received על אותו SID.
   */
  const from = (params.From ?? '').trim()
  const to = (params.To ?? '').trim()
  const body = params.Body ?? ''
  const isInbound = Boolean(
    messageSid &&
      from &&
      (smsStatus === 'received' ||
        messageStatus === 'received' ||
        (params.SmsMessageStatus ?? '').trim().toLowerCase() === 'received'),
  )
  if (!isInbound) {
    log('ignored webhook', {
      messageSid: messageSid ? `${messageSid.slice(0, 8)}…` : '',
      messageStatus,
      smsStatus,
      keys: Object.keys(params).slice(0, 14),
    })
    return xmlOk()
  }

  const { data: pick, error: pickErr } = await serviceSb.rpc('pick_guest_for_inbound_whatsapp', {
    p_from_raw: from,
  })

  if (pickErr) {
    logErr('pick_guest rpc', { message: pickErr.message })
    return xmlOk()
  }

  const row = Array.isArray(pick) ? (pick as { guest_id?: string; event_id?: string }[])[0] : null
  const guestId = row?.guest_id?.trim()
  const eventId = row?.event_id?.trim()
  if (!guestId || !eventId) {
    log('no guest match for inbound', { from: from.slice(0, 24) })
    return xmlOk()
  }

  const nowIso = new Date().toISOString()

  const { error: insErr } = await serviceSb.from('whatsapp_messages').insert({
    event_id: eventId,
    guest_id: guestId,
    from_phone: from,
    to_phone: to,
    body: body.slice(0, 4000),
    direction: 'inbound',
    status: 'received',
    twilio_sid: messageSid,
    message_kind: 'session',
  })

  if (insErr) {
    if (insErr.code === '23505') {
      log('duplicate inbound sid', { messageSid })
    } else {
      logErr('insert inbound', { message: insErr.message })
    }
    return xmlOk()
  }

  const { data: sibIds, error: sibErr } = await serviceSb.rpc('guest_ids_same_identity_in_event', {
    p_event_id: eventId,
    p_seed_ids: [guestId],
  })
  const ids =
    !sibErr && Array.isArray(sibIds) && sibIds.length > 0
      ? (sibIds as string[])
      : [guestId]

  const { error: gErr } = await serviceSb
    .from('guests')
    .update({ whatsapp_last_inbound_at: nowIso })
    .in('id', ids)
    .is('deleted_at', null)

  if (gErr) {
    logErr('update guest last_inbound', { message: gErr.message })
  }

  log('inbound ok', { guestId, eventId, sid: messageSid.slice(0, 10) })
  return xmlOk()
})
