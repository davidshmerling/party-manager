/**
 * שליחת הזמנת WhatsApp דרך Twilio (שרת בלבד — Credential ב-Secrets).
 * POST JSON: { eventId, guestId }
 * Authorization: Bearer <JWT>
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'
import {
  sendWhatsAppInviteServiceRole,
  TwilioInviteError,
} from '../_shared/twilioInviteSend.ts'

function log(stage: string, data?: Record<string, unknown>) {
  const line = data != null ? `${stage} ${JSON.stringify(data)}` : stage
  console.log(`[send-whatsapp] ${line}`)
}

function logErr(stage: string, data?: Record<string, unknown>) {
  const line = data != null ? `${stage} ${JSON.stringify(data)}` : stage
  console.error(`[send-whatsapp] ${line}`)
}

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

console.log('[send-whatsapp] isolate loaded')

Deno.serve(async (req: Request) => {
  try {
    log('request', { method: req.method })

    if (req.method === 'OPTIONS') {
      return new Response('ok', { status: 200, headers: corsHeaders })
    }
    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405)
    }

    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) {
      logErr('reject: no bearer token')
      return json({ error: 'Unauthorized' }, 401)
    }

    let bodyIn: { eventId?: unknown; guestId?: unknown }
    try {
      bodyIn = await req.json()
    } catch {
      logErr('reject: invalid json')
      return json({ error: 'Invalid JSON body' }, 400)
    }

    const eventId =
      typeof bodyIn.eventId === 'string' ? bodyIn.eventId.trim() : ''
    const guestId =
      typeof bodyIn.guestId === 'string' ? bodyIn.guestId.trim() : ''
    if (!eventId || !guestId) {
      logErr('reject: missing ids')
      return json({ error: 'eventId ו-guestId נדרשים' }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      logErr('reject: supabase env incomplete')
      return json({ error: 'השרת לא מוגדר (Supabase)' }, 500)
    }

    const serviceSb = createClient(supabaseUrl, serviceRoleKey, {
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
      logErr('reject: twilio/public base incomplete')
      return json(
        {
          error:
            'Twilio לא מוגדר: הגדרו Secrets ‏TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, וגם VITE_PUBLIC_FRONTEND_URL (או PUBLIC_FRONTEND_URL)',
        },
        503,
      )
    }

    const userSb = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: userErr,
    } = await userSb.auth.getUser()
    if (userErr || !user) {
      logErr('reject: getUser failed')
      return json({ error: 'Unauthorized' }, 401)
    }

    log('auth ok', { userId: user.id })

    const { data: guestRow, error: guestErr } = await userSb
      .from('guests')
      .select('id, event_id')
      .eq('id', guestId)
      .maybeSingle()

    if (guestErr) {
      logErr('guest query error', { message: guestErr.message })
      return json({ error: guestErr.message }, 403)
    }
    if (!guestRow || String(guestRow.event_id) !== eventId) {
      logErr('guest not found or event mismatch')
      return json({ error: 'אורח לא נמצא' }, 404)
    }

    try {
      const out = await sendWhatsAppInviteServiceRole({
        serviceSb,
        eventId,
        guestId,
        accountSid,
        authToken,
        fromWa,
        publicBase,
        checkTwilioBalanceMin2: true,
        logTag: '[send-whatsapp]',
      })
      return json(
        {
          ok: true as const,
          twilio_sid: out.twilio_sid,
          twilio_status: out.twilio_status,
          sent_at: out.sent_at,
          marked_guest_ids: out.marked_guest_ids,
        },
        200,
      )
    } catch (e) {
      if (e instanceof TwilioInviteError) {
        return json({ error: e.message }, e.httpStatus)
      }
      const msg = e instanceof Error ? e.message : 'שגיאה'
      logErr('send failed', { message: msg })
      return json({ error: msg }, 500)
    }
  } catch (e) {
    logErr('unhandled exception', {
      message: e instanceof Error ? e.message : String(e),
    })
    return json({ error: 'שגיאה פנימית ב-send-whatsapp' }, 500)
  }
})
