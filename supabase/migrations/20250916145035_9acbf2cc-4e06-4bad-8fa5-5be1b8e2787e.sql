-- CRITICAL SECURITY FIX: Clean up data and secure projects table

-- Delete projects with null user_id (orphaned data that can't be secured)
DELETE FROM public.projects WHERE user_id IS NULL;

-- Drop all existing public policies on projects table
DROP POLICY IF EXISTS "Allow public delete access to projects" ON public.projects;
DROP POLICY IF EXISTS "Allow public insert access to projects" ON public.projects;
DROP POLICY IF EXISTS "Allow public read access to projects" ON public.projects;
DROP POLICY IF EXISTS "Allow public update access to projects" ON public.projects;

-- Add NOT NULL constraint to user_id to enforce data integrity
ALTER TABLE public.projects ALTER COLUMN user_id SET NOT NULL;

-- Create secure user-specific RLS policies
CREATE POLICY "Users can view their own projects" 
ON public.projects 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own projects" 
ON public.projects 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own projects" 
ON public.projects 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own projects" 
ON public.projects 
FOR DELETE 
USING (auth.uid() = user_id);

-- Add index for better performance on user_id queries
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);