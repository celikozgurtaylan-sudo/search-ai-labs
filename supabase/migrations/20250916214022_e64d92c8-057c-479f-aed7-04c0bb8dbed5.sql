-- Fix security issue: First check what policies exist and drop them properly
DO $$
BEGIN
  -- Drop all existing SELECT policies on study_sessions
  DROP POLICY IF EXISTS "Participants can access sessions with valid tokens" ON public.study_sessions;
  DROP POLICY IF EXISTS "Users can view their own study sessions" ON public.study_sessions;
  DROP POLICY IF EXISTS "Project owners can view their sessions" ON public.study_sessions;
  DROP POLICY IF EXISTS "Participants can access their session data" ON public.study_sessions;
  DROP POLICY IF EXISTS "Participants can update their session status" ON public.study_sessions;
END $$;

-- Create secure policies with proper separation of concerns

-- Policy 1: Project owners can view all session data for their projects (including tokens for management)
CREATE POLICY "Project owners view sessions" 
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

-- Policy 2: Participants can access their specific session (token is validated by the function)
CREATE POLICY "Participants access sessions"
ON public.study_sessions
FOR SELECT
USING (
  auth.uid() IS NULL 
  AND is_valid_participant_token(session_token)
);

-- Keep existing INSERT and UPDATE policies as they were secure
-- Project owners can create sessions for their projects
CREATE POLICY "Project owners create sessions" 
ON public.study_sessions 
FOR INSERT 
WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = study_sessions.project_id 
    AND projects.user_id = auth.uid()
  )
);

-- Both project owners and participants can update sessions
CREATE POLICY "Authorized users update sessions"
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