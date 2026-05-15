import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/auth';
import { useSession } from '@/lib/queries/auth';
import type { Database } from '@/lib/supabase/types.gen';

/**
 * `useCurrentWorkspace` — the designer's primary workspace.
 *
 * Phase 1 assumes a single workspace per user (D-03 / WS-01). The bootstrap
 * trigger in 00001_init.sql creates exactly one workspace + one membership
 * row on first sign-in; this hook returns that pair.
 *
 * Plan 01-06 will add a workspace switcher when multi-workspace lands.
 *
 * RLS: `memberships_self_read` lets us fetch by `user_id = auth.uid()`; the
 * embedded `workspaces(...)` join is gated by `workspaces_member_read` which
 * checks `current_workspace_role()`.
 */

type WorkspaceRow = Database['public']['Tables']['workspaces']['Row'];
type Role = Database['public']['Tables']['memberships']['Row']['role'];

export interface CurrentWorkspaceResult {
  workspace: Pick<WorkspaceRow, 'id' | 'name' | 'slug'> | null;
  role: Role | null;
  isLoading: boolean;
  error: Error | null;
}

export function useCurrentWorkspace(): CurrentWorkspaceResult {
  const { session } = useSession();
  const userId = session?.user?.id;

  const query = useQuery({
    queryKey: ['current-workspace', userId ?? 'anon'],
    enabled: !!session,
    staleTime: 60_000,
    queryFn: async () => {
      // The trigger guarantees exactly one membership for a fresh signup, but
      // production accounts can grow more memberships later (Phase 6). For
      // Phase 1 we pick the first row.
      const { data, error } = await supabase
        .from('memberships')
        .select('workspace_id, role, workspaces(id, name, slug)')
        .eq('user_id', userId!)
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data || !data.workspaces) {
        return { workspace: null, role: null as Role | null };
      }
      // PostgREST returns the embedded row as either an object or an array
      // depending on the relationship cardinality. Normalize to the object.
      const ws = Array.isArray(data.workspaces) ? data.workspaces[0] : data.workspaces;
      return {
        workspace: ws
          ? { id: ws.id, name: ws.name, slug: ws.slug }
          : null,
        role: data.role as Role,
      };
    },
  });

  return {
    workspace: query.data?.workspace ?? null,
    role: query.data?.role ?? null,
    isLoading: query.isLoading,
    error: (query.error as Error | null) ?? null,
  };
}
