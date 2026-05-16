-- =============================================================================
-- Maxytest Phase 2 / Plan 02-02 / Task 2
-- PRIVATE prototype-renders Storage bucket + UUID-guarded RLS (B-04, W-09)
-- =============================================================================
--
-- Migration 00010 — Phase 2 Storage bucket for prototype PNG renders.
-- Bucket is PRIVATE (public = false). Reads require signed URLs minted by the
-- runner (anon JWT) or the designer (auth JWT) per B-04 orchestrator decision
-- (RESEARCH.md Open Q1 RESOLVED — private + 24h signed URLs).
-- Source: supabase.com/docs/guides/storage/security/access-control (RLS on storage.objects).
--
-- Path scheme (CONTEXT.md "Storage path naming" discretion):
--   prototype-renders/{workspace_id}/{prototype_version_id}/{frame_id}-{content_hash}.png
--
-- The first folder segment is ALWAYS a workspace UUID. Both RLS policies on
-- storage.objects guard the ::uuid cast behind a regex check (W-09 fix):
-- casting (storage.foldername(name))[1]::uuid only runs when the segment
-- matches the canonical UUID regex; non-UUID first-folder values fall through
-- to `false` without raising "invalid input syntax for type uuid".
--
-- Security boundary order:
--   1. Bucket privacy (public = false) — primary boundary. Even if the
--      runner-read policy below grants SELECT, direct path fetches without
--      a signed URL are denied at the storage HTTP layer.
--   2. RLS policies — govern whether createSignedUrl succeeds.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Bucket — PRIVATE, image/png only, 5 MiB cap
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'prototype-renders', 'prototype-renders', false, -- PRIVATE — B-04
    5242880,                                         -- 5 MiB cap per file (well above 250 KB @2x target)
    ARRAY['image/png']
  )
  ON CONFLICT (id) DO UPDATE
    SET public             = EXCLUDED.public,
        file_size_limit    = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;
-- ON CONFLICT DO UPDATE handles the migration-rerun case where an earlier
-- draft created the bucket as public.

COMMENT ON TABLE storage.buckets IS
  'storage.buckets — prototype-renders is PRIVATE; reads go through signed URLs (createSignedUrls 24h).';


-- -----------------------------------------------------------------------------
-- 2. Designer-upload policy — WITH CHECK on workspace folder
-- -----------------------------------------------------------------------------
-- W-09: the UUID cast is regex-guarded. Non-UUID first-folder values
-- short-circuit to `false` rather than raising "invalid input syntax for type
-- uuid".
CREATE POLICY prototype_renders_designer_upload ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'prototype-renders'
    AND (
      CASE
        WHEN (storage.foldername(name))[1]
             ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        THEN public.current_workspace_role(((storage.foldername(name))[1])::uuid) IN ('owner','editor')
        ELSE false
      END
    )
  );


-- -----------------------------------------------------------------------------
-- 3. Read policy (designer + runner-anon) — so createSignedUrl succeeds
-- -----------------------------------------------------------------------------
-- Two ways to get SELECT on a path:
--   (a) caller is a member of the path's workspace (designer report),
--   (b) the workspace has at least one published/archived study (runner anon).
-- Both branches sit inside the CASE that regex-guards the UUID cast (W-09).
CREATE POLICY prototype_renders_runner_read ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'prototype-renders'
    AND (
      CASE
        WHEN (storage.foldername(name))[1]
             ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        THEN
          -- Designer of this workspace can SELECT (so report signed-URL mint works):
          public.current_workspace_role(((storage.foldername(name))[1])::uuid) IS NOT NULL
          -- OR — any caller can SELECT a path whose workspace has at least one
          -- published/archived study (so the runner anon JWT can mint signed URLs
          -- without being a workspace member):
          OR EXISTS (
            SELECT 1 FROM public.studies s
            WHERE s.workspace_id = ((storage.foldername(name))[1])::uuid
              AND s.status IN ('published','archived')
          )
        ELSE false
      END
    )
  );

-- NO UPDATE policy. NO DELETE policy. Renders are immutable once written —
-- re-imports go to a NEW prototype_version_id folder under the same workspace.
-- The import worker (Edge Function, service-role) bypasses RLS for any
-- housekeeping operations.
