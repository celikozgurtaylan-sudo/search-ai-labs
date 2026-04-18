-- Storage policies for interview-videos bucket (project-owner-only, matching interview_questions pattern)

-- Only project owners can upload videos
CREATE POLICY "Project owners can upload interview videos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'interview-videos'
  AND EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = ((storage.foldername(name))[1])::uuid
    AND projects.user_id = auth.uid()
  )
);

-- Only project owners can view videos
CREATE POLICY "Project owners can view interview videos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'interview-videos'
  AND EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = ((storage.foldername(name))[1])::uuid
    AND projects.user_id = auth.uid()
  )
);

-- Only project owners can update videos
CREATE POLICY "Project owners can update interview videos"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'interview-videos'
  AND EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = ((storage.foldername(name))[1])::uuid
    AND projects.user_id = auth.uid()
  )
);

-- Only project owners can delete videos
CREATE POLICY "Project owners can delete interview videos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'interview-videos'
  AND EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = ((storage.foldername(name))[1])::uuid
    AND projects.user_id = auth.uid()
  )
);