-- Create RPC function to get project data for valid participant sessions
-- This allows anonymous participants to read project data if they have a valid session token
CREATE OR REPLACE FUNCTION public.get_project_for_session(session_token_input text)
RETURNS TABLE(
  id uuid,
  title text,
  description text,
  analysis jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Return project data only if the session token is valid
  RETURN QUERY
  SELECT 
    p.id,
    p.title,
    p.description,
    p.analysis
  FROM projects p
  INNER JOIN study_sessions ss ON ss.project_id = p.id
  WHERE ss.session_token = session_token_input
    AND ss.status IN ('scheduled', 'active');
END;
$$;