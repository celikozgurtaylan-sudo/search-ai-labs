-- Remove the overly permissive anonymous access policy
DROP POLICY IF EXISTS "Anonymous users can view participants with valid tokens" ON public.study_participants;

-- Create a secure function to validate participant tokens and return minimal data
CREATE OR REPLACE FUNCTION public.validate_participant_token(token_input text)
RETURNS TABLE (
  id uuid,
  project_id uuid,
  email text,
  name text,
  status text,
  invitation_token text
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Return participant data only for the specific token provided
  -- This prevents token enumeration and limits data exposure
  RETURN QUERY
  SELECT 
    sp.id,
    sp.project_id,
    sp.email,
    sp.name,
    sp.status,
    sp.invitation_token
  FROM study_participants sp
  WHERE sp.invitation_token = token_input
    AND sp.token_expires_at > now()
    AND sp.status IN ('invited', 'joined');
END;
$$;

-- Grant execute permission to anonymous users for this specific function
GRANT EXECUTE ON FUNCTION public.validate_participant_token(text) TO anon;