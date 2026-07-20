-- Figma OAuth connections + imported prototype frame storage.
-- Tokens are server-only: RLS is enabled with NO policies, so only the service
-- role (edge functions) can read/write them — they are never exposed to clients.

CREATE TABLE IF NOT EXISTS public.figma_connections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamptz,
  figma_user_id text,
  scope text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.figma_connections ENABLE ROW LEVEL SECURITY;

-- Short-lived CSRF state for the OAuth authorization-code round trip.
CREATE TABLE IF NOT EXISTS public.figma_oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  return_origin text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.figma_oauth_states ENABLE ROW LEVEL SECURITY;

-- Public bucket for imported prototype frame PNGs. Anonymous participants must
-- load these directly, so the bucket is public; paths use unguessable UUIDs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'prototype-frames',
  'prototype-frames',
  true,
  26214400,
  ARRAY['image/png', 'image/jpeg']
)
ON CONFLICT (id) DO UPDATE
SET
  public = true,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
