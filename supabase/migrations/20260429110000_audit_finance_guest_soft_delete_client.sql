-- ביקורת: שורות כספים, אורח (מחיקה רכה / שחזור / עדכון ללא רעש), ופעולות לקוח (התחברות / ייצוא לוגים)
-- =============================================================================

-- --- אורחים: soft delete, restore, source, דילוג על עדכון שמשנה רק updated_at -----
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
  v_fields text[] := ARRAY[]::text[];
  v_soft_deleted boolean;
  v_restored boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
    VALUES (v_uid, 'guest.create', 'guest', NEW.id, NEW.event_id, 'success',
            jsonb_build_object('name', left(NEW.name, 100), 'source', NEW.source));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
    VALUES (v_uid, 'guest.delete', 'guest', OLD.id, OLD.event_id, 'success',
            jsonb_build_object('name', left(OLD.name, 100)));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF coalesce(nullif(current_setting('app.suppress_guest_audit', true), ''), '') = '1' THEN
      RETURN NEW;
    END IF;

    v_event := NEW.event_id;

    v_soft_deleted := OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL;
    v_restored := OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL;

    IF v_soft_deleted THEN
      INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
      VALUES (v_uid, 'guest.soft_delete', 'guest', NEW.id, v_event, 'success',
              jsonb_build_object('name', left(NEW.name, 100), 'deleted_at', NEW.deleted_at));
      RETURN NEW;
    END IF;

    IF v_restored THEN
      INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
      VALUES (v_uid, 'guest.restore', 'guest', NEW.id, v_event, 'success',
              jsonb_build_object('name', left(NEW.name, 100)));
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

    IF v_only_invite THEN
      v_action := 'invite.mark_sent';
      v_meta := jsonb_build_object('method', NEW.invite_sent_method);
      INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
      VALUES (v_uid, v_action, 'guest', NEW.id, v_event, 'success', v_meta);
      RETURN NEW;
    END IF;

    v_action := 'guest.update';
    IF OLD.name IS DISTINCT FROM NEW.name THEN v_fields := array_append(v_fields, 'name'); END IF;
    IF OLD.phone IS DISTINCT FROM NEW.phone THEN v_fields := array_append(v_fields, 'phone'); END IF;
    IF OLD.status IS DISTINCT FROM NEW.status THEN v_fields := array_append(v_fields, 'status'); END IF;
    IF OLD.entered_at IS DISTINCT FROM NEW.entered_at THEN v_fields := array_append(v_fields, 'entered_at'); END IF;
    IF OLD.unique_code IS DISTINCT FROM NEW.unique_code THEN v_fields := array_append(v_fields, 'unique_code'); END IF;
    IF OLD.invite_bundle_code IS DISTINCT FROM NEW.invite_bundle_code THEN v_fields := array_append(v_fields, 'invite_bundle_code'); END IF;
    IF OLD.card_opened_at IS DISTINCT FROM NEW.card_opened_at THEN v_fields := array_append(v_fields, 'card_opened_at'); END IF;
    IF OLD.whatsapp_invite_sent_at IS DISTINCT FROM NEW.whatsapp_invite_sent_at
       OR OLD.invite_sent_method IS DISTINCT FROM NEW.invite_sent_method
    THEN
      v_fields := array_append(v_fields, 'whatsapp_invite');
    END IF;
    IF OLD.source IS DISTINCT FROM NEW.source THEN v_fields := array_append(v_fields, 'source'); END IF;

    IF coalesce(array_length(v_fields, 1), 0) = 0 THEN
      RETURN NEW;
    END IF;

    v_meta := jsonb_build_object('fields', to_jsonb(v_fields), 'name', left(NEW.name, 80));

    INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
    VALUES (v_uid, v_action, 'guest', NEW.id, v_event, 'success', v_meta);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

-- --- שורות כספים -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tr_audit_event_finance_lines()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_fields text[] := ARRAY[]::text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
    VALUES (
      v_uid, 'finance_line.create', 'finance_line', NEW.id, NEW.event_id, 'success',
      jsonb_build_object(
        'line_kind', NEW.line_kind,
        'person_name', left(NEW.person_name, 120),
        'amount', NEW.amount,
        'is_paid', NEW.is_paid,
        'recipient_admin_id', NEW.recipient_admin_id,
        'income_recipient_kind', NEW.income_recipient_kind,
        'transfer_from_admin_id', NEW.transfer_from_admin_id,
        'created_by', NEW.created_by
      )
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
    VALUES (
      v_uid, 'finance_line.delete', 'finance_line', OLD.id, OLD.event_id, 'success',
      jsonb_build_object(
        'line_kind', OLD.line_kind,
        'person_name', left(OLD.person_name, 120),
        'amount', OLD.amount
      )
    );
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.line_kind IS DISTINCT FROM NEW.line_kind THEN v_fields := array_append(v_fields, 'line_kind'); END IF;
    IF OLD.person_name IS DISTINCT FROM NEW.person_name THEN v_fields := array_append(v_fields, 'person_name'); END IF;
    IF OLD.phone IS DISTINCT FROM NEW.phone THEN v_fields := array_append(v_fields, 'phone'); END IF;
    IF OLD.amount IS DISTINCT FROM NEW.amount THEN v_fields := array_append(v_fields, 'amount'); END IF;
    IF OLD.recipient_admin_id IS DISTINCT FROM NEW.recipient_admin_id THEN v_fields := array_append(v_fields, 'recipient_admin_id'); END IF;
    IF OLD.is_paid IS DISTINCT FROM NEW.is_paid THEN v_fields := array_append(v_fields, 'is_paid'); END IF;
    IF OLD.income_recipient_kind IS DISTINCT FROM NEW.income_recipient_kind THEN v_fields := array_append(v_fields, 'income_recipient_kind'); END IF;
    IF OLD.transfer_from_admin_id IS DISTINCT FROM NEW.transfer_from_admin_id THEN v_fields := array_append(v_fields, 'transfer_from_admin_id'); END IF;

    IF coalesce(array_length(v_fields, 1), 0) = 0 THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
    VALUES (
      v_uid, 'finance_line.update', 'finance_line', NEW.id, NEW.event_id, 'success',
      jsonb_build_object(
        'fields', to_jsonb(v_fields),
        'person_name', left(NEW.person_name, 120),
        'line_kind', NEW.line_kind
      )
    );
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tr_audit_event_finance_lines ON public.event_finance_lines;
CREATE TRIGGER tr_audit_event_finance_lines
  AFTER INSERT OR UPDATE OR DELETE ON public.event_finance_lines
  FOR EACH ROW
  EXECUTE PROCEDURE public.tr_audit_event_finance_lines();

-- --- פעולות לקוח (אין שורת DB) — רשימת פעולות סגורה ---------------------------
CREATE OR REPLACE FUNCTION public.log_client_audit_event(
  p_action text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u uuid;
  a text;
BEGIN
  u := auth.uid();
  IF u IS NULL THEN
    RETURN;
  END IF;

  a := lower(btrim(coalesce(p_action, '')));
  IF a NOT IN (
    'auth.sign_in',
    'auth.sign_out',
    'auth.sign_up',
    'logs.export'
  ) THEN
    RAISE EXCEPTION 'פעולת ביקורת לא מורשית' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, event_id, status, metadata)
  VALUES (u, a, 'client', NULL, NULL, 'success', coalesce(p_metadata, '{}'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.log_client_audit_event(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_client_audit_event(text, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
