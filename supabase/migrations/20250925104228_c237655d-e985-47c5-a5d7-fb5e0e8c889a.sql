-- Create RPC function to allow participants to update their status using tokens
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
  valid_transitions text[] := ARRAY['invited', 'joined', 'completed', 'declined'];
BEGIN
  -- Validate the new status is allowed
  IF new_status != ALL(valid_transitions) THEN
    RETURN QUERY SELECT false, 'Invalid status', null::json;
    RETURN;
  END IF;

  -- Find and validate the participant by token
  SELECT * INTO participant_row
  FROM study_participants 
  WHERE invitation_token = token_input
    AND token_expires_at > now()
    AND status IN ('invited', 'joined'); -- Only allow transitions from these states

  -- Check if participant exists and token is valid
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Invalid or expired token', null::json;
    RETURN;
  END IF;

  -- Validate status transitions
  IF participant_row.status = 'completed' OR participant_row.status = 'declined' THEN
    RETURN QUERY SELECT false, 'Participant has already completed or declined', null::json;
    RETURN;
  END IF;

  -- Only allow certain transitions
  IF participant_row.status = 'invited' AND new_status NOT IN ('joined', 'declined') THEN
    RETURN QUERY SELECT false, 'Invalid status transition from invited', null::json;
    RETURN;
  END IF;

  IF participant_row.status = 'joined' AND new_status NOT IN ('completed', 'declined') THEN
    RETURN QUERY SELECT false, 'Invalid status transition from joined', null::json;
    RETURN;
  END IF;

  -- Update the participant status with appropriate timestamps
  UPDATE study_participants 
  SET 
    status = new_status,
    joined_at = CASE WHEN new_status = 'joined' THEN now() ELSE joined_at END,
    completed_at = CASE WHEN new_status = 'completed' THEN now() ELSE completed_at END,
    updated_at = now()
  WHERE invitation_token = token_input;

  -- Get updated participant data
  SELECT * INTO participant_row
  FROM study_participants 
  WHERE invitation_token = token_input;

  -- Return success with participant data
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