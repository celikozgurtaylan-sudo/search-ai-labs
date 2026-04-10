-- Add missing columns to interview_responses table
ALTER TABLE public.interview_responses 
ADD COLUMN IF NOT EXISTS is_complete boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS audio_duration_ms integer,
ADD COLUMN IF NOT EXISTS confidence_score numeric;