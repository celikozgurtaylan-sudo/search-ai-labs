-- Create interview questions table to store structured questions from discussion guides
CREATE TABLE public.interview_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  session_id UUID,
  question_text TEXT NOT NULL,
  question_order INTEGER NOT NULL,
  section VARCHAR(100),
  question_type VARCHAR(50) DEFAULT 'open_ended',
  is_follow_up BOOLEAN DEFAULT false,
  parent_question_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create interview responses table to store participant answers
CREATE TABLE public.interview_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL,
  question_id UUID NOT NULL,
  participant_id UUID,
  response_text TEXT,
  transcription TEXT,
  audio_duration_ms INTEGER,
  confidence_score DECIMAL(3,2),
  is_complete BOOLEAN DEFAULT false,
  analyzed BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.interview_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_responses ENABLE ROW LEVEL SECURITY;

-- Create policies for interview_questions
CREATE POLICY "Users can view questions for their projects" 
ON public.interview_questions 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.projects p 
  WHERE p.id = interview_questions.project_id 
  AND p.user_id = auth.uid()
));

CREATE POLICY "Users can create questions for their projects" 
ON public.interview_questions 
FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM public.projects p 
  WHERE p.id = interview_questions.project_id 
  AND p.user_id = auth.uid()
));

CREATE POLICY "Users can update questions for their projects" 
ON public.interview_questions 
FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM public.projects p 
  WHERE p.id = interview_questions.project_id 
  AND p.user_id = auth.uid()
));

-- Create policies for interview_responses
CREATE POLICY "Users can view responses for their projects" 
ON public.interview_responses 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.study_sessions ss
  JOIN public.projects p ON p.id = ss.project_id
  WHERE ss.id = interview_responses.session_id 
  AND p.user_id = auth.uid()
));

CREATE POLICY "Users can create responses for their sessions" 
ON public.interview_responses 
FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM public.study_sessions ss
  JOIN public.projects p ON p.id = ss.project_id
  WHERE ss.id = interview_responses.session_id 
  AND p.user_id = auth.uid()
));

CREATE POLICY "Users can update responses for their sessions" 
ON public.interview_responses 
FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM public.study_sessions ss
  JOIN public.projects p ON p.id = ss.project_id
  WHERE ss.id = interview_responses.session_id 
  AND p.user_id = auth.uid()
));

-- Add triggers for timestamps
CREATE TRIGGER update_interview_questions_updated_at
BEFORE UPDATE ON public.interview_questions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_interview_responses_updated_at
BEFORE UPDATE ON public.interview_responses
FOR EACH ROW  
EXECUTE FUNCTION public.update_updated_at_column();

-- Add indexes for performance
CREATE INDEX idx_interview_questions_project_session ON public.interview_questions(project_id, session_id);
CREATE INDEX idx_interview_questions_order ON public.interview_questions(question_order);
CREATE INDEX idx_interview_responses_session ON public.interview_responses(session_id);
CREATE INDEX idx_interview_responses_question ON public.interview_responses(question_id);