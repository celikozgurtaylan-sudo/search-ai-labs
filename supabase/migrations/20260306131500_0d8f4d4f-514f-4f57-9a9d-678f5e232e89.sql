-- Create/update storage bucket for pasted design screens
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'design-screens',
  'design-screens',
  true,
  20971520,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- RLS policies for design screen uploads (user-scoped by first folder = auth.uid())
DROP POLICY IF EXISTS "Users can upload design screens" ON storage.objects;
CREATE POLICY "Users can upload design screens"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'design-screens'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can update design screens" ON storage.objects;
CREATE POLICY "Users can update design screens"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'design-screens'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'design-screens'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can delete design screens" ON storage.objects;
CREATE POLICY "Users can delete design screens"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'design-screens'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Public can view design screens" ON storage.objects;
CREATE POLICY "Public can view design screens"
ON storage.objects FOR SELECT
USING (bucket_id = 'design-screens');
