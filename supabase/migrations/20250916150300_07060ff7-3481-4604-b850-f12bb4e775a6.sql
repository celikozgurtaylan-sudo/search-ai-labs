-- Add archived fields to projects table
ALTER TABLE public.projects 
ADD COLUMN archived BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN archived_at TIMESTAMP WITH TIME ZONE;

-- Create index for better performance when filtering archived projects
CREATE INDEX idx_projects_archived ON public.projects(archived, user_id) WHERE archived = false;