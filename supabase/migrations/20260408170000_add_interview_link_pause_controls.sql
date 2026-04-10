CREATE OR REPLACE FUNCTION public.resolve_participant_invitation_access(token_input text)
RETURNS TABLE(
  access_state text,
  message text,
  participant_data json,
  project_link_access text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  participant_row study_participants%ROWTYPE;
  project_row projects%ROWTYPE;
  link_access text := 'active';
BEGIN
  SELECT *
  INTO participant_row
  FROM study_participants
  WHERE invitation_token = token_input
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid_or_expired', 'Geçersiz veya süresi dolmuş davet linki', null::json, 'active';
    RETURN;
  END IF;

  SELECT *
  INTO project_row
  FROM projects
  WHERE id = participant_row.project_id
  LIMIT 1;

  link_access := COALESCE(project_row.analysis -> 'interviewControl' ->> 'linkAccess', 'active');

  IF participant_row.token_expires_at <= now() THEN
    RETURN QUERY SELECT 'invalid_or_expired', 'Geçersiz veya süresi dolmuş davet linki', null::json, link_access;
    RETURN;
  END IF;

  IF participant_row.status = 'declined' THEN
    RETURN QUERY SELECT 'declined_or_completed', 'Bu davet reddedilmiş', row_to_json(participant_row)::json, link_access;
    RETURN;
  END IF;

  IF participant_row.status = 'completed' THEN
    RETURN QUERY SELECT 'declined_or_completed', 'Bu davet artık aktif değil', row_to_json(participant_row)::json, link_access;
    RETURN;
  END IF;

  IF link_access = 'paused' THEN
    RETURN QUERY SELECT 'paused', 'Araştırma geçici olarak duraklatıldı. Lütfen daha sonra tekrar deneyin.', row_to_json(participant_row)::json, link_access;
    RETURN;
  END IF;

  IF participant_row.status NOT IN ('invited', 'joined') THEN
    RETURN QUERY SELECT 'invalid_or_expired', 'Geçersiz veya süresi dolmuş davet linki', null::json, link_access;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'active', null::text, row_to_json(participant_row)::json, link_access;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_participant_invitation_access(text) TO anon;

CREATE OR REPLACE FUNCTION public.resolve_session_access(session_token_input text)
RETURNS TABLE(
  access_state text,
  message text,
  session_data json,
  participant_data json,
  project_data json
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  session_row study_sessions%ROWTYPE;
  participant_row study_participants%ROWTYPE;
  project_row projects%ROWTYPE;
  link_access text := 'active';
BEGIN
  SELECT *
  INTO session_row
  FROM study_sessions
  WHERE session_token = session_token_input
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid_or_expired', 'Geçersiz veya süresi dolmuş oturum linki', null::json, null::json, null::json;
    RETURN;
  END IF;

  IF session_row.participant_id IS NOT NULL THEN
    SELECT *
    INTO participant_row
    FROM study_participants
    WHERE id = session_row.participant_id
    LIMIT 1;
  END IF;

  SELECT *
  INTO project_row
  FROM projects
  WHERE id = session_row.project_id
  LIMIT 1;

  link_access := COALESCE(project_row.analysis -> 'interviewControl' ->> 'linkAccess', 'active');

  IF link_access = 'paused' AND session_row.status NOT IN ('active', 'completed') THEN
    RETURN QUERY SELECT
      'paused',
      'Araştırma geçici olarak duraklatıldı. Görüşmeler devam ettirilene kadar bu link kullanılamaz.',
      row_to_json(session_row)::json,
      CASE WHEN participant_row.id IS NOT NULL THEN row_to_json(participant_row)::json ELSE null::json END,
      row_to_json(project_row)::json;
    RETURN;
  END IF;

  IF session_row.status = 'cancelled' THEN
    RETURN QUERY SELECT 'invalid_or_expired', 'Bu oturum artık aktif değil', null::json, null::json, null::json;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    'active',
    null::text,
    row_to_json(session_row)::json,
    CASE WHEN participant_row.id IS NOT NULL THEN row_to_json(participant_row)::json ELSE null::json END,
    row_to_json(project_row)::json;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_session_access(text) TO anon;

CREATE OR REPLACE FUNCTION public.create_session_for_participant(
  token_input text,
  session_token_input text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  participant_row study_participants%ROWTYPE;
  existing_session study_sessions%ROWTYPE;
  session_row study_sessions%ROWTYPE;
  project_row projects%ROWTYPE;
  session_metadata jsonb;
  link_access text := 'active';
BEGIN
  SELECT *
  INTO participant_row
  FROM study_participants
  WHERE invitation_token = token_input
    AND token_expires_at > now()
    AND status IN ('invited', 'joined')
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Invalid or expired token'
    );
  END IF;

  SELECT *
  INTO project_row
  FROM projects
  WHERE id = participant_row.project_id
  LIMIT 1;

  link_access := COALESCE(project_row.analysis -> 'interviewControl' ->> 'linkAccess', 'active');

  IF link_access = 'paused' THEN
    RETURN json_build_object(
      'success', false,
      'code', 'research_paused',
      'message', 'Araştırma geçici olarak durduruldu. Lütfen daha sonra tekrar deneyin.'
    );
  END IF;

  SELECT *
  INTO existing_session
  FROM study_sessions
  WHERE participant_id = participant_row.id
    AND status IN ('scheduled', 'active')
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN json_build_object(
      'success', true,
      'message', 'Session already exists',
      'session_data', row_to_json(existing_session)
    );
  END IF;

  session_metadata := COALESCE(participant_row.metadata, '{}'::jsonb) || jsonb_build_object(
    'questionSetVersionId', participant_row.metadata ->> 'questionSetVersionId',
    'questionSetVersionNumber', participant_row.metadata -> 'questionSetVersionNumber',
    'questionSetAssignedAt', COALESCE(participant_row.metadata ->> 'questionSetAssignedAt', now()::text)
  );

  INSERT INTO study_sessions (
    project_id,
    participant_id,
    session_token,
    status,
    metadata
  )
  VALUES (
    participant_row.project_id,
    participant_row.id,
    session_token_input,
    'scheduled',
    session_metadata
  )
  RETURNING *
  INTO session_row;

  RETURN json_build_object(
    'success', true,
    'message', 'Session created successfully',
    'session_data', row_to_json(session_row)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_session_for_participant(text, text) TO anon;

DROP FUNCTION IF EXISTS public.update_participant_status_by_token(text, text);

CREATE OR REPLACE FUNCTION public.update_participant_status_by_token(
  token_input text,
  new_status text
)
RETURNS TABLE(success boolean, message text, participant_data json)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  participant_row study_participants%ROWTYPE;
  project_row projects%ROWTYPE;
  valid_transitions text[] := ARRAY['invited', 'joined', 'completed', 'declined'];
  link_access text := 'active';
BEGIN
  IF new_status != ALL(valid_transitions) THEN
    RETURN QUERY SELECT false, 'Invalid status', null::json;
    RETURN;
  END IF;

  SELECT * INTO participant_row
  FROM study_participants
  WHERE invitation_token = token_input
    AND token_expires_at > now()
    AND status IN ('invited', 'joined');

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Invalid or expired token', null::json;
    RETURN;
  END IF;

  IF new_status = 'joined' THEN
    SELECT *
    INTO project_row
    FROM projects
    WHERE id = participant_row.project_id
    LIMIT 1;

    link_access := COALESCE(project_row.analysis -> 'interviewControl' ->> 'linkAccess', 'active');

    IF link_access = 'paused' THEN
      RETURN QUERY SELECT false, 'Araştırma geçici olarak durduruldu. Lütfen daha sonra tekrar deneyin.', null::json;
      RETURN;
    END IF;
  END IF;

  IF participant_row.status = 'completed' OR participant_row.status = 'declined' THEN
    RETURN QUERY SELECT false, 'Participant has already completed or declined', null::json;
    RETURN;
  END IF;

  IF participant_row.status = 'invited' AND new_status NOT IN ('joined', 'declined') THEN
    RETURN QUERY SELECT false, 'Invalid status transition from invited', null::json;
    RETURN;
  END IF;

  IF participant_row.status = 'joined' AND new_status NOT IN ('completed', 'declined') THEN
    RETURN QUERY SELECT false, 'Invalid status transition from joined', null::json;
    RETURN;
  END IF;

  UPDATE study_participants
  SET
    status = new_status,
    joined_at = CASE WHEN new_status = 'joined' THEN now() ELSE joined_at END,
    completed_at = CASE WHEN new_status = 'completed' THEN now() ELSE completed_at END,
    updated_at = now()
  WHERE invitation_token = token_input;

  SELECT * INTO participant_row
  FROM study_participants
  WHERE invitation_token = token_input;

  RETURN QUERY SELECT
    true,
    'Status updated successfully',
    json_build_object(
      'id', participant_row.id,
      'project_id', participant_row.project_id,
      'email', participant_row.email,
      'name', participant_row.name,
      'status', participant_row.status,
      'invitation_token', participant_row.invitation_token,
      'joined_at', participant_row.joined_at,
      'completed_at', participant_row.completed_at
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_participant_status_by_token(text, text) TO anon;
