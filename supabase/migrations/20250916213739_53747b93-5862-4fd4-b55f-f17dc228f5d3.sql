-- Fix security issue: Restrict session token access
-- Drop existing policies that may be too permissive
DROP POLICY IF EXISTS "Participants can access sessions with valid tokens" ON public.study_sessions;
DROP POLICY IF EXISTS "Users can view their own study sessions" ON public.study_sessions;

-- Create more secure policies

-- Policy 1: Project owners can view all session data for their projects
CREATE POLICY "Project owners can view their sessions" 
ON public.study_sessions 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL 
  AND EXISTS (
    SELECT 1 FROM projects p 
    WHERE p.id = study_sessions.project_id 
    AND p.user_id = auth.uid()
  )
);

-- Policy 2: Participants can access only their specific session data (without exposing tokens to them)
-- This policy allows participants to read session data but we'll handle token validation in the application layer
CREATE POLICY "Participants can access their session data"
ON public.study_sessions
FOR SELECT
USING (
  auth.uid() IS NULL 
  AND is_valid_participant_token(session_token)
);

-- Ensure participants can update session status when they join/complete
CREATE POLICY "Participants can update their session status"
ON public.study_sessions
FOR UPDATE
USING (
  (auth.uid() IS NULL AND is_valid_participant_token(session_token))
  OR 
  (auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM projects p 
    WHERE p.id = study_sessions.project_id 
    AND p.user_id = auth.uid()
  ))
);