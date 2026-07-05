-- Private pitch-shifted audio evidence replaces persisted participant video.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'interview-audio',
  'interview-audio',
  false,
  104857600,
  ARRAY['audio/wav', 'audio/wave', 'audio/x-wav', 'audio/webm']
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.interview_responses
ADD COLUMN IF NOT EXISTS audio_url text,
ADD COLUMN IF NOT EXISTS audio_mime_type text,
ADD COLUMN IF NOT EXISTS audio_privacy_transform jsonb,
ADD COLUMN IF NOT EXISTS transcript_segments jsonb;

DROP POLICY IF EXISTS "Project owners can upload interview audio" ON storage.objects;
DROP POLICY IF EXISTS "Project owners can view interview audio" ON storage.objects;
DROP POLICY IF EXISTS "Project owners can update interview audio" ON storage.objects;
DROP POLICY IF EXISTS "Project owners can delete interview audio" ON storage.objects;

CREATE POLICY "Project owners can upload interview audio"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'interview-audio'
  AND EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = ((storage.foldername(name))[1])::uuid
    AND projects.user_id = auth.uid()
  )
);

CREATE POLICY "Project owners can view interview audio"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'interview-audio'
  AND EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = ((storage.foldername(name))[1])::uuid
    AND projects.user_id = auth.uid()
  )
);

CREATE POLICY "Project owners can update interview audio"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'interview-audio'
  AND EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = ((storage.foldername(name))[1])::uuid
    AND projects.user_id = auth.uid()
  )
);

CREATE POLICY "Project owners can delete interview audio"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'interview-audio'
  AND EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = ((storage.foldername(name))[1])::uuid
    AND projects.user_id = auth.uid()
  )
);

-- Best-effort metadata purge for existing stored videos. The Edge Function purge routine
-- also removes objects via the Storage API when run by the project owner.
DELETE FROM storage.objects
WHERE bucket_id = 'interview-videos'
AND name IN (
  SELECT video_url
  FROM public.interview_responses
  WHERE video_url IS NOT NULL
);

UPDATE public.interview_responses
SET
  video_url = null,
  video_duration_ms = null,
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'videoPurgedAt', now(),
    'videoPurgeReason', 'kvkk_video_disabled'
  )
WHERE video_url IS NOT NULL OR video_duration_ms IS NOT NULL;
