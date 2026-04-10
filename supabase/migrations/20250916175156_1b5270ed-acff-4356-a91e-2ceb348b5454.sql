-- Add RLS policy to allow anonymous users to access participant data via invitation tokens
CREATE POLICY "Anonymous users can view participants with valid tokens" 
ON public.study_participants 
FOR SELECT 
USING (
  -- Allow anonymous access when token is valid and not expired
  (auth.uid() IS NULL) 
  AND (invitation_token IS NOT NULL)
  AND (token_expires_at > now())
  AND (status IN ('invited', 'joined'))
);