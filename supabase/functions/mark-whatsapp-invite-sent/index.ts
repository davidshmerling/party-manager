/**
 * Marks a guest WhatsApp invite as sent (service role; no caller auth in this version).
 * POST JSON: { eventId, guestId, method? } — method defaults to "local_script".
 * מסמן את כל שורות האורח עם אותה זהות (שם+טלפון) באירוע — כמו markWhatsAppInvitesSent בצד הלקוח.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'

/** מסונכרן עם src/utils/pasteGuestLines.ts + guestIdentity.ts */
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  let body: { eventId?: unknown; guestId?: unknown; method?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const eventId =
    typeof body.eventId === 'string' ? body.eventId.trim() : ''
  const guestId =
    typeof body.guestId === 'string' ? body.guestId.trim() : ''
  const methodRaw = body.method
  const method =
    typeof methodRaw === 'string' && methodRaw.trim() !== ''
      ? methodRaw.trim()
      : 'local_script'

  if (!eventId || !guestId) {
    return json(
      { error: 'Invalid request: eventId and guestId are required strings' },
      400,
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Server misconfigured' }, 500)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  function auditFail(
    action: string,
    eventRef: string,
    gid: string,
    phase: string,
    errorMessage: string,
    meta: Record<string, unknown> = {},
  ) {
    void supabase.rpc('log_service_audit_event', {
      p_action: action,
      p_entity_type: 'guest',
      p_entity_id: gid,
      p_event_id: eventRef,
      p_status: 'failed',
      p_metadata: {
        error_message: errorMessage.slice(0, 2000),
        phase,
        source: 'edge_function',
        ...meta,
      },
    })
  }

  const { data: target, error: errTarget } = await supabase
    .from('guests')
    .select('id, event_id, name, phone')
    .eq('id', guestId)
    .eq('event_id', eventId)
    .is('deleted_at', null)
    .maybeSingle()

  if (errTarget) {
    void supabase.rpc('log_technical_event', {
      p_level: 'error',
      p_source: 'edge',
      p_operation: 'mark-whatsapp-invite-sent:select_guest',
      p_message: errTarget.message,
      p_context: { eventId, guestId },
      p_correlation_id: null,
      p_event_id: eventId,
    })
    auditFail(
      'invite.mark_script_failed',
      eventId,
      guestId,
      'select_guest',
      errTarget.message,
      { method },
    )
    return json({ error: errTarget.message }, 500)
  }
  if (!target) {
    auditFail(
      'invite.mark_script_failed',
      eventId,
      guestId,
      'guest_not_found',
      'Guest not found for this event',
      { method },
    )
    return json({ error: 'Guest not found for this event' }, 404)
  }

  const { data: allGuests, error: errAll } = await supabase
    .from('guests')
    .select('id, name, phone')
    .eq('event_id', eventId)
    .is('deleted_at', null)

  if (errAll || !allGuests) {
    if (errAll) {
      void supabase.rpc('log_technical_event', {
        p_level: 'error',
        p_source: 'edge',
        p_operation: 'mark-whatsapp-invite-sent:list_guests',
        p_message: errAll.message,
        p_context: { eventId, guestId },
        p_correlation_id: null,
        p_event_id: eventId,
      })
    }
    auditFail(
      'invite.mark_script_failed',
      eventId,
      guestId,
      'list_guests',
      errAll?.message ?? 'Failed to load guests',
      { method, guest_name: target.name ?? null },
    )
    return json({ error: errAll?.message ?? 'Failed to load guests' }, 500)
  }

  const key = guestIdentityKey(String(target.name ?? ''), String(target.phone ?? ''))
  const ids = allGuests
    .filter((g) =>
      guestIdentityKey(String(g.name ?? ''), String(g.phone ?? '')) === key
    )
    .map((g) => g.id as string)

  if (ids.length === 0) {
    auditFail(
      'invite.mark_script_failed',
      eventId,
      guestId,
      'identity_ids_empty',
      'Guest identity match produced no ids',
      { method, guest_name: target.name ?? null },
    )
    return json({ error: 'Guest not found for this event' }, 404)
  }

  const whatsapp_invite_sent_at = new Date().toISOString()
  const { error: errUp } = await supabase
    .from('guests')
    .update({ whatsapp_invite_sent_at, invite_sent_method: method })
    .in('id', ids)
    .is('deleted_at', null)

  if (errUp) {
    void supabase.rpc('log_technical_event', {
      p_level: 'error',
      p_source: 'edge',
      p_operation: 'mark-whatsapp-invite-sent:update_guests',
      p_message: errUp.message,
      p_context: { eventId, guestId, count: ids.length },
      p_correlation_id: null,
      p_event_id: eventId,
    })
    auditFail(
      'invite.mark_script_failed',
      eventId,
      guestId,
      'update_guests',
      errUp.message,
      { method, updated_count: ids.length, guest_name: target.name ?? null },
    )
    return json({ error: errUp.message }, 500)
  }

  return json({ ok: true }, 200)
})
