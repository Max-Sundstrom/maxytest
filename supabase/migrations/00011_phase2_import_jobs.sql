-- =============================================================================
-- Maxytest Phase 2 / Plan 02-02 / Task 3
-- prototype_imports job table + idempotency key + RLS
-- =============================================================================
--
-- Tracks Figma-import jobs (Plan 02-03's figma-import-worker Edge Function).
-- Modeled after `block_changes` (00001_init.sql lines 236-269) — same
-- idempotency-keyed audit row pattern. The UNIQUE constraint on
-- (study_id, idempotency_key) dedupes re-clicked "Import" buttons (UUIDv7).
--
-- Lifecycle (status enum):
--   pending     — row inserted by the designer's auth client; worker will
--                  pick it up
--   fetching    — worker is calling Figma REST API (/files, /images)
--   rendering   — Figma is rendering PNG URLs (worker polling)
--   uploading   — worker is streaming PNGs to storage.objects
--   done        — terminal, success; prototype_version_id is set
--   failed      — terminal, hard failure; error_code/error_message populated
--   partial     — terminal, soft failure; some frames rendered, others did not
--
-- The designer-side FigmaImportDialog (Plan 02-04) subscribes via Supabase
-- Realtime to this row for streaming progress updates (frames_total /
-- frames_done). RLS: designer reads/inserts; only service-role (Edge Function)
-- UPDATEs.
--
-- =============================================================================

CREATE TABLE public.prototype_imports (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  study_id             uuid NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  actor_id             uuid REFERENCES public.users(id) ON DELETE SET NULL,
  idempotency_key      uuid NOT NULL,                          -- UUIDv7 from client (re-click dedupe)
  figma_file_key       text NOT NULL,
  status               text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','fetching','rendering','uploading','done','failed','partial')),
  frames_total         integer NOT NULL DEFAULT 0,
  frames_done          integer NOT NULL DEFAULT 0,
  prototype_version_id uuid REFERENCES public.prototype_versions(id) ON DELETE SET NULL,
  warnings             jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_code           text,
  error_message        text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (study_id, idempotency_key)
);

CREATE INDEX prototype_imports_study ON public.prototype_imports(study_id);

-- Partial index — only active jobs need fast status lookup.
CREATE INDEX prototype_imports_status
  ON public.prototype_imports(status)
  WHERE status IN ('pending','fetching','rendering','uploading');

ALTER TABLE public.prototype_imports ENABLE ROW LEVEL SECURITY;

-- Designer (any workspace role) can SELECT own-workspace import rows so the
-- FigmaImportDialog can poll/subscribe to progress.
CREATE POLICY prototype_imports_designer_read ON public.prototype_imports
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.studies s
      WHERE s.id = prototype_imports.study_id
        AND public.current_workspace_role(s.workspace_id) IS NOT NULL
    )
  );

-- Designer (owner|editor) can INSERT a new import row. The Edge Function
-- (service-role) UPDATEs progress fields; no designer UPDATE policy exists.
CREATE POLICY prototype_imports_designer_insert ON public.prototype_imports
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.studies s
      WHERE s.id = prototype_imports.study_id
        AND public.current_workspace_role(s.workspace_id) IN ('owner','editor')
    )
  );

-- NO designer UPDATE policy — only the import worker (service-role) mutates
-- status/frames_done. NO DELETE policy — job rows are audit trail.

-- Updated_at trigger (reuse Phase 1 helper from 00001_init.sql).
CREATE TRIGGER prototype_imports_updated_at
  BEFORE UPDATE ON public.prototype_imports
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.prototype_imports IS
  'Tracks Figma import jobs. UNIQUE(study_id, idempotency_key) dedupes re-clicked Import buttons (UUIDv7 pattern from Phase 1). Status enum drives Realtime progress UX in FigmaImportDialog.';
