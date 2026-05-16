// =============================================================================
// figma-import-worker — Supabase Edge Function (Deno)
// =============================================================================
//
// Plan: 02-flagship-prototype-block-heatmap / 02-03 / Task 1
//
// What this does
//   Accepts POST { share_link, pat, study_id, idempotency_key } from the
//   designer's auth client, fetches the Figma file via REST, renders each
//   frame to PNG (@1x + @2x), uploads to the PRIVATE `prototype-renders`
//   bucket at the FINAL `{ws}/{prototype_version_id}/{frame_id}-{hash}@{N}x.png`
//   path (B-05), and writes immutable rows into prototype_versions / frames /
//   hotspots. Broadcasts progress via Supabase Realtime channel
//   `imports:{import_id}` for the FigmaImportDialog (Plan 02-04).
//
// Security model
//   - Caller authenticates with their designer JWT (auth client). The JWT's
//     `sub` claim is verified against `memberships.role` ∈ ('owner','editor')
//     for the target study's workspace BEFORE the import is accepted (W-08
//     defense-in-depth — RLS would block the INSERT anyway, but we reject 403
//     early so the dialog gets a precise error).
//   - The PAT (`figd_...`) is read from the request body, sent to Figma via
//     `X-Figma-Token` header, then drops out of scope at function return.
//     NEVER logged, never written to DB, never persisted in any storage.
//     V7 logging requirement — `console.log` calls in this file MUST NOT
//     include `pat` or `req.body`.
//   - Service-role key is used to bypass RLS for writes (designers may not
//     have direct INSERT on prototype_versions for the importing status case,
//     and we control all writes here).
//
// B-05 ordering (the load-bearing invariant)
//   1. Generate prototypeVersionId via crypto.randomUUID().
//   2. INSERT prototype_versions { id, status: 'importing', figma_node_tree: NULL }.
//   3. Upload PNGs at the FINAL path `{ws}/{prototypeVersionId}/...`.
//   4. UPDATE prototype_versions SET figma_node_tree, status='complete'.
//   5. INSERT frames + hotspots rows whose render_path_* values match the
//      paths from step 3.
//   On error: status='failed' on both prototype_versions AND prototype_imports.
//   Runners NEVER see status='importing' because the runner-read RLS on
//   prototype_versions filters to status='complete' (00007 migration).
//
// 50-frame soft cap (D-05 + Pitfall 2)
//   Files with >50 frames are TRUNCATED to the first 50 (depth-first order),
//   and a `warnings` entry is appended. Final status becomes 'partial' instead
//   of 'done'. UI surfaces the limit to the designer.
//
// =============================================================================

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.105.4';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const FIGMA_API_BASE = Deno.env.get('FIGMA_API_BASE') ?? 'https://api.figma.com/v1';
const STORAGE_BUCKET = 'prototype-renders';
const FRAME_SOFT_CAP = 50;
const IMAGES_BATCH_SIZE = 25; // RESEARCH.md A2 — batch /v1/images ids to keep wall-clock safe
const SIZE_WARN_2X_BYTES = 250 * 1024; // Pitfall 3
const SIZE_WARN_1X_BYTES = 80 * 1024; // Pitfall 3
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const FIGMA_SHARE_LINK_RE =
  /https:\/\/[\w.-]+\.?figma\.com\/(proto|design|file)\/([0-9a-zA-Z]{22,128})(?:\/[^?]*)?(\?.*)?$/;

type TransitionKind = 'slide' | 'dissolve' | 'push' | 'smart_animate';

interface ImportRequest {
  share_link: string;
  pat: string;
  study_id: string;
  idempotency_key: string;
}

interface FigmaBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FigmaInteraction {
  trigger?: { type?: string };
  actions?: Array<{
    type?: string;
    destinationId?: string | null;
    transition?: { type?: string } | null;
  }>;
}

export interface FigmaNode {
  id: string;
  name?: string;
  type?: string;
  absoluteBoundingBox?: FigmaBoundingBox | null;
  children?: FigmaNode[];
  interactions?: FigmaInteraction[];
  prototypeInteractions?: FigmaInteraction[];
  transitionNodeID?: string | null;
  overlayPositionType?: string | null;
  isFixed?: boolean;
  isOverlay?: boolean;
  prototypeStartNodeID?: string | null;
}

export interface FigmaFileResponse {
  name?: string;
  lastModified?: string;
  document?: FigmaNode & { prototypeStartNodeID?: string | null };
}

