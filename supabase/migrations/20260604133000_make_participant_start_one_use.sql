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
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'code', 'invalid_or_expired',
      'message', 'Invalid or expired token'
    );
  END IF;

  IF participant_row.status = 'joined' THEN
    RETURN json_build_object(
      'success', false,
      'code', 'already_started',
      'message', 'Invitation has already been started'
    );
  END IF;

  IF participant_row.status <> 'invited' THEN
    RETURN json_build_object(
      'success', false,
      'code', 'invalid_or_expired',
      'message', 'Invitation is no longer active'
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
    UPDATE study_participants
    SET
      status = 'joined',
      joined_at = COALESCE(joined_at, now()),
      updated_at = now()
    WHERE id = participant_row.id;

    RETURN json_build_object(
      'success', false,
      'code', 'already_started',
      'message', 'Invitation has already been started'
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

  UPDATE study_participants
  SET
    status = 'joined',
    joined_at = now(),
    updated_at = now()
  WHERE id = participant_row.id;

  RETURN json_build_object(
    'success', true,
    'message', 'Session created successfully',
    'session_data', row_to_json(session_row)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_session_for_participant(text, text) TO anon;
