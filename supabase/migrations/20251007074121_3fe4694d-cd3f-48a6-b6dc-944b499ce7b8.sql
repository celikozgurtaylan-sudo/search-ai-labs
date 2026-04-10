-- Grant execute permission on update_participant_status_by_token to anonymous users
-- This allows participants to update their own status using their invitation token
GRANT EXECUTE ON FUNCTION public.update_participant_status_by_token(text, text) TO anon;