interface FrameCatalog {
  id: string;
  name: string;
  width: number;
  height: number;
  position: number;
  bbox: FigmaBoundingBox;
  isOverlay: boolean;
  interactionsRaw: FigmaInteraction[];
  // Map of interaction → { hotspotNodeId, hotspotBBox } (for child-level hotspots
  // inside the frame). For Phase 2 v1 we keep this simple: each frame surfaces
  // its own interactions array (frame-level transitions). Child-level hotspots
  // are walked separately via walkInteractiveChildren below.
}

interface ChildHotspot {
  hotspotId: string;
  frameNodeId: string; // parent frame Figma id
  frameDbId: string; // resolved at insert time
  bbox: { x: number; y: number; w: number; h: number }; // normalized [0,1]
  targetFrameId: string | null;
  transitionKind: TransitionKind;
  zIndex: number;
  sourceLayer: string | null;
  figmaRaw: FigmaInteraction[];
}

// -----------------------------------------------------------------------------
// Pure helpers
// -----------------------------------------------------------------------------

/** Parse the JWT `sub` claim without verifying the signature. Supabase already
 *  verified the JWT before invoking the function (the platform rejects requests
 *  with bad signatures), so we only need the claim payload. */
function parseJwtSub(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!m) return null;
  const token = m[1]!;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    // base64url → base64 + padding
    let payload = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
    while (payload.length % 4 !== 0) payload += '=';
    const decoded = atob(payload);
    const json = JSON.parse(decoded) as { sub?: string };
    return typeof json.sub === 'string' && json.sub.length > 0 ? json.sub : null;
  } catch {
    return null;
  }
}

/** Re-implementation of apps/web/src/lib/figma/parse-share-link.ts. Edge
 *  Functions cannot import from `apps/web/`; the regex literal is duplicated. */
function parseShareLinkServer(url: string): { file_key: string } | null {
  const match = FIGMA_SHARE_LINK_RE.exec(url);
  if (!match) return null;
  return { file_key: match[2]! };
}

/** SHA-256 hex over the first 16 chars (8 bytes) of the digest. */
async function sha256_16(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i]!.toString(16).padStart(2, '0');
  return hex.slice(0, 16);
}

/** Figma transition.type → our 4-value enum. Smart Animate falls back to
 *  dissolve at runtime (D-discretion: "Smart Animate is approximated, not
 *  reproduced"), but we store the original kind so the report can call it
 *  out honestly. */
function mapTransition(t?: { type?: string } | null): TransitionKind {
  const raw = (t?.type ?? '').toUpperCase();
  if (
    raw === 'SLIDE_FROM_LEFT' ||
    raw === 'SLIDE_FROM_RIGHT' ||
    raw === 'SLIDE_FROM_TOP' ||
    raw === 'SLIDE_FROM_BOTTOM' ||
    raw === 'SLIDE_IN' ||
    raw === 'SLIDE_OUT'
  )
    return 'slide';
  if (
    raw === 'PUSH_FROM_LEFT' ||
    raw === 'PUSH_FROM_RIGHT' ||
    raw === 'PUSH_FROM_TOP' ||
    raw === 'PUSH_FROM_BOTTOM' ||
    raw === 'PUSH'
  )
    return 'push';
  if (raw === 'SMART_ANIMATE') return 'smart_animate';
  return 'dissolve';
}

/** Depth-first walk over the document tree collecting FRAME nodes that sit
 *  directly under a CANVAS (top-level frames). Returns in DFS order — preserves
 *  the designer's page/section layout. */
export function collectFrames(doc: FigmaNode | undefined): FrameCatalog[] {
  const out: FrameCatalog[] = [];
  if (!doc) return out;
  let position = 0;

  function pushFrame(node: FigmaNode) {
    if (!node.absoluteBoundingBox) return;
    const bbox = node.absoluteBoundingBox;
    out.push({
      id: node.id,
      name: node.name ?? '(unnamed)',
      width: Math.max(1, Math.round(bbox.width)),
      height: Math.max(1, Math.round(bbox.height)),
      position: position++,
      bbox,
      isOverlay: Boolean(node.overlayPositionType) || node.isOverlay === true,
      interactionsRaw: (node.prototypeInteractions ??
        node.interactions ??
        []) as FigmaInteraction[],
    });
  }

  // Document → pages (CANVAS) → frames.
  for (const page of doc.children ?? []) {
    if (page.type === 'CANVAS') {
      for (const top of page.children ?? []) {
        if (top.type === 'FRAME' || top.type === 'COMPONENT' || top.type === 'COMPONENT_SET') {
          pushFrame(top);
        }
      }
    } else if (page.type === 'FRAME') {
      pushFrame(page);
    }
  }
  return out;
}

