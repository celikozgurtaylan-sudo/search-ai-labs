-- Fix study_participants SELECT policy to properly validate project ownership
-- Drop the existing policy
DROP POLICY IF EXISTS "Users can view their own study participants" ON public.study_participants;

-- Create a more secure and explicit policy
CREATE POLICY "Users can view their own study participants" 
ON public.study_participants 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1
    FROM public.projects
    WHERE projects.id = study_participants.project_id
      AND projects.user_id = auth.uid()
  )
);

-- Also ensure the policy is properly indexed for performance
-- Add index on study_participants.project_id if not exists
CREATE INDEX IF NOT EXISTS idx_study_participants_project_id 
ON public.study_participants(project_id);