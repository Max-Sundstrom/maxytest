/**
 * Sessions TanStack Query hook — Plan 01-05 Task 2.
 *
 * `useRunnerSession(runToken)` is the single entry point for the runner
 * route. It:
 *
 *   1. Ensures the browser has an anonymous Supabase JWT (AUTH-04 / D-05).
 *      On first visit calls `supabaseAnon.auth.signInAnonymously()`; on
 *      subsequent visits the JWT lives in `maxytest-runner-auth` storage
 *      (Plan 01-02 anon.ts storageKey) and Supabase auto-refreshes.
 *
 *   2. Resolves an existing session id from localStorage keyed by run_token
 *      (`maxytest:session:{runToken}`; D-20). If the row still exists and is
 *      `in_progress`, returns it; if it's completed, discards local state
 *      and creates a fresh session.
 *
 *   3. If no session exists, calls the `create_session` RPC from 00005
 *      migration. The RPC raises `invalid_run_token` (study not found) or
 *      `not_accepting_responses` (study not in `published`) which we surface
 *      via a stable `code` field on the thrown error.
 *
 *   4. Fetches the study row (for status + run_token check), the block list
 *      (for the runner sequence), and any prior responses (resume case).
 *
 * Always returns a stable result shape — the runner route branches on the
 * fields to render loading / not-accepting / 404 / live.
 */

import { useQuery } from '@tanstack/react-query';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabaseAnon } from '@/lib/supabase/anon';
import type { Database, Json } from '@/lib/supabase/types.gen';
import type { Block, Phase1BlockType } from '@/lib/blocks/types';
import type { BlockContent } from '@/lib/blocks/schemas';

type SessionRow = Database['public']['Tables']['sessions']['Row'];
type StudyRow = Database['public']['Tables']['studies']['Row'];
type BlockRow = Database['public']['Tables']['blocks']['Row'];
type ResponseRow = Database['public']['Tables']['responses']['Row'];

/** Stable error codes the runner route branches on. */
export type RunnerErrorCode = 'invalid_run_token' | 'not_accepting_responses' | 'unknown';

export class RunnerError extends Error {
  readonly code: RunnerErrorCode;
  constructor(code: RunnerErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'RunnerError';
    this.code = code;
  }
}

export interface RunnerSessionData {
  /** Server session row. */
  session: SessionRow;
  /** Parent study (status + run_token check happens here). */
  study: StudyRow;
  /** Block sequence ordered by position. */
  blocks: Block[];
  /** Already-submitted answers (resume case). */
  existingAnswers: Array<{ blockId: string; content: unknown }>;
}

const sessionStorageKey = (runToken: string) => `maxytest:session:${runToken}`;

/**
 * Map a raw blocks row into the domain `Block` shape used by the runner.
 * Mirrors the helper in lib/queries/blocks.ts but lives here so the runner
 * client tree doesn't reach into builder-side modules (Plan 01-02 boundary).
 */
function rowToBlock(row: BlockRow): Block {
  return {
    id: row.id,
    study_id: row.study_id,
    position: row.position,
    type: row.type as Phase1BlockType,
    pinned: row.pinned,
    content: row.content as unknown as BlockContent,
    version: row.version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Detect mobile vs desktop for the session row's `device_type` column. */
function detectDeviceType(): 'mobile' | 'desktop' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'desktop';
  return window.matchMedia('(max-width: 1023px)').matches ? 'mobile' : 'desktop';
}

/**
 * String-matching helper for Postgres exceptions that come through PostgREST
 * with a generic shape. The RPC raises `RAISE EXCEPTION 'invalid_run_token'`
 * and PostgREST surfaces the literal message; we match on substring rather
 * than exact equality to tolerate the "ERROR: " / SQLSTATE wrapping that
 * different Supabase versions add.
 */
function hasErrorCode(err: unknown, code: string): boolean {
  if (!err || typeof err !== 'object') return false;
  const msg = (err as { message?: string }).message;
  return typeof msg === 'string' && msg.includes(code);
}

/**
 * Ensure the runner client has a session. Idempotent: on subsequent calls
 * Supabase returns the persisted session from `maxytest-runner-auth` storage
 * without a network round-trip.
 */
async function ensureAnonAuth(): Promise<void> {
  const { data: existing } = await supabaseAnon.auth.getSession();
  if (existing.session) return;
  const { error } = await supabaseAnon.auth.signInAnonymously();
  if (error) throw error;
}

/**
 * Resolve a session for the given run_token. Tries localStorage first, then
 * falls back to creating one via the `create_session` RPC.
 *
 * Returns { sessionId } on success; throws `RunnerError` with a stable code
 * on `invalid_run_token` / `not_accepting_responses`.
 */
async function resolveSessionId(runToken: string): Promise<string> {
  const storageKey = sessionStorageKey(runToken);
  let cachedId: string | null = null;
  try {
    cachedId = window.localStorage.getItem(storageKey);
  } catch {
    // localStorage may be unavailable (Private Browsing on iOS Safari with
    // quotas exhausted). Fall through to RPC create.
  }

  if (cachedId) {
    const { data, error } = await supabaseAnon
      .from('sessions')
      .select('id, status, respondent_id')
      .eq('id', cachedId)
      .maybeSingle();

    // RLS-filtered "no row" is data === null with no error; treat as
    // session-not-resumable and create a fresh one.
    if (!error && data && data.status === 'in_progress') {
      return data.id;
    }

    // Stale cache. Wipe it before falling through.
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* noop */
    }
  }

  // Create a fresh session via the SECURITY DEFINER RPC.
  // The RPC is named `create_session` and is NOT yet in types.gen.ts (will be
  // regenerated post-merge); cast via `as never` mirroring Plan 01-04 pattern.
  const { data: newId, error } = await supabaseAnon.rpc(
    'create_session' as never,
    {
      p_run_token: runToken,
      p_device_type: detectDeviceType(),
      p_user_agent:
        typeof navigator !== 'undefined' && navigator.userAgent
          ? navigator.userAgent.slice(0, 500)
          : 'unknown',
    } as never,
  );

  if (error) {
    if (hasErrorCode(error, 'invalid_run_token')) {
      throw new RunnerError('invalid_run_token');
    }
    if (hasErrorCode(error, 'not_accepting_responses')) {
      throw new RunnerError('not_accepting_responses');
    }
    throw new RunnerError('unknown', error.message);
  }
  if (!newId || typeof newId !== 'string') {
    throw new RunnerError('unknown', 'create_session returned no id');
  }

  try {
    window.localStorage.setItem(storageKey, newId);
  } catch {
    /* noop */
  }
  return newId;
}