/** Walk a frame subtree collecting interactive descendants (nodes with
 *  `interactions` / `prototypeInteractions`). Each becomes a hotspot row. */
function collectChildHotspotsForFrame(
  frame: FrameCatalog,
  frameNode: FigmaNode | undefined,
): ChildHotspot[] {
  const result: ChildHotspot[] = [];
  if (!frameNode) return result;
  const parentBox = frame.bbox;

  function recurse(node: FigmaNode) {
    const ix = (node.prototypeInteractions ?? node.interactions ?? []) as FigmaInteraction[];
    const hasInteractions = ix.length > 0;
    if (hasInteractions && node.absoluteBoundingBox && node.id !== frame.id) {
      const bb = node.absoluteBoundingBox;
      const bboxX = Math.min(1, Math.max(0, (bb.x - parentBox.x) / parentBox.width));
      const bboxY = Math.min(1, Math.max(0, (bb.y - parentBox.y) / parentBox.height));
      const bboxW = Math.min(1 - bboxX, Math.max(0.0001, bb.width / parentBox.width));
      const bboxH = Math.min(1 - bboxY, Math.max(0.0001, bb.height / parentBox.height));
      const action = ix[0]?.actions?.[0] ?? null;
      const targetFrameId = action?.destinationId ?? null;
      const transitionKind = mapTransition(action?.transition);
      result.push({
        hotspotId: node.id,
        frameNodeId: frame.id,
        frameDbId: '', // resolved when inserting
        bbox: { x: bboxX, y: bboxY, w: bboxW, h: bboxH },
        targetFrameId,
        transitionKind,
        zIndex: frame.isOverlay ? 100 : 0,
        sourceLayer: node.type ?? null,
        figmaRaw: ix,
      });
    }
    for (const child of node.children ?? []) recurse(child);
  }
  recurse(frameNode);
  return result;
}

/** Find a node anywhere in the doc tree by id. O(N) over node count — fine
 *  for v1's 50-frame soft cap. */
function findNodeById(doc: FigmaNode | undefined, id: string): FigmaNode | undefined {
  if (!doc) return undefined;
  if (doc.id === id) return doc;
  for (const c of doc.children ?? []) {
    const f = findNodeById(c, id);
    if (f) return f;
  }
  return undefined;
}

// -----------------------------------------------------------------------------
// figma_node_tree trim — D-01a (Phase 02.1 / Plan 01 / Task 1)
// -----------------------------------------------------------------------------
//
// The /v1/files response shipped to `prototype_versions.figma_node_tree` used
// to be the verbatim Figma document — hundreds of MB of paint/effect/styles
// for files with library components. This trim drops everything downstream
// consumers don't read. The re-import remap pass reads ONLY frame ids,
// interactions, and bounding boxes; the runner reads PNG renders, not the
// tree. See `.planning/phases/02.1-.../02.1-CONTEXT.md` decision D-01a for
// the authoritative spec.
//
// IMPORTANT: this is an ALLOWLIST. New Figma API fields are dropped by default
// until someone reviews them and decides they're worth keeping. That is the
// load-bearing security property — `trimFigmaTree` cannot leak fields it
// doesn't explicitly know about.
//
// The "keep" list (mirrored in the schema below as `KEEP_KEYS`):
//   - id, name, type
//   - absoluteBoundingBox (full bbox preserved — hotspot remap math)
//   - prototypeInteractions, interactions (re-import remap reads these)
//   - transitionNodeID, overlayPositionType, isOverlay (navigation metadata)
//   - prototypeStartNodeID (document-root field for the starting frame)
//   - children (recursively trimmed)
// -----------------------------------------------------------------------------

/** The set of node keys that survive `trimFigmaTree`. Anything not on this
 *  list is dropped. */
const TRIM_KEEP_KEYS: ReadonlyArray<keyof FigmaNode> = [
  'id',
  'name',
  'type',
  'absoluteBoundingBox',
  'prototypeInteractions',
  'interactions',
  'transitionNodeID',
  'overlayPositionType',
  'isOverlay',
  'prototypeStartNodeID',
];

/**
 * Recursively walk a Figma node tree and return a NEW object containing only
 * the allowlisted keys plus a recursively-trimmed `children` array.
 *
 * Defensive contract:
 *   - `undefined` input → `null` output (matches the "no document" code path).
 *   - Does NOT mutate the input.
 *   - Idempotent: `trimFigmaTree(trimFigmaTree(x))` deep-equals `trimFigmaTree(x)`.
 *
 * Re-import remap depends on `prototypeInteractions` surviving verbatim, so
 * the array is preserved by reference (interaction items are not deep-copied
 * field-by-field — the array itself is kept as-is, which is what the remap
 * read pass expects).
 */
