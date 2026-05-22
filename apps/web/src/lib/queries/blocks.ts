/**
 * Blocks TanStack Query hooks — Plan 01-03 Task 2 (highest-IP file in Phase 1).
 *
 * Implements decision quartet (D-13 + D-15 + D-16 + D-17):
 *   - D-13 optimistic concurrency: every UPDATE filters `.eq('version', $)`;
 *           on rowCount=0 we throw `ConflictError` so the card UX surfaces
 *           the conflict banner.
 *   - D-15 cross-tab sync: on save success we post `{type:'block-saved', ...}`
 *           on `block-saves-${workspaceId}` for sibling tabs to refetch.
 *   - D-16 idempotency: every mutation generates a UUIDv7 key and writes a
 *           row into `block_changes`. Retries are dedup'd by UNIQUE constraint.
 *   - D-17 conflict gate for undo: `useHasAnyConflict(studyId)` exposes a
 *           boolean derived from `useMutationState` so `useBuilderHotkeys`
 *           can short-circuit Cmd+Z while a card is in conflict.
 *
 * RESEARCH.md Pattern 4 is the canonical reference for the optimistic update +
 * broadcast shape.
 */

import { useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query';
import { uuidv7 } from 'uuidv7';
import { supabase } from '@/lib/supabase/auth';
import { getBlockSavesChannel } from '@/lib/broadcast/block-saves';
import type { Database, Json } from '@/lib/supabase/types.gen';
import type { BlockContent } from '@/lib/blocks/schemas';
import type { Block, Phase4xBlockType } from '@/lib/blocks/types';

type BlockRow = Database['public']['Tables']['blocks']['Row'];

/** Convert a Supabase row into the strongly-typed domain `Block`. */
function rowToBlock(row: BlockRow): Block {
  return {
    id: row.id,
    study_id: row.study_id,
    position: row.position,
    type: row.type as Phase4xBlockType,
    pinned: row.pinned,
    // The DB stores content as `jsonb`; we trust the editor + create_study
    // RPC to only write Zod-validated content. Downstream renderers can
    // safe-parse before use if they want defence-in-depth.
    content: row.content as unknown as BlockContent,
    version: row.version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Thrown by `useUpdateBlock` when the conditional UPDATE matches zero rows
 * — meaning the server's version has moved on since we read it. The caller
 * (`<BlockCard>`) transitions to the `conflict` save state.
 */
export class ConflictError extends Error {
  readonly blockId: string;
  constructor(blockId: string) {
    super(`Block ${blockId} was edited elsewhere`);
    this.name = 'ConflictError';
    this.blockId = blockId;
  }
}

const UPDATE_BLOCK_MUTATION_KEY = 'block-update' as const;

/** Build a stable per-block mutation key for `useMutationState` queries. */
function buildUpdateBlockMutationKey(studyId: string) {
  return [UPDATE_BLOCK_MUTATION_KEY, studyId] as const;
}

// ----------------------------------------------------------------------------
// Reads
// ----------------------------------------------------------------------------

export function useBlocks(studyId: string | null | undefined) {
  return useQuery({
    queryKey: ['blocks', studyId] as const,
    enabled: !!studyId,
    staleTime: 5_000,
    queryFn: async (): Promise<Block[]> => {
      const { data, error } = await supabase
        .from('blocks')
        .select('*')
        .eq('study_id', studyId!)
        .order('position', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(rowToBlock);
    },
  });
}

// ----------------------------------------------------------------------------
// Update — version-column optimistic concurrency (D-13)
// ----------------------------------------------------------------------------

export interface UpdateBlockInput {
  blockId: string;
  content: BlockContent;
  version: number;
  /** Optional caller-supplied UUIDv7; generated if absent. */
  idempotencyKey?: string;
}

export function useUpdateBlock(studyId: string, workspaceId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationKey: buildUpdateBlockMutationKey(studyId),
    mutationFn: async (input: UpdateBlockInput): Promise<Block> => {
      const idempotencyKey = input.idempotencyKey ?? uuidv7();

      // 1. Audit row first (idempotency-protected). A retried save with the
      //    same key bounces off the UNIQUE (block_id, idempotency_key)
      //    constraint and PostgREST returns 23505 — which we treat as
      //    "already applied" and continue to the UPDATE path so the caller
      //    still gets the row back.
      const { error: auditError } = await supabase.from('block_changes').insert({
        block_id: input.blockId,
        idempotency_key: idempotencyKey,
        change_type: 'content_edit',
        payload: { content: input.content as unknown as Json },
      });
      if (auditError && auditError.code !== '23505') throw auditError;

      // 2. Conditional UPDATE — `.eq('version', input.version)` is the load-
      //    bearing optimistic check. On rowCount=0 we throw ConflictError.
      const { data, error } = await supabase
        .from('blocks')
        .update({
          content: input.content as unknown as Json,
          version: input.version + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.blockId)
        .eq('version', input.version)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (data === null) throw new ConflictError(input.blockId);
      return rowToBlock(data);
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ['blocks', studyId] });
      const prev = qc.getQueryData<Block[]>(['blocks', studyId]);
      qc.setQueryData<Block[]>(['blocks', studyId], (old) =>
        (old ?? []).map((b) => (b.id === input.blockId ? { ...b, content: input.content } : b)),
      );
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) qc.setQueryData(['blocks', studyId], ctx.prev);
    },
    onSuccess: (data) => {
      // Cross-tab broadcast (D-15). Receiving tabs invalidate ['blocks', studyId].
      try {
        const channel = getBlockSavesChannel(workspaceId);
        channel.postMessage({
          type: 'block-saved',
          blockId: data.id,
          version: data.version,
        });
      } catch {
        // BroadcastChannel not supported (very old Safari) — degrade silently.
      }
      // Reconcile the optimistic state with the server's row (version bump).
      qc.setQueryData<Block[]>(['blocks', studyId], (old) =>
        (old ?? []).map((b) => (b.id === data.id ? data : b)),
      );
    },
  });
}

