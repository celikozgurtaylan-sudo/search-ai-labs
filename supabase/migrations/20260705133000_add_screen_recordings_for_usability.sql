INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'interview-screen-recordings',
  'interview-screen-recordings',
  false,
  524288000,
  ARRAY['video/webm', 'video/mp4']
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.study_sessions
ADD COLUMN IF NOT EXISTS screen_recording_url text,
ADD COLUMN IF NOT EXISTS screen_recording_mime_type text,
ADD COLUMN IF NOT EXISTS screen_recording_duration_ms integer,
ADD COLUMN IF NOT EXISTS screen_recording_metadata jsonb;

DROP POLICY IF EXISTS "Project owners can upload screen recordings" ON storage.objects;
DROP POLICY IF EXISTS "Project owners can view screen recordings" ON storage.objects;
DROP POLICY IF EXISTS "Project owners can update screen recordings" ON storage.objects;
DROP POLICY IF EXISTS "Project owners can delete screen recordings" ON storage.objects;

CREATE POLICY "Project owners can upload screen recordings"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'interview-screen-recordings'
  AND EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = ((storage.foldername(name))[1])::uuid
    AND projects.user_id = auth.uid()
  )
);

CREATE POLICY "Project owners can view screen recordings"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'interview-screen-recordings'
  AND EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = ((storage.foldername(name))[1])::uuid
    AND projects.user_id = auth.uid()
  )
);

CREATE POLICY "Project owners can update screen recordings"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'interview-screen-recordings'
  AND EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = ((storage.foldername(name))[1])::uuid
    AND projects.user_id = auth.uid()
  )
);

CREATE POLICY "Project owners can delete screen recordings"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'interview-screen-recordings'
  AND EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = ((storage.foldername(name))[1])::uuid
    AND projects.user_id = auth.uid()
  )
);