export function trimFigmaTree(node: FigmaNode | undefined): FigmaNode | null {
  if (!node) return null;
  const src = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of TRIM_KEEP_KEYS) {
    if (src[key] !== undefined) {
      out[key] = src[key];
    }
  }
  // Recurse into children — drop nulls (children that returned null because
  // they were themselves undefined; doesn't happen in practice but is the
  // type-safe filter).
  if (Array.isArray(node.children)) {
    out.children = node.children
      .map((c) => trimFigmaTree(c))
      .filter((n): n is FigmaNode => n !== null);
  }
  return out as FigmaNode;
}

/**
 * Trim a Figma /v1/files response down to ONLY the three top-level fields
 * downstream code reads — `name`, `lastModified`, and a trimmed `document`.
 *
 * Explicitly drops the top-level `components`, `componentSets`, `styles`,
 * `schemaVersion`, `version`, `mainFileKey`, `branches`, `thumbnailUrl`, and
 * any other sibling fields. These can be tens of MB for files with library
 * components and are NEVER read by either the runner or the re-import remap.
 *
 * The result is what gets persisted to `prototype_versions.figma_node_tree`.
 */
export function trimFigmaDocument(file: FigmaFileResponse): {
  name?: string;
  lastModified?: string;
  document: FigmaNode | null;
} {
  const trimmedDoc = trimFigmaTree(file.document);
  const out: { name?: string; lastModified?: string; document: FigmaNode | null } = {
    document: trimmedDoc,
  };
  if (typeof file.name === 'string') out.name = file.name;
  if (typeof file.lastModified === 'string') out.lastModified = file.lastModified;
  return out;
}

// -----------------------------------------------------------------------------
// HTTP response helpers
// -----------------------------------------------------------------------------

const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-max-age': '86400',
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  });
}

// -----------------------------------------------------------------------------
// Main entrypoint
// -----------------------------------------------------------------------------

/**
 * Main HTTP handler. Exported so unit tests can import this module without
 * triggering `Deno.serve` (which would try to bind a port and crash the test
 * runner under `--allow-env --no-check`). The Supabase Edge Runtime invokes
 * the module as the entrypoint, so `import.meta.main === true` there and we
 * call `Deno.serve` at the bottom of the file.
 */
