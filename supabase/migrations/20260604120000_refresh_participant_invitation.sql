CREATE OR REPLACE FUNCTION public.refresh_participant_invitation(
  participant_id_input uuid,
  allow_completed boolean DEFAULT false
)
RETURNS TABLE(success boolean, message text, participant_data json)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  participant_row study_participants%ROWTYPE;
  refreshed_participant study_participants%ROWTYPE;
BEGIN
  SELECT sp.*
  INTO participant_row
  FROM study_participants sp
  JOIN projects p ON p.id = sp.project_id
  WHERE sp.id = participant_id_input
    AND p.user_id = auth.uid()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Participant not found', null::json;
    RETURN;
  END IF;

  IF participant_row.status = 'completed' AND NOT allow_completed THEN
    RETURN QUERY SELECT false, 'Completed participant requires confirmation', null::json;
    RETURN;
  END IF;

  IF participant_row.status NOT IN ('invited', 'completed') THEN
    RETURN QUERY SELECT false, 'Participant cannot be resent in current status', null::json;
    RETURN;
  END IF;

  UPDATE study_sessions
  SET
    status = 'cancelled',
    ended_at = CASE WHEN status = 'active' AND ended_at IS NULL THEN now() ELSE ended_at END,
    updated_at = now()
  WHERE participant_id = participant_row.id
    AND status IN ('scheduled', 'active');

  UPDATE study_participants
  SET
    invitation_token = 'user-study-' || gen_random_uuid()::text,
    token_expires_at = now() + interval '7 days',
    invited_at = now(),
    status = 'invited',
    joined_at = null,
    completed_at = null,
    updated_at = now()
  WHERE id = participant_row.id
  RETURNING *
  INTO refreshed_participant;

  RETURN QUERY SELECT
    true,
    'Invitation refreshed successfully',
    row_to_json(refreshed_participant)::json;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_participant_invitation(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_participant_invitation(uuid, boolean) TO authenticated;
