-- Enable Row Level Security on projects table
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Create policy to allow public read access to projects
-- This maintains current functionality while adding security foundation
CREATE POLICY "Allow public read access to projects" 
ON public.projects 
FOR SELECT 
USING (true);

-- Create policy to allow public insert access to projects
-- This maintains current functionality while adding security foundation
CREATE POLICY "Allow public insert access to projects" 
ON public.projects 
FOR INSERT 
WITH CHECK (true);

-- Create policy to allow public update access to projects
-- This maintains current functionality while adding security foundation
CREATE POLICY "Allow public update access to projects" 
ON public.projects 
FOR UPDATE 
USING (true);

-- Create policy to allow public delete access to projects
-- This maintains current functionality while adding security foundation
CREATE POLICY "Allow public delete access to projects" 
ON public.projects 
FOR DELETE 
USING (true);

-- Add user_id column to projects table for future user-based access control
-- Making it nullable for now to maintain compatibility with existing data
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Create index on user_id for better performance
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);