/**
 * Useable by the runner route as: `const result = useRunnerSession(token);`
 *
 * The query function does ALL the runner bootstrap in sequence so React
 * Suspense / loading state is a single `isLoading` boolean. The route
 * branches on `result.error` to render TestNotAcceptingScreen / 404.
 */
export function useRunnerSession(runToken: string | null | undefined) {
  return useQuery({
    queryKey: ['runner-session', runToken] as const,
    enabled: !!runToken,
    // Resume / refetch behaviour: we DON'T want background refetch every focus
    // because that could clobber an in-progress answer with server state. The
    // runner is single-tab; explicit invalidation after submit_response is
    // enough.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (failureCount, error) => {
      // Don't retry stable "this test isn't valid" errors.
      if (error instanceof RunnerError) return false;
      return failureCount < 2;
    },
    queryFn: async (): Promise<RunnerSessionData> => {
      if (!runToken) {
        throw new RunnerError('unknown', 'no runToken');
      }

      // 1. Anonymous auth (idempotent; no-op after first visit).
      await ensureAnonAuth();

      // 2. Resolve/create the session.
      const sessionId = await resolveSessionId(runToken);

      // 3. Fetch the session + study + blocks + responses. We split into
      //    discrete reads instead of a nested .select() because PostgREST's
      //    embedded-join behaviour with RLS + cross-table policies gets
      //    surprising — the explicit reads are easier to debug.
      const { data: sessionData, error: sessionErr } = await supabaseAnon
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .single();
      if (sessionErr || !sessionData) {
        throw new RunnerError('unknown', sessionErr?.message ?? 'no session');
      }

      const { data: studyData, error: studyErr } = await supabaseAnon
        .from('studies')
        .select('*')
        .eq('id', sessionData.study_id)
        .single();
      if (studyErr || !studyData) {
        throw new RunnerError(
          studyErr?.code === 'PGRST116' ? 'invalid_run_token' : 'unknown',
          studyErr?.message,
        );
      }

      // Defensive: even though create_session refused non-published studies,
      // a study can transition draft/archived AFTER session creation. The
      // runner UI surfaces TestNotAcceptingScreen via this branch.
      //   - Draft: never accept (shouldn't happen, but guard anyway).
      //   - Archived + not-yet-completed: stop accepting; existing completed
      //     sessions stay readable so the respondent can re-open the thanks
      //     screen and see their submission.
      if (
        studyData.status === 'draft' ||
        (studyData.status === 'archived' && sessionData.status !== 'completed')
      ) {
        throw new RunnerError('not_accepting_responses');
      }

      const { data: blocksData, error: blocksErr } = await supabaseAnon
        .from('blocks')
        .select('*')
        .eq('study_id', studyData.id)
        .order('position', { ascending: true });
      if (blocksErr) {
        throw new RunnerError('unknown', blocksErr.message);
      }
      const blocks = (blocksData ?? []).map(rowToBlock);

      const { data: responsesData, error: responsesErr } = await supabaseAnon
        .from('responses')
        .select('block_id, answer')
        .eq('session_id', sessionId);
      if (responsesErr) {
        // Non-fatal: RLS would silently filter to zero rows for an unowned
        // session, which is fine. A real error blocks the runner though.
        throw new RunnerError('unknown', responsesErr.message);
      }
      const existingAnswers = (responsesData ?? []).map(
        (r: Pick<ResponseRow, 'block_id' | 'answer'>) => ({
          blockId: r.block_id,
          content: r.answer as unknown,
        }),
      );

      return {
        session: sessionData,
        study: studyData,
        blocks,
        existingAnswers,
      };
    },
  });
}

// ---------------------------------------------------------------------------
// useCompleteSession — transition to status='completed' when thanks renders
// ---------------------------------------------------------------------------

export function useCompleteSession(runToken: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { sessionId: string }): Promise<void> => {
      const { error } = await supabaseAnon.rpc(
        'complete_session' as never,
        { p_session_id: input.sessionId } as never,
      );
      if (error) throw error;
    },
    onSuccess: () => {
      if (runToken) {
        qc.invalidateQueries({ queryKey: ['runner-session', runToken] });
      }
    },
  });
}

// Re-export the JSON brand for downstream consumers that need to pass jsonb-
// shaped payloads to the runner's submit RPC without importing types.gen.
export type { Json };
