-- Fix design-screens bucket: make it private
UPDATE storage.buckets SET public = false WHERE id = 'design-screens';

-- Drop the public policy
DROP POLICY IF EXISTS "Public can view design screens" ON storage.objects;

-- Add owner-scoped policy for authenticated users
CREATE POLICY "Owners can view design screens"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'design-screens'
  AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Owners can upload design screens"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'design-screens'
  AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Owners can delete design screens"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'design-screens'
  AND (storage.foldername(name))[1] = auth.uid()::text);

-- Fix function search path mutable
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;