export async function handler(req: Request): Promise<Response> {
  // CORS preflight — browsers send OPTIONS before any POST from a different origin.
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  // 1. Env --------------------------------------------------------------------
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('figma-import-worker: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return jsonResponse({ error: 'configuration_missing' }, 500);
  }

  // 2. Parse + validate body -------------------------------------------------
  let body: ImportRequest;
  try {
    const raw = (await req.json()) as Partial<ImportRequest>;
    const missing: string[] = [];
    if (typeof raw.share_link !== 'string' || raw.share_link.length === 0)
      missing.push('share_link');
    if (typeof raw.pat !== 'string' || raw.pat.length === 0) missing.push('pat');
    if (typeof raw.study_id !== 'string' || !UUID_REGEX.test(raw.study_id))
      missing.push('study_id');
    if (typeof raw.idempotency_key !== 'string' || !UUID_REGEX.test(raw.idempotency_key))
      missing.push('idempotency_key');
    if (missing.length > 0) {
      return jsonResponse({ error: 'bad_request', missing }, 400);
    }
    body = raw as ImportRequest;
  } catch {
    return jsonResponse({ error: 'bad_request', missing: ['<malformed json>'] }, 400);
  }

  // 3. Parse share link → file_key -------------------------------------------
  const parsed = parseShareLinkServer(body.share_link);
  if (!parsed) {
    return jsonResponse({ error: 'invalid_share_link' }, 400);
  }
  const fileKey = parsed.file_key;

  // 4. Service-role client ----------------------------------------------------
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 5. Resolve target study + workspace --------------------------------------
  const { data: study, error: studyErr } = await supabase
    .from('studies')
    .select('id, workspace_id')
    .eq('id', body.study_id)
    .maybeSingle();
  if (studyErr) {
    console.error('figma-import-worker: studies lookup failed', { code: studyErr.code });
    return jsonResponse({ error: 'study_lookup_failed' }, 500);
  }
  if (!study) {
    return jsonResponse({ error: 'study_not_found' }, 404);
  }
  const workspaceId = study.workspace_id;

  // 6. W-08: workspace-membership gate ---------------------------------------
  const callerSub = parseJwtSub(req.headers.get('authorization'));
  if (!callerSub) {
    return jsonResponse({ error: 'unauthenticated' }, 401);
  }
  const { data: member, error: memberErr } = await supabase
    .from('memberships')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', callerSub)
    .in('role', ['owner', 'editor'])
    .maybeSingle();
  if (memberErr) {
    console.error('figma-import-worker: membership lookup failed', { code: memberErr.code });
    return jsonResponse({ error: 'membership_lookup_failed' }, 500);
  }
  if (!member) {
    return jsonResponse({ error: 'workspace_membership_required' }, 403);
  }

  // 7. INSERT prototype_imports — idempotent ---------------------------------
  let importId: string;
  {
    const { data: insertedJob, error: insertErr } = await supabase
      .from('prototype_imports')
      .insert({
        study_id: body.study_id,
        actor_id: callerSub,
        idempotency_key: body.idempotency_key,
        figma_file_key: fileKey,
        status: 'pending',
        frames_total: 0,
        frames_done: 0,
      })
      .select('id')
      .single();

    if (insertErr) {
      // 23505 = UNIQUE (study_id, idempotency_key) — retry of same logical op
      if (insertErr.code === '23505') {
        const { data: existing, error: selectErr } = await supabase
          .from('prototype_imports')
          .select('id')
          .eq('study_id', body.study_id)
          .eq('idempotency_key', body.idempotency_key)
          .single();
        if (selectErr || !existing) {
          console.error('figma-import-worker: idempotent SELECT failed', {
            code: selectErr?.code,
          });
          return jsonResponse({ error: 'import_insert_failed' }, 500);
        }
        importId = existing.id;
        console.log('figma-import-worker idempotent retry', { importId, fileKey });
        return jsonResponse({ import_id: importId }, 202);
      }
      console.error('figma-import-worker: import INSERT failed', { code: insertErr.code });
      return jsonResponse({ error: 'import_insert_failed' }, 500);
    }
    importId = insertedJob!.id;
  }

  console.log('figma-import-worker accepted', { importId, fileKey, workspaceId });

  // 8. Background processing -------------------------------------------------
  const work = processImport(supabase, {
    importId,
    fileKey,
    pat: body.pat,
    studyId: body.study_id,
    workspaceId,
  });

  // `EdgeRuntime` is the Supabase Deno runtime's background-task hook. When
  // it's present, we return 202 immediately and let the work continue. When
  // it's not (e.g. local Deno tests), we await synchronously so callers see
  // the final state on completion.
  const er = (
    globalThis as unknown as {
      EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void };
    }
  ).EdgeRuntime;
  if (er && typeof er.waitUntil === 'function') {
    er.waitUntil(work.catch((e) => console.error('figma-import-worker: background error', e)));
  } else {
    // Fallback: await synchronously. This may hit the 150s wall-clock budget
    // for large files, but it's the right behaviour for local-dev / tests
    // where there is no background task runtime.
    try {
      await work;
    } catch (e) {
      console.error('figma-import-worker: sync error', e);
    }
  }

  return jsonResponse({ import_id: importId }, 202);
}

// Only bind the network socket when this module is the entrypoint (i.e. when
// the Supabase Edge Runtime invokes it). Unit tests that import this module
// for the pure helpers will leave `import.meta.main` false and skip serving.
if (import.meta.main) {
  Deno.serve(handler);
}

// -----------------------------------------------------------------------------
// processImport — the heavy lifting (B-05 ordering)
// -----------------------------------------------------------------------------

interface ProcessArgs {
  importId: string;
  fileKey: string;
  pat: string;
  studyId: string;
  workspaceId: string;
}

