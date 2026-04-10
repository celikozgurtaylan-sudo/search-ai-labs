ALTER TABLE public.interview_questions
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
