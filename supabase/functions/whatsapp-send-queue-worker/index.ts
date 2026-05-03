/**
 * Worker: מעבד תור whatsapp_send_queue — Cron כל דקה (Authorization: Bearer SERVICE_ROLE_KEY).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'
import {
  fetchTwilioBalanceUsd,
  sendWhatsAppInviteServiceRole,
  TwilioInviteError,
} from '../_shared/twilioInviteSend.ts'

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

const BACKOFF_SEC = [60, 120, 240]

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  const auth = req.headers.get('Authorization')?.trim()
  if (!serviceKey || auth !== `Bearer ${serviceKey}`) {
    return json({ error: 'Forbidden' }, 403)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim()
  if (!supabaseUrl) return json({ error: 'Server misconfigured' }, 500)

  const serviceSb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')?.trim()
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')?.trim()
  const fromWa = Deno.env.get('TWILIO_WHATSAPP_FROM')?.trim()
  const publicBase = (
    Deno.env.get('VITE_PUBLIC_FRONTEND_URL') ??
    Deno.env.get('PUBLIC_FRONTEND_URL') ??
    ''
  )
    .trim()
    .replace(/\/$/, '')

  if (!accountSid || !authToken || !fromWa || !publicBase) {
    return json({ ok: false, error: 'Twilio/PUBLIC_URL not configured', processed: 0 }, 503)
  }

  const bal = await fetchTwilioBalanceUsd(accountSid, authToken)
  if (bal != null && bal < 2) {
    console.log('[wa-queue-worker] balance below 2 — skip run', { bal })
    return json({ ok: true, processed: 0, skippedReason: 'low_balance', balance: bal }, 200)
  }

  const staleBefore = new Date(Date.now() - 15 * 60_000).toISOString()
  await serviceSb
    .from('whatsapp_send_queue')
    .update({
      status: 'pending',
      last_error: 'processing timeout — ניסיון חוזר',
    })
    .eq('status', 'processing')
    .lt('updated_at', staleBefore)

  const { data: claimed, error: claimErr } = await serviceSb.rpc(
    'claim_whatsapp_send_queue_batch',
    { p_limit: 20 },
  )

  if (claimErr) {
    console.error('[wa-queue-worker] claim failed', claimErr.message)
    return json({ ok: false, error: claimErr.message, processed: 0 }, 500)
  }

  const rows = (claimed ?? []) as Array<{
    id: string
    event_id: string
    guest_id: string
    attempts: number
  }>

  let processed = 0
  let stopped402 = false

  for (const row of rows) {
    if (stopped402) {
      await serviceSb
        .from('whatsapp_send_queue')
        .update({
          status: 'pending',
          last_error: 'נעצר בגלל 402/יתרה — ינוסה בריצה הבאה',
        })
        .eq('id', row.id)
        .eq('status', 'processing')
      continue
    }

    const { data: guest } = await serviceSb
      .from('guests')
      .select('id, whatsapp_invite_sent_at, deleted_at')
      .eq('id', row.guest_id)
      .maybeSingle()

    if (!guest || guest.deleted_at != null) {
      await serviceSb
        .from('whatsapp_send_queue')
        .update({ status: 'canceled', last_error: 'אורח לא קיים או נמחק' })
        .eq('id', row.id)
      processed++
      continue
    }
    if (guest.whatsapp_invite_sent_at != null) {
      await serviceSb
        .from('whatsapp_send_queue')
        .update({ status: 'canceled', last_error: 'כבר נשלחה הזמנה' })
        .eq('id', row.id)
      processed++
      continue
    }

    try {
      const out = await sendWhatsAppInviteServiceRole({
        serviceSb,
        eventId: row.event_id,
        guestId: row.guest_id,
        accountSid,
        authToken,
        fromWa,
        publicBase,
        checkTwilioBalanceMin2: false,
        logTag: '[wa-queue-worker]',
      })
      await serviceSb
        .from('whatsapp_send_queue')
        .update({
          status: 'sent',
          twilio_sid: out.twilio_sid || null,
          last_error: null,
        })
        .eq('id', row.id)
      processed++
    } catch (e) {
      const attempt = (row.attempts ?? 0) + 1
      if (e instanceof TwilioInviteError && e.httpStatus === 402) {
        stopped402 = true
        await serviceSb
          .from('whatsapp_send_queue')
          .update({
            status: 'pending',
            attempts: attempt,
            last_error: e.message.slice(0, 500),
          })
          .eq('id', row.id)
        processed++
        continue
      }

      const msg = e instanceof Error ? e.message.slice(0, 500) : 'שגיאה'
      if (attempt >= 3) {
        await serviceSb
          .from('whatsapp_send_queue')
          .update({
            status: 'failed',
            attempts: attempt,
            last_error: msg,
          })
          .eq('id', row.id)
      } else {
        const sec = BACKOFF_SEC[attempt - 1] ?? 120
        const next = new Date(Date.now() + sec * 1000).toISOString()
        await serviceSb
          .from('whatsapp_send_queue')
          .update({
            status: 'pending',
            attempts: attempt,
            last_error: msg,
            send_after: next,
          })
          .eq('id', row.id)
      }
      processed++
    }
  }

  return json(
    {
      ok: true,
      processed,
      claimed: rows.length,
      stopped402,
    },
    200,
  )
})
