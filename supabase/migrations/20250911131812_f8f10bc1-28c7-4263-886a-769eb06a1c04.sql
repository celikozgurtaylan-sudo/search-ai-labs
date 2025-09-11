-- Create tables for manual participant invitation system

-- Create study_participants table to track invited participants
CREATE TABLE public.study_participants (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL,
  email text NOT NULL,
  name text,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'joined', 'completed', 'declined')),
  invited_at timestamp with time zone NOT NULL DEFAULT now(),
  joined_at timestamp with time zone,
  completed_at timestamp with time zone,
  invitation_token text UNIQUE NOT NULL,
  token_expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '7 days'),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on study_participants
ALTER TABLE public.study_participants ENABLE ROW LEVEL SECURITY;

-- Create policies for study_participants (user can only access participants for their own projects)
CREATE POLICY "Users can view their own study participants"
ON public.study_participants
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.projects 
  WHERE projects.id = study_participants.project_id 
  AND projects.user_id = auth.uid()
));

CREATE POLICY "Users can create participants for their own projects"
ON public.study_participants
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.projects 
  WHERE projects.id = study_participants.project_id 
  AND projects.user_id = auth.uid()
));

CREATE POLICY "Users can update their own study participants"
ON public.study_participants
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.projects 
  WHERE projects.id = study_participants.project_id 
  AND projects.user_id = auth.uid()
));

CREATE POLICY "Users can delete their own study participants"
ON public.study_participants
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.projects 
  WHERE projects.id = study_participants.project_id 
  AND projects.user_id = auth.uid()
));

-- Create study_sessions table for individual interview sessions
CREATE TABLE public.study_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL,
  participant_id uuid REFERENCES public.study_participants(id) ON DELETE CASCADE,
  session_token text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled')),
  scheduled_at timestamp with time zone,
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on study_sessions
ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;

-- Create policies for study_sessions
CREATE POLICY "Users can view their own study sessions"
ON public.study_sessions
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.projects 
  WHERE projects.id = study_sessions.project_id 
  AND projects.user_id = auth.uid()
));

CREATE POLICY "Users can create sessions for their own projects"
ON public.study_sessions
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.projects 
  WHERE projects.id = study_sessions.project_id 
  AND projects.user_id = auth.uid()
));

CREATE POLICY "Users can update their own study sessions"
ON public.study_sessions
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.projects 
  WHERE projects.id = study_sessions.project_id 
  AND projects.user_id = auth.uid()
));

-- Create public access policy for participants to view their own sessions
CREATE POLICY "Participants can view their own sessions"
ON public.study_sessions
FOR SELECT
USING (auth.uid() IS NULL AND participant_id IN (
  SELECT id FROM public.study_participants 
  WHERE invitation_token = session_token
));

-- Create indexes for better performance
CREATE INDEX idx_study_participants_project_id ON public.study_participants(project_id);
CREATE INDEX idx_study_participants_invitation_token ON public.study_participants(invitation_token);
CREATE INDEX idx_study_participants_status ON public.study_participants(status);
CREATE INDEX idx_study_sessions_project_id ON public.study_sessions(project_id);
CREATE INDEX idx_study_sessions_participant_id ON public.study_sessions(participant_id);
CREATE INDEX idx_study_sessions_session_token ON public.study_sessions(session_token);

-- Create trigger for updated_at timestamps
CREATE TRIGGER update_study_participants_updated_at
  BEFORE UPDATE ON public.study_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_study_sessions_updated_at
  BEFORE UPDATE ON public.study_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();