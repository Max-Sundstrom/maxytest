/**
 * Studies TanStack Query hooks — Plan 01-03 Task 2.
 *
 * - `useStudies(workspaceId)`           list non-archived studies (UI: /app)
 * - `useStudiesArchived(workspaceId)`   archived list (Plan 01-04 imports this)
 * - `useStudy(studyId)`                 single study lookup
 * - `useCreateStudy(workspaceId)`       calls `create_study` RPC (BUILDER-01)
 *
 * RLS: every read is gated by `studies_read` against `current_workspace_role`.
 * The `create_study` RPC is SECURITY DEFINER and checks the role itself.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/auth';
import type { Database } from '@/lib/supabase/types.gen';

export type StudyRow = Database['public']['Tables']['studies']['Row'];

export interface UseStudiesResult {
  studies: StudyRow[];
  isLoading: boolean;
  error: Error | null;
}

function buildStudyQueryKey(workspaceId: string, archived: boolean) {
  return ['studies', workspaceId, archived ? 'archived' : 'active'] as const;
}

export function useStudies(
  workspaceId: string | null | undefined,
): UseStudiesResult {
  const query = useQuery({
    queryKey: workspaceId
      ? buildStudyQueryKey(workspaceId, false)
      : ['studies', 'none', 'active'],
    enabled: !!workspaceId,
    staleTime: 10_000,
    queryFn: async (): Promise<StudyRow[]> => {
      const { data, error } = await supabase
        .from('studies')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .is('archived_at', null)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  return {
    studies: query.data ?? [],
    isLoading: query.isLoading,
    error: (query.error as Error | null) ?? null,
  };
}

/**
 * Archived studies (`archived_at IS NOT NULL`). Declared here so Plan 01-04's
 * Archived tab imports from the same module without a circular dependency.
 */
export function useStudiesArchived(
  workspaceId: string | null | undefined,
): UseStudiesResult {
  const query = useQuery({
    queryKey: workspaceId
      ? buildStudyQueryKey(workspaceId, true)
      : ['studies', 'none', 'archived'],
    enabled: !!workspaceId,
    staleTime: 30_000,
    queryFn: async (): Promise<StudyRow[]> => {
      const { data, error } = await supabase
        .from('studies')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  return {
    studies: query.data ?? [],
    isLoading: query.isLoading,
    error: (query.error as Error | null) ?? null,
  };
}

export function useStudy(studyId: string | null | undefined) {
  return useQuery({
    queryKey: ['study', studyId] as const,
    enabled: !!studyId,
    staleTime: 5_000,
    queryFn: async (): Promise<StudyRow | null> => {
      const { data, error } = await supabase
        .from('studies')
        .select('*')
        .eq('id', studyId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export interface CreateStudyResult {
  studyId: string;
}

/**
 * BUILDER-01: creates a draft study + welcome + thanks atomically.
 *
 * The RPC `create_study(ws_id, study_title)` is SECURITY DEFINER and inserts
 * both pinned blocks in one transaction, returning the new study id. On
 * success we invalidate the active-studies cache so the list refreshes.
 */
export function useCreateStudy(workspaceId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: { title?: string } = {},
    ): Promise<CreateStudyResult> => {
      if (!workspaceId) throw new Error('Workspace not loaded');
      const { data, error } = await supabase.rpc('create_study', {
        ws_id: workspaceId,
        study_title: input.title ?? 'Untitled test',
      });
      if (error) throw error;
      if (!data) throw new Error('create_study returned no id');
      return { studyId: data };
    },
    onSuccess: () => {
      if (workspaceId) {
        qc.invalidateQueries({ queryKey: buildStudyQueryKey(workspaceId, false) });
      }
    },
  });
}

/**
 * `useUpdateStudyTitle(studyId)` — used by `<WorkspaceTopBar>` inline-edit.
 * Plan 01-03 ships this; Plan 01-04 will add status-transition mutations.
 */
export function useUpdateStudyTitle(studyId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { title: string }) => {
      if (!studyId) throw new Error('Study not loaded');
      const { data, error } = await supabase
        .from('studies')
        .update({ title: input.title })
        .eq('id', studyId)
        .select()
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data) {
        qc.setQueryData(['study', studyId], data);
        // Also bump the list cache key so the title in `<StudyList>` updates.
        qc.invalidateQueries({
          queryKey: ['studies', data.workspace_id, 'active'],
        });
      }
    },
  });
}
