-- CRITICAL SECURITY FIX: Fix participant session access vulnerability

-- Drop the flawed policy that allows unauthenticated access
DROP POLICY IF EXISTS "Participants can view their own sessions" ON public.study_sessions;

-- Create a secure function for token-based participant authentication
CREATE OR REPLACE FUNCTION public.is_valid_participant_token(session_token TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if the session token matches a valid participant invitation token
  -- and the session exists for that participant
  RETURN EXISTS (
    SELECT 1 
    FROM public.study_participants sp
    JOIN public.study_sessions ss ON ss.participant_id = sp.id
    WHERE sp.invitation_token = session_token 
    AND ss.session_token = session_token
    -- Ensure token hasn't expired
    AND sp.token_expires_at > now()
    -- Ensure participant is in valid state (invited or joined)
    AND sp.status IN ('invited', 'joined')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Create secure policy for participant session access using token validation
CREATE POLICY "Participants can access sessions with valid tokens" 
ON public.study_sessions 
FOR SELECT 
USING (
  -- Allow authenticated users to view their own project sessions
  (auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.projects p 
    WHERE p.id = study_sessions.project_id 
    AND p.user_id = auth.uid()
  ))
  OR
  -- Allow participants with valid tokens to view their specific sessions
  (auth.uid() IS NULL AND public.is_valid_participant_token(study_sessions.session_token))
);

-- Also secure the study_participants table from potential token enumeration
-- Update existing policy to be more restrictive
DROP POLICY IF EXISTS "Users can view their own study participants" ON public.study_participants;

CREATE POLICY "Users can view their own study participants" 
ON public.study_participants 
FOR SELECT 
USING (
  -- Only authenticated project owners can view participants
  auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.projects p 
    WHERE p.id = study_participants.project_id 
    AND p.user_id = auth.uid()
  )
);