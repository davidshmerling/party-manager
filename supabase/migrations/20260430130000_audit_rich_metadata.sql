-- נתונים עשירים ב־audit_log: שמות, טלפון ממוסך, מקור קריאה, שינויי שדות, סריקה, כרטיס ציבורי
-- =============================================================================

CREATE OR REPLACE FUNCTION public.mask_phone_for_audit(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_phone IS NULL OR btrim(p_phone) = '' THEN NULL::text
    WHEN length(regexp_replace(p_phone, '\D', '', 'g')) <= 4 THEN '****'::text
    ELSE '…' || right(regexp_replace(p_phone, '\D', '', 'g'), 4)
  END;
$$;

COMMENT ON FUNCTION public.mask_phone_for_audit(text) IS 'מיצוג בלוגי ביקורת — ארבע ספרות אחרונות';

CREATE OR REPLACE FUNCTION public.audit_request_channel()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL THEN 'authenticated'
    WHEN lower(trim(coalesce(auth.jwt()->>'role', ''))) IN ('service_role', 'authenticator')
      THEN 'service_role'::text
    WHEN lower(trim(coalesce(auth.jwt()->>'role', ''))) IN ('anon', 'anonymous')
      THEN 'anon'::text
    ELSE nullif(trim(coalesce(auth.jwt()->>'role', '')), '')
  END;
$$;

COMMENT ON FUNCTION public.audit_request_channel IS 'סיווג בסיס ל־metadata.source בטריגרים (ללא ההקשר הציבורי של כרטיס)';

CREATE OR REPLACE FUNCTION public.lookup_guest_identity_ids_for_audit(
  p_event_id uuid,
  p_person_name text,
  p_phone text,
  p_max int DEFAULT 8
)
RETURNS uuid[]
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(array_agg(sub.id ORDER BY sub.created_at, sub.id), ARRAY[]::uuid[])
  FROM (
    SELECT g.id, g.created_at
    FROM public.guests g
    WHERE g.event_id = p_event_id
      AND g.deleted_at IS NULL
      AND trim(lower(regexp_replace(g.name, '\s+', ' ', 'g'))) =
          trim(lower(regexp_replace(coalesce(p_person_name, ''), '\s+', ' ', 'g')))
      AND public.normalize_guest_phone_match(g.phone) =
          public.normalize_guest_phone_match(coalesce(p_phone, ''))
    ORDER BY g.created_at, g.id
    LIMIT greatest(least(coalesce(nullif(p_max, 0), 8), 32), 1)
  ) sub;
$$;

CREATE OR REPLACE FUNCTION public.log_service_audit_event(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_event_id uuid,
  p_status text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rl text := lower(trim(coalesce(auth.jwt()->>'role', '')));
BEGIN
  IF rl IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'לא מורשה' USING ERRCODE = '42501';
  END IF;
  IF p_action IS NULL OR btrim(p_action) = '' THEN
    RETURN;
  END IF;
  IF p_entity_type IS NULL OR btrim(p_entity_type) = '' THEN
    RETURN;
  END IF;
  INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
  VALUES (
    NULL,
    btrim(p_action),
    btrim(p_entity_type),
    p_entity_id,
    p_event_id,
    CASE lower(trim(coalesce(p_status, 'failed')))
      WHEN 'success' THEN 'success'
      WHEN 'failed' THEN 'failed'
      WHEN 'denied' THEN 'denied'
      ELSE 'failed'
    END,
    jsonb_strip_nulls(
      coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'source',
        coalesce(nullif(trim(coalesce(p_metadata ->> 'source', '')), ''), 'service_role_edge')
      )
    ));
END;
$$;

REVOKE ALL ON FUNCTION public.log_service_audit_event(text, text, uuid, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_service_audit_event(text, text, uuid, uuid, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.audit_insert_scan(
  p_actor uuid,
  p_event_id uuid,
  p_guest_id uuid,
  p_result text,
  p_message text,
  p_extra jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_status text;
  m jsonb;
  v_gname text;
  v_gphone text;
BEGIN
  m := coalesce(p_extra, '{}'::jsonb) ||
    jsonb_build_object(
      'message', nullif(trim(p_message), ''),
      'raw_result', p_result,
      'source', 'rpc',
      'error_message',
      CASE
        WHEN p_result IN ('forbidden')
          THEN trim(coalesce(p_message, ''))
        WHEN p_result = 'not_found' AND trim(coalesce(p_message, '')) <> ''
          THEN trim(p_message)
        ELSE NULL::text
      END
    );

  IF p_guest_id IS NOT NULL THEN
    SELECT g.name::text, g.phone::text
    INTO v_gname, v_gphone
    FROM public.guests g
    WHERE g.id = p_guest_id
    LIMIT 1;
    m := m || jsonb_build_object(
      'guest_id', p_guest_id,
      'guest_name', left(trim(coalesce(v_gname, '')), 160),
      'guest_phone_masked', public.mask_phone_for_audit(v_gphone)
    );
  END IF;

  IF p_result = 'forbidden' THEN
    v_action := 'scan.denied';
    v_status := 'denied';
  ELSIF p_result = 'ok' THEN
    v_action := 'scan.success';
    v_status := 'success';
  ELSIF p_result IN ('already_entered', 'already_checked_in') THEN
    v_action := 'scan.duplicate';
    v_status := 'success';
  ELSIF p_result = 'wrong_event' THEN
    v_action := 'scan.wrong_event';
    v_status := 'success';
  ELSIF p_result = 'not_found' THEN
    v_action := 'scan.not_found';
    v_status := 'success';
  ELSE
    v_action := 'scan.unknown';
    v_status := 'success';
  END IF;

  INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
  VALUES (p_actor, v_action, 'scan', p_guest_id, p_event_id, v_status, m);
END;
$$;

CREATE OR REPLACE FUNCTION public.tr_audit_guests()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_event uuid;
  v_meta jsonb;
  v_only_invite boolean;
  v_action text;
  v_fields text[];
  v_soft_deleted boolean;
  v_restored boolean;
  v_method text;
  v_chg jsonb := '{}'::jsonb;
  v_card_ctx_raw text;
  v_card_ctx jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
    VALUES (
      v_uid, 'guest.create', 'guest', NEW.id, NEW.event_id, 'success',
      jsonb_strip_nulls(
        jsonb_build_object(
          'guest_id', NEW.id,
          'guest_name', left(trim(NEW.name), 140),
          'guest_phone_masked', public.mask_phone_for_audit(NEW.phone),
          'guest_phone', CASE WHEN NEW.phone IS NULL OR trim(NEW.phone) = '' THEN NULL ELSE NEW.phone END,
          'name', left(NEW.name, 100),
          'phone', CASE WHEN NEW.phone IS NULL OR trim(NEW.phone) = '' THEN NULL ELSE NEW.phone END,
          'source', public.audit_request_channel(),
          'guest_source_record', NEW.source
        ))
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
    VALUES (
      v_uid, 'guest.delete', 'guest', OLD.id, OLD.event_id, 'success',
      jsonb_build_object(
        'guest_id', OLD.id,
        'guest_name', left(trim(OLD.name), 140),
        'guest_phone_masked', public.mask_phone_for_audit(OLD.phone),
        'name', left(OLD.name, 100),
        'source', public.audit_request_channel()
      )
    );
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF coalesce(nullif(current_setting('app.suppress_guest_audit', true), ''), '') = '1' THEN
      RETURN NEW;
    END IF;

    v_event := NEW.event_id;

    v_card_ctx_raw := current_setting('app.card_open_audit_ctx', true);
    IF v_card_ctx_raw IS NOT NULL AND btrim(v_card_ctx_raw) <> '' THEN
      BEGIN
        v_card_ctx := v_card_ctx_raw::jsonb;
      EXCEPTION WHEN OTHERS THEN
        v_card_ctx := NULL;
      END;
    ELSE
      v_card_ctx := NULL;
    END IF;

    v_soft_deleted := OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL;
    v_restored := OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL;

    IF v_soft_deleted THEN
      INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
      VALUES (
        v_uid, 'guest.soft_delete', 'guest', NEW.id, v_event, 'success',
        jsonb_build_object(
          'guest_id', NEW.id,
          'guest_name', left(trim(NEW.name), 140),
          'guest_phone_masked', public.mask_phone_for_audit(NEW.phone),
          'deleted_at', NEW.deleted_at,
          'source', public.audit_request_channel()
        )
      );
      RETURN NEW;
    END IF;

    IF v_restored THEN
      INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
      VALUES (
        v_uid, 'guest.restore', 'guest', NEW.id, v_event, 'success',
        jsonb_build_object(
          'guest_id', NEW.id,
          'guest_name', left(trim(NEW.name), 140),
          'guest_phone_masked', public.mask_phone_for_audit(NEW.phone),
          'source', public.audit_request_channel()
        )
      );
      RETURN NEW;
    END IF;

    v_only_invite :=
      (OLD.name IS NOT DISTINCT FROM NEW.name)
      AND (OLD.phone IS NOT DISTINCT FROM NEW.phone)
      AND (OLD.status IS NOT DISTINCT FROM NEW.status)
      AND (OLD.entered_at IS NOT DISTINCT FROM NEW.entered_at)
      AND (OLD.unique_code IS NOT DISTINCT FROM NEW.unique_code)
      AND (OLD.invite_bundle_code IS NOT DISTINCT FROM NEW.invite_bundle_code)
      AND (OLD.card_opened_at IS NOT DISTINCT FROM NEW.card_opened_at)
      AND (OLD.source IS NOT DISTINCT FROM NEW.source)
      AND (OLD.deleted_at IS NOT DISTINCT FROM NEW.deleted_at)
      AND (
        (OLD.whatsapp_invite_sent_at IS DISTINCT FROM NEW.whatsapp_invite_sent_at)
        OR (OLD.invite_sent_method IS DISTINCT FROM NEW.invite_sent_method)
      );

    v_method :=
      CASE
        WHEN NEW.invite_sent_method IS NOT NULL AND btrim(NEW.invite_sent_method) <> ''
          THEN NEW.invite_sent_method
        WHEN OLD.whatsapp_invite_sent_at IS NULL AND NEW.whatsapp_invite_sent_at IS NOT NULL
          THEN 'legacy_untracked'
        WHEN NEW.whatsapp_invite_sent_at IS NULL AND OLD.whatsapp_invite_sent_at IS NOT NULL
          THEN 'cleared'::text
        ELSE 'legacy_untracked'::text
      END;

    IF v_only_invite THEN
      v_action := 'invite.mark_sent';
      v_meta := jsonb_strip_nulls(jsonb_build_object(
        'guest_id', NEW.id,
        'guest_name', left(trim(NEW.name), 140),
        'guest_phone_masked', public.mask_phone_for_audit(NEW.phone),
        'guest_phone', CASE WHEN NEW.phone IS NULL OR trim(NEW.phone) = '' THEN NULL ELSE NEW.phone END,
        'method', v_method,
        'invite_sent_method', NEW.invite_sent_method,
        'sent_at', NEW.whatsapp_invite_sent_at,
        'previous_sent_at', OLD.whatsapp_invite_sent_at,
        'source',
        CASE WHEN coalesce(v_card_ctx->>'origin', '') <> '' THEN 'public_ticket'
             ELSE coalesce(public.audit_request_channel(), 'unknown')
        END,
        'public_ticket_client',
        CASE WHEN coalesce(v_card_ctx->>'origin', '') <> '' THEN v_card_ctx ELSE NULL END
      ));

      INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
      VALUES (v_uid, v_action, 'guest', NEW.id, v_event, 'success', v_meta);
      RETURN NEW;
    END IF;

    IF OLD.name IS DISTINCT FROM NEW.name THEN
      v_chg := v_chg ||
        jsonb_build_object(
          'name',
          jsonb_build_object(
            'old', left(trim(OLD.name), 240),
            'new', left(trim(NEW.name), 240)));
    END IF;
    IF OLD.phone IS DISTINCT FROM NEW.phone THEN
      v_chg := v_chg ||
        jsonb_build_object(
          'phone',
          jsonb_build_object(
            'old_masked', public.mask_phone_for_audit(OLD.phone),
            'new_masked', public.mask_phone_for_audit(NEW.phone),
            'old_phone', OLD.phone,
            'new_phone', NEW.phone));
    END IF;
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_chg := v_chg ||
        jsonb_build_object(
          'status',
          jsonb_build_object(
            'old', OLD.status,
            'new', NEW.status));
    END IF;
    IF OLD.entered_at IS DISTINCT FROM NEW.entered_at THEN
      v_chg := v_chg ||
        jsonb_build_object(
          'entered_at',
          jsonb_build_object(
            'old', OLD.entered_at,
            'new', NEW.entered_at));
    END IF;
    IF OLD.unique_code IS DISTINCT FROM NEW.unique_code THEN
      v_chg := v_chg ||
        jsonb_build_object(
          'unique_code',
          jsonb_build_object(
            'old', left(trim(OLD.unique_code), 80),
            'new', left(trim(NEW.unique_code), 80)));
    END IF;
    IF OLD.invite_bundle_code IS DISTINCT FROM NEW.invite_bundle_code THEN
      v_chg := v_chg ||
        jsonb_build_object(
          'invite_bundle_code',
          jsonb_build_object(
            'old', left(trim(OLD.invite_bundle_code), 80),
            'new', left(trim(NEW.invite_bundle_code), 80)));
    END IF;
    IF OLD.card_opened_at IS DISTINCT FROM NEW.card_opened_at THEN
      v_chg := v_chg ||
        jsonb_build_object(
          'card_opened_at',
          jsonb_build_object(
            'old', OLD.card_opened_at,
            'new', NEW.card_opened_at));
    END IF;
    IF OLD.whatsapp_invite_sent_at IS DISTINCT FROM NEW.whatsapp_invite_sent_at
       OR OLD.invite_sent_method IS DISTINCT FROM NEW.invite_sent_method
    THEN
      v_chg := v_chg ||
        jsonb_build_object(
          'whatsapp_invite',
          jsonb_build_object(
            'old_sent_at', OLD.whatsapp_invite_sent_at,
            'new_sent_at', NEW.whatsapp_invite_sent_at,
            'old_method', OLD.invite_sent_method,
            'new_method', NEW.invite_sent_method));
    END IF;
    IF OLD.source IS DISTINCT FROM NEW.source THEN
      v_chg := v_chg ||
        jsonb_build_object(
          'source',
          jsonb_build_object(
            'old', OLD.source,
            'new', NEW.source));
    END IF;

    v_action := 'guest.update';
    IF OLD.name IS DISTINCT FROM NEW.name THEN v_fields := array_append(coalesce(v_fields, ARRAY[]::text[]), 'name'); END IF;
    IF OLD.phone IS DISTINCT FROM NEW.phone THEN v_fields := array_append(coalesce(v_fields, ARRAY[]::text[]), 'phone'); END IF;
    IF OLD.status IS DISTINCT FROM NEW.status THEN v_fields := array_append(coalesce(v_fields, ARRAY[]::text[]), 'status'); END IF;
    IF OLD.entered_at IS DISTINCT FROM NEW.entered_at THEN v_fields := array_append(coalesce(v_fields, ARRAY[]::text[]), 'entered_at'); END IF;
    IF OLD.unique_code IS DISTINCT FROM NEW.unique_code THEN v_fields := array_append(coalesce(v_fields, ARRAY[]::text[]), 'unique_code'); END IF;
    IF OLD.invite_bundle_code IS DISTINCT FROM NEW.invite_bundle_code THEN v_fields := array_append(coalesce(v_fields, ARRAY[]::text[]), 'invite_bundle_code'); END IF;
    IF OLD.card_opened_at IS DISTINCT FROM NEW.card_opened_at THEN v_fields := array_append(coalesce(v_fields, ARRAY[]::text[]), 'card_opened_at'); END IF;
    IF OLD.whatsapp_invite_sent_at IS DISTINCT FROM NEW.whatsapp_invite_sent_at
       OR OLD.invite_sent_method IS DISTINCT FROM NEW.invite_sent_method
    THEN
      v_fields := array_append(coalesce(v_fields, ARRAY[]::text[]), 'whatsapp_invite');
    END IF;
    IF OLD.source IS DISTINCT FROM NEW.source THEN v_fields := array_append(coalesce(v_fields, ARRAY[]::text[]), 'source'); END IF;

    IF coalesce(array_length(v_fields, 1), 0) = 0 THEN
      RETURN NEW;
    END IF;

    v_meta := jsonb_strip_nulls(
      jsonb_build_object(
        'fields', to_jsonb(v_fields),
        'guest_id', NEW.id,
        'guest_name', left(trim(NEW.name), 140),
        'guest_phone_masked', public.mask_phone_for_audit(NEW.phone),
        'guest_phone', CASE WHEN NEW.phone IS NULL OR trim(NEW.phone) = '' THEN NULL ELSE NEW.phone END,
        'name', left(NEW.name, 80),
        'changed_fields', v_chg,
        'source',
        CASE WHEN coalesce(v_card_ctx->>'origin', '') <> '' THEN 'public_ticket'
             ELSE coalesce(public.audit_request_channel(), 'unknown')
        END,
        'public_ticket_client',
        CASE WHEN coalesce(v_card_ctx->>'origin', '') <> '' THEN v_card_ctx ELSE NULL END
      ));

    INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
    VALUES (v_uid, v_action, 'guest', NEW.id, v_event, 'success', v_meta);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.tr_audit_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_chg jsonb := '{}'::jsonb;
  v_trunc int := 500;
  v_field_keys jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
    VALUES (
      v_uid,
      'event.create',
      'event',
      NEW.id,
      NEW.id,
      'success',
      jsonb_build_object(
        'event_name', left(trim(NEW.name), 260),
        'source', public.audit_request_channel()
      ));
    RETURN NULL;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
    VALUES (
      v_uid,
      'event.delete',
      'event',
      OLD.id,
      OLD.id,
      'success',
      jsonb_build_object(
        'event_name', left(trim(OLD.name), 260),
        'source', public.audit_request_channel()
      ));
    RETURN NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.name IS DISTINCT FROM NEW.name THEN
      v_chg := v_chg ||
        jsonb_build_object(
          'name',
          jsonb_build_object(
            'old', left(trim(OLD.name), v_trunc),
            'new', left(trim(NEW.name), v_trunc)));
    END IF;
    IF OLD.slug IS DISTINCT FROM NEW.slug THEN
      v_chg := v_chg ||
        jsonb_build_object('slug', jsonb_build_object('old', OLD.slug, 'new', NEW.slug));
    END IF;
    IF OLD.description IS DISTINCT FROM NEW.description THEN
      v_chg := v_chg ||
        jsonb_build_object(
          'description',
          jsonb_build_object(
            'old', left(trim(coalesce(OLD.description, '')), v_trunc),
            'new', left(trim(coalesce(NEW.description, '')), v_trunc)));
    END IF;
    IF OLD.starts_at IS DISTINCT FROM NEW.starts_at THEN
      v_chg := v_chg ||
        jsonb_build_object(
          'starts_at',
          jsonb_build_object('old', OLD.starts_at, 'new', NEW.starts_at));
    END IF;
    IF OLD.ends_at IS DISTINCT FROM NEW.ends_at THEN
      v_chg := v_chg ||
        jsonb_build_object(
          'ends_at',
          jsonb_build_object('old', OLD.ends_at, 'new', NEW.ends_at));
    END IF;
    IF OLD.location IS DISTINCT FROM NEW.location THEN
      v_chg := v_chg ||
        jsonb_build_object(
          'location',
          jsonb_build_object(
            'old', left(trim(coalesce(OLD.location, '')), v_trunc),
            'new', left(trim(coalesce(NEW.location, '')), v_trunc)));
    END IF;
    IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
      v_chg := v_chg ||
        jsonb_build_object(
          'is_active',
          jsonb_build_object('old', OLD.is_active, 'new', NEW.is_active));
    END IF;
    IF OLD.created_by IS DISTINCT FROM NEW.created_by THEN
      v_chg := v_chg ||
        jsonb_build_object(
          'created_by',
          jsonb_build_object('old', OLD.created_by, 'new', NEW.created_by));
    END IF;
    IF OLD.default_ticket_price IS DISTINCT FROM NEW.default_ticket_price THEN
      v_chg := v_chg ||
        jsonb_build_object(
          'default_ticket_price',
          jsonb_build_object('old', OLD.default_ticket_price, 'new', NEW.default_ticket_price));
    END IF;
    IF OLD.card_text_above IS DISTINCT FROM NEW.card_text_above THEN
      v_chg := v_chg ||
        jsonb_build_object(
          'card_text_above',
          jsonb_build_object(
            'old', left(trim(coalesce(OLD.card_text_above, '')), v_trunc),
            'new', left(trim(coalesce(NEW.card_text_above, '')), v_trunc)));
    END IF;
    IF OLD.card_text_instruction IS DISTINCT FROM NEW.card_text_instruction THEN
      v_chg := v_chg ||
        jsonb_build_object(
          'card_text_instruction',
          jsonb_build_object(
            'old', left(trim(coalesce(OLD.card_text_instruction, '')), v_trunc),
            'new', left(trim(coalesce(NEW.card_text_instruction, '')), v_trunc)));
    END IF;
    IF OLD.card_text_below IS DISTINCT FROM NEW.card_text_below THEN
      v_chg := v_chg ||
        jsonb_build_object(
          'card_text_below',
          jsonb_build_object(
            'old', left(trim(coalesce(OLD.card_text_below, '')), v_trunc),
            'new', left(trim(coalesce(NEW.card_text_below, '')), v_trunc)));
    END IF;
    IF OLD.whatsapp_invite_template IS DISTINCT FROM NEW.whatsapp_invite_template THEN
      v_chg := v_chg ||
        jsonb_build_object(
          'whatsapp_invite_template',
          jsonb_build_object(
            'old', left(trim(coalesce(OLD.whatsapp_invite_template, '')), v_trunc),
            'new', left(trim(coalesce(NEW.whatsapp_invite_template, '')), v_trunc)));
    END IF;
    IF OLD.whatsapp_twilio_content_sid IS DISTINCT FROM NEW.whatsapp_twilio_content_sid THEN
      v_chg := v_chg ||
        jsonb_build_object(
          'whatsapp_twilio_content_sid',
          jsonb_build_object(
            'old', OLD.whatsapp_twilio_content_sid,
            'new', NEW.whatsapp_twilio_content_sid));
    END IF;
    IF OLD.whatsapp_twilio_content_name IS DISTINCT FROM NEW.whatsapp_twilio_content_name THEN
      v_chg := v_chg ||
        jsonb_build_object(
          'whatsapp_twilio_content_name',
          jsonb_build_object(
            'old', left(trim(coalesce(OLD.whatsapp_twilio_content_name, '')), v_trunc),
            'new', left(trim(coalesce(NEW.whatsapp_twilio_content_name, '')), v_trunc)));
    END IF;
    IF OLD.whatsapp_twilio_content_status IS DISTINCT FROM NEW.whatsapp_twilio_content_status THEN
      v_chg := v_chg ||
        jsonb_build_object(
          'whatsapp_twilio_content_status',
          jsonb_build_object('old', OLD.whatsapp_twilio_content_status, 'new', NEW.whatsapp_twilio_content_status));
    END IF;
    IF OLD.whatsapp_twilio_content_category IS DISTINCT FROM NEW.whatsapp_twilio_content_category THEN
      v_chg := v_chg ||
        jsonb_build_object(
          'whatsapp_twilio_content_category',
          jsonb_build_object(
            'old', OLD.whatsapp_twilio_content_category,
            'new', NEW.whatsapp_twilio_content_category));
    END IF;
    IF OLD.whatsapp_twilio_content_submitted_at IS DISTINCT FROM NEW.whatsapp_twilio_content_submitted_at THEN
      v_chg := v_chg ||
        jsonb_build_object(
          'whatsapp_twilio_content_submitted_at',
          jsonb_build_object(
            'old', OLD.whatsapp_twilio_content_submitted_at,
            'new', NEW.whatsapp_twilio_content_submitted_at));
    END IF;
    IF OLD.whatsapp_twilio_placeholder_slots IS DISTINCT FROM NEW.whatsapp_twilio_placeholder_slots THEN
      v_chg := v_chg ||
        jsonb_build_object(
          'whatsapp_twilio_placeholder_slots',
          jsonb_build_object(
            'old', to_jsonb(coalesce(OLD.whatsapp_twilio_placeholder_slots::text, '')),
            'new', to_jsonb(coalesce(NEW.whatsapp_twilio_placeholder_slots::text, ''))));
    END IF;
    IF v_chg IS NULL OR jsonb_strip_nulls(v_chg) = '{}'::jsonb THEN
      RETURN NULL;
    END IF;
    SELECT COALESCE(to_jsonb(array_agg(kv.key ORDER BY kv.key)), '[]'::jsonb)
    INTO v_field_keys
    FROM jsonb_each(jsonb_strip_nulls(v_chg)) kv;
    INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
    VALUES (
      v_uid,
      'event.update',
      'event',
      NEW.id,
      NEW.id,
      'success',
      jsonb_strip_nulls(
        jsonb_build_object(
          'event_id', NEW.id,
          'event_name', left(trim(NEW.name), 260),
          'changed_fields', v_chg,
          'fields_changed_keys', v_field_keys,
          'source', public.audit_request_channel())));
    RETURN NULL;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.tr_audit_event_finance_lines()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_fields text[];
  gid uuid[];
  gid_one uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    gid := public.lookup_guest_identity_ids_for_audit(NEW.event_id, NEW.person_name, NEW.phone, 12);
    gid_one := CASE WHEN gid IS NOT NULL AND array_length(gid, 1) >= 1 THEN gid[1] ELSE NULL END;
    INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
    VALUES (
      v_uid,
      'finance_line.create',
      'finance_line',
      NEW.id,
      NEW.event_id,
      'success',
      jsonb_strip_nulls(
        jsonb_build_object(
          'line_kind', NEW.line_kind,
          'person_name', left(trim(NEW.person_name), 160),
          'person_phone_masked', public.mask_phone_for_audit(NEW.phone),
          'phone', CASE WHEN trim(coalesce(NEW.phone, '')) = '' THEN NULL ELSE NEW.phone END,
          'amount', NEW.amount,
          'is_paid', NEW.is_paid,
          'recipient_admin_id', NEW.recipient_admin_id,
          'income_recipient_kind', NEW.income_recipient_kind,
          'transfer_from_admin_id', NEW.transfer_from_admin_id,
          'created_by', NEW.created_by,
          'guest_id', gid_one,
          'matching_guest_ids', to_jsonb(coalesce(gid, ARRAY[]::uuid[])),
          'source', public.audit_request_channel()
        )
      )
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    gid := public.lookup_guest_identity_ids_for_audit(OLD.event_id, OLD.person_name, OLD.phone, 12);
    gid_one := CASE WHEN gid IS NOT NULL AND array_length(gid, 1) >= 1 THEN gid[1] ELSE NULL END;
    INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
    VALUES (
      v_uid,
      'finance_line.delete',
      'finance_line',
      OLD.id,
      OLD.event_id,
      'success',
      jsonb_strip_nulls(
        jsonb_build_object(
          'line_kind', OLD.line_kind,
          'person_name', left(trim(OLD.person_name), 160),
          'person_phone_masked', public.mask_phone_for_audit(OLD.phone),
          'amount', OLD.amount,
          'matching_guest_ids', to_jsonb(coalesce(gid, ARRAY[]::uuid[])),
          'guest_id', gid_one,
          'source', public.audit_request_channel()
        ))
    );
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.line_kind IS DISTINCT FROM NEW.line_kind THEN v_fields := array_append(coalesce(v_fields, ARRAY[]::text[]), 'line_kind'); END IF;
    IF OLD.person_name IS DISTINCT FROM NEW.person_name THEN v_fields := array_append(coalesce(v_fields, ARRAY[]::text[]), 'person_name'); END IF;
    IF OLD.phone IS DISTINCT FROM NEW.phone THEN v_fields := array_append(coalesce(v_fields, ARRAY[]::text[]), 'phone'); END IF;
    IF OLD.amount IS DISTINCT FROM NEW.amount THEN v_fields := array_append(coalesce(v_fields, ARRAY[]::text[]), 'amount'); END IF;
    IF OLD.recipient_admin_id IS DISTINCT FROM NEW.recipient_admin_id THEN v_fields := array_append(coalesce(v_fields, ARRAY[]::text[]), 'recipient_admin_id'); END IF;
    IF OLD.is_paid IS DISTINCT FROM NEW.is_paid THEN v_fields := array_append(coalesce(v_fields, ARRAY[]::text[]), 'is_paid'); END IF;
    IF OLD.income_recipient_kind IS DISTINCT FROM NEW.income_recipient_kind THEN v_fields := array_append(coalesce(v_fields, ARRAY[]::text[]), 'income_recipient_kind'); END IF;
    IF OLD.transfer_from_admin_id IS DISTINCT FROM NEW.transfer_from_admin_id THEN v_fields := array_append(coalesce(v_fields, ARRAY[]::text[]), 'transfer_from_admin_id'); END IF;

    IF coalesce(array_length(v_fields, 1), 0) = 0 THEN
      RETURN NEW;
    END IF;

    gid := public.lookup_guest_identity_ids_for_audit(NEW.event_id, NEW.person_name, NEW.phone, 12);
    gid_one := CASE WHEN gid IS NOT NULL AND array_length(gid, 1) >= 1 THEN gid[1] ELSE NULL END;

    INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
    VALUES (
      v_uid,
      'finance_line.update',
      'finance_line',
      NEW.id,
      NEW.event_id,
      'success',
      jsonb_strip_nulls(jsonb_build_object(
        'fields', to_jsonb(v_fields),
        'person_name', left(trim(NEW.person_name), 160),
        'person_phone_masked', public.mask_phone_for_audit(NEW.phone),
        'phone', CASE WHEN trim(coalesce(NEW.phone, '')) = '' THEN NULL ELSE NEW.phone END,
        'line_kind', NEW.line_kind,
        'changed_fields',
          jsonb_strip_nulls(
            jsonb_build_object(
              'line_kind', CASE WHEN OLD.line_kind IS DISTINCT FROM NEW.line_kind
                THEN jsonb_build_object('old', OLD.line_kind, 'new', NEW.line_kind) ELSE NULL END,
              'person_name', CASE WHEN OLD.person_name IS DISTINCT FROM NEW.person_name
                THEN jsonb_build_object('old', left(trim(OLD.person_name), 200), 'new', left(trim(NEW.person_name), 200)) ELSE NULL END,
              'phone', CASE WHEN OLD.phone IS DISTINCT FROM NEW.phone
                THEN jsonb_build_object(
                  'old_masked', public.mask_phone_for_audit(OLD.phone),
                  'new_masked', public.mask_phone_for_audit(NEW.phone),
                  'old_phone', OLD.phone,
                  'new_phone', NEW.phone) ELSE NULL END,
              'amount', CASE WHEN OLD.amount IS DISTINCT FROM NEW.amount
                THEN jsonb_build_object('old', OLD.amount, 'new', NEW.amount) ELSE NULL END,
              'recipient_admin_id', CASE WHEN OLD.recipient_admin_id IS DISTINCT FROM NEW.recipient_admin_id
                THEN jsonb_build_object('old', OLD.recipient_admin_id, 'new', NEW.recipient_admin_id) ELSE NULL END,
              'is_paid', CASE WHEN OLD.is_paid IS DISTINCT FROM NEW.is_paid
                THEN jsonb_build_object('old', OLD.is_paid, 'new', NEW.is_paid) ELSE NULL END,
              'income_recipient_kind', CASE WHEN OLD.income_recipient_kind IS DISTINCT FROM NEW.income_recipient_kind
                THEN jsonb_build_object('old', OLD.income_recipient_kind, 'new', NEW.income_recipient_kind) ELSE NULL END,
              'transfer_from_admin_id', CASE WHEN OLD.transfer_from_admin_id IS DISTINCT FROM NEW.transfer_from_admin_id
                THEN jsonb_build_object('old', OLD.transfer_from_admin_id, 'new', NEW.transfer_from_admin_id) ELSE NULL END
            )),
        'guest_id', gid_one,
        'matching_guest_ids', to_jsonb(coalesce(gid, ARRAY[]::uuid[])),
        'source', public.audit_request_channel()
      ))
    );
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP FUNCTION IF EXISTS public.get_public_ticket(text);

CREATE OR REPLACE FUNCTION public.get_public_ticket(
  p_code text,
  p_client_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cleaned text;
  v_name text;
  v_code text;
  v_event_id uuid;
  v_phone text;
  v_above text;
  v_instruction text;
  v_below text;
  v_siblings jsonb;
  v_norm_name text;
  v_ctx jsonb;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  v_ctx := jsonb_strip_nulls(
    jsonb_build_object(
      'origin', 'public_ticket',
      'client', CASE
        WHEN p_client_meta IS NULL OR jsonb_typeof(p_client_meta) <> 'object' THEN '{}'::jsonb
        ELSE jsonb_strip_nulls(p_client_meta || '{}'::jsonb)
      END
    ));

  PERFORM set_config('app.card_open_audit_ctx', v_ctx::text, true);

  cleaned := trim(p_code);
  IF cleaned = '' THEN
    PERFORM set_config('app.card_open_audit_ctx', '{}', true);
    RETURN NULL;
  END IF;

  IF position('/ticket/' IN cleaned) > 0 THEN
    cleaned := split_part(split_part(cleaned, '/ticket/', 2), '?', 1);
    cleaned := split_part(cleaned, '#', 1);
    cleaned := trim(cleaned);
  ELSIF position('/guest/' IN cleaned) > 0 THEN
    cleaned := split_part(split_part(cleaned, '/guest/', 2), '?', 1);
    cleaned := split_part(cleaned, '#', 1);
    cleaned := trim(cleaned);
  END IF;

  SELECT
    g.name,
    g.unique_code,
    g.event_id,
    g.phone,
    e.card_text_above,
    e.card_text_instruction,
    e.card_text_below
  INTO v_name, v_code, v_event_id, v_phone, v_above, v_instruction, v_below
  FROM public.guests g
  INNER JOIN public.events e ON e.id = g.event_id
  WHERE (g.unique_code = cleaned OR g.invite_bundle_code = cleaned)
    AND g.deleted_at IS NULL
  LIMIT 1;

  IF v_name IS NULL THEN
    PERFORM set_config('app.card_open_audit_ctx', '{}', true);
    RETURN NULL;
  END IF;

  v_norm_name := trim(lower(regexp_replace(v_name, '\s+', ' ', 'g')));

  IF public.normalize_guest_phone_match(v_phone) = '' THEN
    v_siblings := to_jsonb(ARRAY[v_code]);
  ELSE
    SELECT COALESCE(
      to_jsonb(array_agg(g2.unique_code ORDER BY g2.created_at, g2.id)),
      '[]'::jsonb)
    INTO v_siblings
    FROM public.guests g2
    WHERE g2.event_id = v_event_id
      AND g2.deleted_at IS NULL
      AND trim(lower(regexp_replace(g2.name, '\s+', ' ', 'g'))) = v_norm_name
      AND public.normalize_guest_phone_match(g2.phone) = public.normalize_guest_phone_match(v_phone);
  END IF;

  UPDATE public.guests g3
  SET card_opened_at = now()
  WHERE g3.unique_code IN (SELECT jsonb_array_elements_text(v_siblings))
    AND g3.card_opened_at IS NULL
    AND g3.deleted_at IS NULL;

  PERFORM set_config('app.card_open_audit_ctx', '{}', true);

  RETURN jsonb_build_object(
    'event_id', v_event_id,
    'name', v_name,
    'code', v_code,
    'card_text_above', v_above,
    'card_text_instruction', v_instruction,
    'card_text_below', v_below,
    'sibling_codes', v_siblings
  );
END;
$$;

COMMENT ON FUNCTION public.get_public_ticket(text, jsonb) IS 'כרטיס ציבורי; ‎p_client_meta‎ — למשל ‎{"user_agent": "...", "navigator_language": "he"}‎ ללוג פתיחה';

DROP FUNCTION IF EXISTS public.record_guest_card_open(text);

CREATE OR REPLACE FUNCTION public.record_guest_card_open(
  p_code text,
  p_client_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cleaned text;
  v_event_id uuid;
  v_name text;
  v_phone text;
  v_norm_name text;
  v_ctx jsonb;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  v_ctx := jsonb_strip_nulls(
    jsonb_build_object(
      'origin', 'public_ticket',
      'client', CASE
        WHEN p_client_meta IS NULL OR jsonb_typeof(p_client_meta) <> 'object' THEN '{}'::jsonb
        ELSE jsonb_strip_nulls(p_client_meta || '{}'::jsonb)
      END
    ));

  PERFORM set_config('app.card_open_audit_ctx', v_ctx::text, true);

  cleaned := trim(p_code);
  IF cleaned = '' THEN
    PERFORM set_config('app.card_open_audit_ctx', '{}', true);
    RETURN;
  END IF;

  IF position('/ticket/' IN cleaned) > 0 THEN
    cleaned := split_part(split_part(cleaned, '/ticket/', 2), '?', 1);
    cleaned := split_part(cleaned, '#', 1);
    cleaned := trim(cleaned);
  ELSIF position('/guest/' IN cleaned) > 0 THEN
    cleaned := split_part(split_part(cleaned, '/guest/', 2), '?', 1);
    cleaned := split_part(cleaned, '#', 1);
    cleaned := trim(cleaned);
  END IF;

  SELECT g.event_id, g.name, g.phone
  INTO v_event_id, v_name, v_phone
  FROM public.guests g
  WHERE (g.unique_code = cleaned OR g.invite_bundle_code = cleaned)
    AND g.deleted_at IS NULL
  LIMIT 1;

  IF v_event_id IS NULL THEN
    PERFORM set_config('app.card_open_audit_ctx', '{}', true);
    RETURN;
  END IF;

  v_norm_name := trim(lower(regexp_replace(v_name, '\s+', ' ', 'g')));

  IF public.normalize_guest_phone_match(v_phone) = '' THEN
    UPDATE public.guests
    SET
      card_opened_at = COALESCE(card_opened_at, now()),
      updated_at = CASE WHEN card_opened_at IS NULL THEN now() ELSE updated_at END
    WHERE event_id = v_event_id
      AND unique_code = cleaned
      AND deleted_at IS NULL;
  ELSE
    UPDATE public.guests g2
    SET
      card_opened_at = COALESCE(g2.card_opened_at, now()),
      updated_at = CASE WHEN g2.card_opened_at IS NULL THEN now() ELSE g2.updated_at END
    WHERE g2.event_id = v_event_id
      AND g2.deleted_at IS NULL
      AND trim(lower(regexp_replace(g2.name, '\s+', ' ', 'g'))) = v_norm_name
      AND public.normalize_guest_phone_match(g2.phone) = public.normalize_guest_phone_match(v_phone);
  END IF;

  PERFORM set_config('app.card_open_audit_ctx', '{}', true);
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_guest_identity_ids_for_audit(uuid, text, text, int) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_public_ticket(text, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_ticket(text, jsonb) TO authenticated;

GRANT EXECUTE ON FUNCTION public.record_guest_card_open(text, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.record_guest_card_open(text, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
