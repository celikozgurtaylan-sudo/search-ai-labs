CREATE OR REPLACE FUNCTION public.refresh_participant_invitation(participant_id_input UUID, allow_completed BOOLEAN DEFAULT FALSE)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  participant_data JSONB
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_participant RECORD;
  v_project_owner_id UUID;
  v_new_token TEXT;
BEGIN
  -- Get participant and their project's owner
  SELECT p.*, proj.user_id INTO v_participant
  FROM public.study_participants p
  JOIN public.projects proj ON proj.id = p.project_id
  WHERE p.id = participant_id_input;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Participant not found'::TEXT, NULL::JSONB;
    RETURN;
  END IF;

  -- Check if participant has already completed (and if we allow refresh anyway)
  IF v_participant.status = 'completed' AND NOT allow_completed THEN
    RETURN QUERY SELECT FALSE, 'Cannot refresh token for a completed participant'::TEXT, NULL::JSONB;
    RETURN;
  END IF;

  -- Generate new token (using a simple random string for now, could be improved)
  v_new_token := encode(gen_random_bytes(24), 'base64');
  v_new_token := replace(replace(replace(v_new_token, '/', '_'), '+', '-'), '=', '');

  -- Update participant with new token and reset status if needed
  UPDATE public.study_participants
  SET 
    invitation_token = v_new_token,
    token_expires_at = now() + interval '7 days',
    status = CASE WHEN status = 'completed' THEN 'completed' ELSE 'invited' END,
    updated_at = now()
  WHERE id = participant_id_input
  RETURNING * INTO v_participant;

  RETURN QUERY SELECT 
    TRUE, 
    'Invitation token refreshed successfully'::TEXT, 
    to_jsonb(v_participant);
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_participant_invitation(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_participant_invitation(UUID, BOOLEAN) TO service_role;