async function processImport(supabase: SupabaseClient, args: ProcessArgs): Promise<void> {
  const { importId, fileKey, pat, studyId, workspaceId } = args;
  const channel = supabase.channel('imports:' + importId);
  await channel.subscribe();

  async function failJob(code: string, message: string): Promise<void> {
    await supabase
      .from('prototype_imports')
      .update({ status: 'failed', error_code: code, error_message: message })
      .eq('id', importId);
    await channel.send({
      type: 'broadcast',
      event: 'progress',
      payload: { status: 'failed', error_code: code },
    });
    try {
      await channel.unsubscribe();
    } catch {
      /* noop */
    }
  }

  try {
    // a. status='fetching' ---------------------------------------------------
    await supabase.from('prototype_imports').update({ status: 'fetching' }).eq('id', importId);
    await channel.send({
      type: 'broadcast',
      event: 'progress',
      payload: { status: 'fetching' },
    });

    // b. /v1/files -----------------------------------------------------------
    const fileRes = await fetch(`${FIGMA_API_BASE}/files/${fileKey}`, {
      headers: { 'X-Figma-Token': pat },
    });
    if (!fileRes.ok) {
      const code =
        fileRes.status === 401 || fileRes.status === 403
          ? 'figma_unauthorized'
          : fileRes.status === 404
            ? 'figma_not_found'
            : 'figma_error';
      await failJob(code, `Figma /v1/files returned ${fileRes.status}`);
      return;
    }
    const figmaFile = (await fileRes.json()) as FigmaFileResponse;

    // c. Walk frames ---------------------------------------------------------
    let frames = collectFrames(figmaFile.document);
    if (frames.length === 0) {
      await failJob('figma_no_frames', 'No frames found in document');
      return;
    }

    // d. Soft cap @ 50 -------------------------------------------------------
    const warnings: Array<Record<string, unknown>> = [];
    const totalFrames = frames.length;
    if (frames.length > FRAME_SOFT_CAP) {
      frames = frames.slice(0, FRAME_SOFT_CAP);
      warnings.push({
        code: 'frames_exceeded_soft_cap',
        total: totalFrames,
        imported: FRAME_SOFT_CAP,
        message: `Maxytest v1 imports up to ${FRAME_SOFT_CAP} frames; later frames were skipped.`,
      });
    }

    // e. Reserve prototype_versions row (B-05) -------------------------------
    const prototypeVersionId = crypto.randomUUID();
    {
      const { error: pvInsertErr } = await supabase.from('prototype_versions').insert({
        id: prototypeVersionId,
        study_id: studyId,
        figma_file_key: fileKey,
        figma_file_name: figmaFile.name ?? null,
        figma_source_last_modified: figmaFile.lastModified ?? null,
        figma_node_tree: null,
        starting_frame_id: figmaFile.document?.prototypeStartNodeID ?? null,
        status: 'importing',
      });
      if (pvInsertErr) {
        await failJob('prototype_version_reserve_failed', pvInsertErr.message);
        return;
      }
    }

    // f. status='rendering' --------------------------------------------------
    await supabase
      .from('prototype_imports')
      .update({
        status: 'rendering',
        frames_total: frames.length,
        prototype_version_id: prototypeVersionId,
      })
      .eq('id', importId);
    await channel.send({
      type: 'broadcast',
      event: 'progress',
      payload: {
        status: 'rendering',
        frames_total: frames.length,
        frames_done: 0,
        prototype_version_id: prototypeVersionId,
      },
    });

    // g. /v1/images batched, both @1x and @2x -------------------------------
    const imageUrls1x = new Map<string, string>();
    const imageUrls2x = new Map<string, string>();
    for (let i = 0; i < frames.length; i += IMAGES_BATCH_SIZE) {
      const batch = frames.slice(i, i + IMAGES_BATCH_SIZE);
      const idsParam = batch.map((f) => f.id).join(',');
      for (const scale of [1, 2] as const) {
        const url = `${FIGMA_API_BASE}/images/${fileKey}?ids=${encodeURIComponent(idsParam)}&format=png&scale=${scale}`;
        const imgRes = await fetch(url, { headers: { 'X-Figma-Token': pat } });
        if (!imgRes.ok) {
          await failJob('figma_images_failed', `Figma /v1/images returned ${imgRes.status}`);
          return;
        }
        const imgJson = (await imgRes.json()) as { images?: Record<string, string | null> };
        const sink = scale === 1 ? imageUrls1x : imageUrls2x;
        for (const [k, v] of Object.entries(imgJson.images ?? {})) {
          if (typeof v === 'string') sink.set(k, v);
        }
      }
    }

    // h. Download + hash + upload per frame ---------------------------------
    interface UploadedFrame {
      frame: FrameCatalog;
      path1x: string;
      path2x: string;
    }
    const uploaded: UploadedFrame[] = [];
    let framesDone = 0;

    for (const frame of frames) {
      const url1x = imageUrls1x.get(frame.id);
      const url2x = imageUrls2x.get(frame.id);
      if (!url1x || !url2x) {
        await failJob('figma_image_url_missing', `No image URL for frame ${frame.id}`);
        return;
      }

      // Pitfall 11 — S3 URLs expire ~30 min, so download IMMEDIATELY.
      const [buf1x, buf2x] = await Promise.all([
        fetch(url1x).then((r) => {
          if (!r.ok) throw new Error(`png download 1x ${r.status}`);
          return r.arrayBuffer();
        }),
        fetch(url2x).then((r) => {
          if (!r.ok) throw new Error(`png download 2x ${r.status}`);
          return r.arrayBuffer();
        }),
      ]);

      // Pitfall 3 — size warnings
      if (buf2x.byteLength > SIZE_WARN_2X_BYTES) {
        warnings.push({
          code: 'png_2x_oversize',
          frame_id: frame.id,
          bytes: buf2x.byteLength,
        });
      }
      if (buf1x.byteLength > SIZE_WARN_1X_BYTES) {
        warnings.push({
          code: 'png_1x_oversize',
          frame_id: frame.id,
          bytes: buf1x.byteLength,
        });
      }

      const hash1x = await sha256_16(buf1x);
      const hash2x = await sha256_16(buf2x);
      const path1x = `${workspaceId}/${prototypeVersionId}/${frame.id}-${hash1x}@1x.png`;
      const path2x = `${workspaceId}/${prototypeVersionId}/${frame.id}-${hash2x}@2x.png`;

      const up1x = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path1x, new Uint8Array(buf1x), {
          contentType: 'image/png',
          upsert: false,
        });
      if (up1x.error && !/already exists|duplicate/i.test(up1x.error.message)) {
        await failJob('storage_upload_failed', `1x upload: ${up1x.error.message}`);
        return;
      }
      const up2x = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path2x, new Uint8Array(buf2x), {
          contentType: 'image/png',
          upsert: false,
        });
      if (up2x.error && !/already exists|duplicate/i.test(up2x.error.message)) {
        await failJob('storage_upload_failed', `2x upload: ${up2x.error.message}`);
        return;
      }

      uploaded.push({ frame, path1x, path2x });
      framesDone += 1;

      await supabase
        .from('prototype_imports')
        .update({ frames_done: framesDone })
        .eq('id', importId);
      await channel.send({
        type: 'broadcast',
        event: 'progress',
        payload: {
          status: 'rendering',
          frames_total: frames.length,
          frames_done: framesDone,
          prototype_version_id: prototypeVersionId,
        },
      });
    }

    // i. INSERT frames + hotspots, then flip prototype_versions to complete -
    // (Sequential writes; we surface an explicit rollback on the first error
    // by marking the job + version as failed.)

    // i.1 INSERT frames
    const framesRows = uploaded.map((u) => ({
      prototype_version_id: prototypeVersionId,
      frame_id: u.frame.id,
      name: u.frame.name,
      width: u.frame.width,
      height: u.frame.height,
      render_path_1x: u.path1x,
      render_path_2x: u.path2x,
      position: u.frame.position,
    }));
    const { data: insertedFrames, error: framesErr } = await supabase
      .from('frames')
      .insert(framesRows)
      .select('id, frame_id');
    if (framesErr || !insertedFrames) {
      await supabase
        .from('prototype_versions')
        .update({ status: 'failed' })
        .eq('id', prototypeVersionId);
      await failJob('frames_insert_failed', framesErr?.message ?? 'no rows returned');
      return;
    }

    // i.2 Build frame_id → db_id map for hotspot inserts
    const frameDbIdByNodeId = new Map<string, string>();
    for (const row of insertedFrames) {
      frameDbIdByNodeId.set(row.frame_id, row.id);
    }

    // i.3 Collect hotspots — frame-level interactions + child interactions
    const hotspotRows: Array<{
      frame_id: string;
      prototype_version_id: string;
      hotspot_id: string;
      target_frame_id: string | null;
      transition_kind: TransitionKind;
      bbox_x: number;
      bbox_y: number;
      bbox_w: number;
      bbox_h: number;
      z_index: number;
      source_layer: string | null;
      figma_raw: FigmaInteraction[];
    }> = [];

    for (const u of uploaded) {
      const frameDbId = frameDbIdByNodeId.get(u.frame.id);
      if (!frameDbId) continue;
      const frameNode = findNodeById(figmaFile.document, u.frame.id);

      // Frame-level interactions (whole-frame tap targets).
      if (u.frame.interactionsRaw.length > 0) {
        const action = u.frame.interactionsRaw[0]?.actions?.[0] ?? null;
        hotspotRows.push({
          frame_id: frameDbId,
          prototype_version_id: prototypeVersionId,
          hotspot_id: u.frame.id,
          target_frame_id: action?.destinationId ?? null,
          transition_kind: mapTransition(action?.transition),
          bbox_x: 0,
          bbox_y: 0,
          bbox_w: 1,
          bbox_h: 1,
          z_index: u.frame.isOverlay ? 100 : 0,
          source_layer: 'FRAME',
          figma_raw: u.frame.interactionsRaw,
        });
      }

      // Child-level hotspots (buttons, groups etc. with their own interactions).
      const children = collectChildHotspotsForFrame(u.frame, frameNode);
      const seen = new Set<string>();
      for (const ch of children) {
        // Dedup if the same hotspot_id already used (e.g. frame == hotspot).
        if (seen.has(ch.hotspotId)) continue;
        seen.add(ch.hotspotId);
        hotspotRows.push({
          frame_id: frameDbId,
          prototype_version_id: prototypeVersionId,
          hotspot_id: ch.hotspotId,
          target_frame_id: ch.targetFrameId,
          transition_kind: ch.transitionKind,
          bbox_x: ch.bbox.x,
          bbox_y: ch.bbox.y,
          bbox_w: ch.bbox.w,
          bbox_h: ch.bbox.h,
          z_index: ch.zIndex,
          source_layer: ch.sourceLayer,
          figma_raw: ch.figmaRaw,
        });
      }
    }

    if (hotspotRows.length > 0) {
      const { error: hsErr } = await supabase.from('hotspots').insert(hotspotRows);
      if (hsErr) {
        await supabase
          .from('prototype_versions')
          .update({ status: 'failed' })
          .eq('id', prototypeVersionId);
        await failJob('hotspots_insert_failed', hsErr.message);
        return;
      }
    }

    // i.4 Flip prototype_versions to 'complete' + populate figma_node_tree.
    {
      const { error: pvUpdateErr } = await supabase
        .from('prototype_versions')
        .update({
          status: 'complete',
          figma_node_tree: figmaFile.document as unknown as Record<string, unknown> | null,
        })
        .eq('id', prototypeVersionId);
      if (pvUpdateErr) {
        await failJob('prototype_version_complete_failed', pvUpdateErr.message);
        return;
      }
    }

    // j. D-05 + D-06 re-import remap (best-effort summary in warnings) ------
    try {
      const { data: priorVersions } = await supabase
        .from('prototype_versions')
        .select('id, created_at')
        .eq('study_id', studyId)
        .eq('status', 'complete')
        .neq('id', prototypeVersionId)
        .order('created_at', { ascending: false })
        .limit(1);
      const prior = priorVersions?.[0];
      if (prior) {
        const { data: priorFrames } = await supabase
          .from('frames')
          .select('id, frame_id, name, width, height')
          .eq('prototype_version_id', prior.id);
        const { data: priorHotspots } = await supabase
          .from('hotspots')
          .select('hotspot_id, frame_id')
          .eq('prototype_version_id', prior.id);
        const newFrameIds = new Set(uploaded.map((u) => u.frame.id));
        const newHotspotIds = new Set(hotspotRows.map((h) => h.hotspot_id));
        let autoRemapped = 0;
        let needsRebind = 0;
        let framesRemoved = 0;
        const framesAdded = uploaded.length - (priorFrames?.length ?? 0);

        for (const pf of priorFrames ?? []) {
          if (!newFrameIds.has(pf.frame_id)) {
            framesRemoved += 1;
            warnings.push({ code: 'frame_removed', frame_id: pf.frame_id, name: pf.name });
          }
        }
        for (const ph of priorHotspots ?? []) {
          if (newHotspotIds.has(ph.hotspot_id)) {
            autoRemapped += 1;
          } else {
            needsRebind += 1;
            warnings.push({
              code: 'hotspot_needs_rebind',
              hotspot_id_in_prior_version: ph.hotspot_id,
            });
          }
        }
        warnings.push({
          code: 'reimport_summary',
          auto_remapped: autoRemapped,
          needs_rebind: needsRebind,
          frames_removed: framesRemoved,
          frames_added: framesAdded,
        });
      }
    } catch (e) {
      // Re-import remap is best-effort — log and continue.
      console.error('figma-import-worker: reimport remap failed', e);
    }

    // k. Final job status -----------------------------------------------------
    const hasSoftCap = warnings.some((w) => w.code === 'frames_exceeded_soft_cap');
    const finalStatus = hasSoftCap ? 'partial' : 'done';
    await supabase
      .from('prototype_imports')
      .update({
        status: finalStatus,
        warnings,
        prototype_version_id: prototypeVersionId,
      })
      .eq('id', importId);
    await channel.send({
      type: 'broadcast',
      event: 'progress',
      payload: {
        status: finalStatus,
        frames_total: frames.length,
        frames_done: framesDone,
        prototype_version_id: prototypeVersionId,
      },
    });

    console.log('figma-import-worker complete', {
      importId,
      fileKey,
      status: finalStatus,
      frames_total: frames.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('figma-import-worker: unhandled error', { importId, message });
    await failJob('unhandled', message);
  } finally {
    try {
      await channel.unsubscribe();
    } catch {
      /* noop */
    }
  }
}