// ----------------------------------------------------------------------------
// Force update — D-14 "Use my version" conflict resolution
// ----------------------------------------------------------------------------

export function useForceUpdateBlock(studyId: string, workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      blockId: string;
      content: BlockContent;
      idempotencyKey?: string;
    }): Promise<Block> => {
      const idempotencyKey = input.idempotencyKey ?? uuidv7();
      const { data, error } = await supabase.rpc('force_update_block', {
        p_block_id: input.blockId,
        p_content: input.content as unknown as Json,
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw error;
      if (!data) throw new Error('force_update_block returned no row');
      return rowToBlock(data as BlockRow);
    },
    onSuccess: (data) => {
      qc.setQueryData<Block[]>(['blocks', studyId], (old) =>
        (old ?? []).map((b) => (b.id === data.id ? data : b)),
      );
      try {
        getBlockSavesChannel(workspaceId).postMessage({
          type: 'block-saved',
          blockId: data.id,
          version: data.version,
        });
      } catch {
        /* see useUpdateBlock */
      }
    },
  });
}

// ----------------------------------------------------------------------------
// Add — via insert_block_at RPC
// ----------------------------------------------------------------------------

export function useAddBlock(studyId: string, workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      position: number;
      type: Phase4xBlockType;
      content: BlockContent;
      idempotencyKey?: string;
    }): Promise<Block> => {
      const idempotencyKey = input.idempotencyKey ?? uuidv7();
      const { data, error } = await supabase.rpc('insert_block_at', {
        p_study_id: studyId,
        p_position: input.position,
        p_type: input.type,
        p_content: input.content as unknown as Json,
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw error;
      if (!data) throw new Error('insert_block_at returned no row');
      return rowToBlock(data as BlockRow);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['blocks', studyId] });
      try {
        getBlockSavesChannel(workspaceId).postMessage({
          type: 'block-saved',
          blockId: 'list',
          version: 0,
        });
      } catch {
        /* noop */
      }
    },
  });
}

// ----------------------------------------------------------------------------
// Delete — via delete_block RPC
// ----------------------------------------------------------------------------

export function useDeleteBlock(studyId: string, workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { blockId: string; idempotencyKey?: string }): Promise<void> => {
      const idempotencyKey = input.idempotencyKey ?? uuidv7();
      const { error } = await supabase.rpc('delete_block', {
        p_block_id: input.blockId,
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['blocks', studyId] });
      try {
        getBlockSavesChannel(workspaceId).postMessage({
          type: 'block-saved',
          blockId: 'list',
          version: 0,
        });
      } catch {
        /* noop */
      }
    },
  });
}

// ----------------------------------------------------------------------------
// Duplicate — via duplicate_block RPC
// ----------------------------------------------------------------------------

export function useDuplicateBlock(studyId: string, workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { blockId: string; idempotencyKey?: string }): Promise<Block> => {
      const idempotencyKey = input.idempotencyKey ?? uuidv7();
      const { data, error } = await supabase.rpc('duplicate_block', {
        p_block_id: input.blockId,
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw error;
      if (!data) throw new Error('duplicate_block returned no row');
      return rowToBlock(data as BlockRow);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['blocks', studyId] });
      try {
        getBlockSavesChannel(workspaceId).postMessage({
          type: 'block-saved',
          blockId: 'list',
          version: 0,
        });
      } catch {
        /* noop */
      }
    },
  });
}

// ----------------------------------------------------------------------------
// Reorder — via reorder_blocks RPC
// ----------------------------------------------------------------------------

export function useReorderBlocks(studyId: string, workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      orderedBlockIds: string[];
      idempotencyKey?: string;
    }): Promise<void> => {
      const idempotencyKey = input.idempotencyKey ?? uuidv7();
      const { error } = await supabase.rpc('reorder_blocks', {
        p_study_id: studyId,
        p_ordered_block_ids: input.orderedBlockIds,
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['blocks', studyId] });
      try {
        getBlockSavesChannel(workspaceId).postMessage({
          type: 'block-saved',
          blockId: 'list',
          version: 0,
        });
      } catch {
        /* noop */
      }
    },
  });
}

// ----------------------------------------------------------------------------
// Conflict-gate derived hook (D-17)
// ----------------------------------------------------------------------------

/**
 * Returns true if ANY in-flight or just-failed update-block mutation for the
 * given study errored with a `ConflictError`. `useBuilderHotkeys` reads this
 * to short-circuit Cmd+Z while a card is in conflict — undo would just write
 * the same conflicted version back and reset the user's mental model.
 *
 * Implementation note: we observe `useMutationState` filtered by the
 * canonical mutation key. A mutation's `error` survives until the next
 * `.mutate()` call resets the cache entry, which is exactly when the card's
 * "Use server" / "Use my version" actions are wired to.
 */
export function useHasAnyConflict(studyId: string | null | undefined): boolean {
  const errors = useMutationState({
    filters: {
      mutationKey: studyId ? buildUpdateBlockMutationKey(studyId) : ['block-update'],
    },
    select: (m) => m.state.error,
  });
  return errors.some((e) => e instanceof ConflictError);
}
