-- תנאי שימוש / צילום בתחתית כרטיס האורח (ניתן לעריכה; null = ברירת מחדל בצד האפליקציה)

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS card_text_terms text;

COMMENT ON COLUMN public.events.card_text_terms IS
  'טקסט תנאי שימוש בתחתית הכרטיס; ריק=null מציג ברירת מחדל בלקוח; "." בלבד = להסתיר';

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
    IF OLD.card_text_terms IS DISTINCT FROM NEW.card_text_terms THEN
      v_chg := v_chg ||
        jsonb_build_object(
          'card_text_terms',
          jsonb_build_object(
            'old', left(trim(coalesce(OLD.card_text_terms, '')), v_trunc),
            'new', left(trim(coalesce(NEW.card_text_terms, '')), v_trunc)));
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

CREATE OR REPLACE FUNCTION public.get_public_ticket_no_open_record(p_code text)
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
  v_terms text;
  v_siblings jsonb;
  v_norm_name text;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  cleaned := trim(p_code);
  IF cleaned = '' THEN
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
    e.card_text_below,
    e.card_text_terms
  INTO v_name, v_code, v_event_id, v_phone, v_above, v_instruction, v_below, v_terms
  FROM public.guests g
  INNER JOIN public.events e ON e.id = g.event_id
  WHERE (g.unique_code = cleaned OR g.invite_bundle_code = cleaned)
    AND g.deleted_at IS NULL
  LIMIT 1;

  IF v_name IS NULL THEN
    RETURN NULL;
  END IF;

  v_norm_name := trim(lower(regexp_replace(v_name, '\s+', ' ', 'g')));

  IF public.normalize_guest_phone_match(v_phone) = '' THEN
    v_siblings := to_jsonb(ARRAY[v_code]);
  ELSE
    SELECT COALESCE(
      to_jsonb(array_agg(g2.unique_code ORDER BY g2.created_at, g2.id)),
      '[]'::jsonb
    )
    INTO v_siblings
    FROM public.guests g2
    WHERE g2.event_id = v_event_id
      AND g2.deleted_at IS NULL
      AND trim(lower(regexp_replace(g2.name, '\s+', ' ', 'g'))) = v_norm_name
      AND public.normalize_guest_phone_match(g2.phone) = public.normalize_guest_phone_match(v_phone);
  END IF;

  RETURN jsonb_build_object(
    'event_id', v_event_id,
    'name', v_name,
    'code', v_code,
    'card_text_above', v_above,
    'card_text_instruction', v_instruction,
    'card_text_below', v_below,
    'card_text_terms', v_terms,
    'sibling_codes', v_siblings
  );
END;
$$;

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
  v_terms text;
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
    e.card_text_below,
    e.card_text_terms
  INTO v_name, v_code, v_event_id, v_phone, v_above, v_instruction, v_below, v_terms
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
    'card_text_terms', v_terms,
    'sibling_codes', v_siblings
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
