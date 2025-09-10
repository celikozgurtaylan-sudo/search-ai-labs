-- Remove all RLS policies from projects table
DROP POLICY IF EXISTS "Users can create their own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can delete their own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can update their own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can view their own projects" ON public.projects;

-- Remove all RLS policies from profiles table
DROP POLICY IF EXISTS "Users can create their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

-- Disable RLS on projects table
ALTER TABLE public.projects DISABLE ROW LEVEL SECURITY;

-- Drop the profiles table entirely
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Drop the handle_new_user function
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- Remove user_id column from projects table
ALTER TABLE public.projects DROP COLUMN IF EXISTS user_id;

-- Make projects table completely public (no RLS needed)
-- Projects will now be accessible to everyone without authentication