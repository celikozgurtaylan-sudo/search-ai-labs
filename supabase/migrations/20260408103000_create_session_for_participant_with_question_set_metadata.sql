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
  session_metadata jsonb;
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
