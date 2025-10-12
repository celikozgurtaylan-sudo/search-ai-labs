-- Create storage bucket for interview videos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('interview-videos', 'interview-videos', false, 524288000, ARRAY['video/webm', 'video/mp4']);

-- Add RLS policies for video bucket
CREATE POLICY "Users can upload videos for their sessions"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'interview-videos' 
  AND (storage.foldername(name))[1] IN (
    SELECT ss.id::text FROM study_sessions ss
    JOIN projects p ON p.id = ss.project_id
    WHERE p.user_id = auth.uid()
  )
);

CREATE POLICY "Users can view videos for their sessions"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'interview-videos'
  AND (storage.foldername(name))[1] IN (
    SELECT ss.id::text FROM study_sessions ss
    JOIN projects p ON p.id = ss.project_id
    WHERE p.user_id = auth.uid()
  )
);

-- Add video URL and duration columns to interview_responses
ALTER TABLE interview_responses 
ADD COLUMN IF NOT EXISTS video_url TEXT;

ALTER TABLE interview_responses 
ADD COLUMN IF NOT EXISTS video_duration_ms INTEGER;