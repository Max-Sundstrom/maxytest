/**
 * RLS test suite — share_tokens (Plan 04-06 Task 8 / Wave 6 regression).
 *
 * Asserts the share_tokens RLS perimeter and the REPORT-08 lifecycle guard
 * (`hard_delete_archived_studies` skips share-active studies) against the
 * live Supabase project. Follows the harness pattern from
 * `apps/web/tests/rls/studies.test.ts`:
 *   - Service-role client for setup / teardown / direct introspection.
 *   - Per-user JWT clients for RLS assertion (no service-role on assert).
 *   - When SUPABASE_SERVICE_ROLE_KEY is absent, every `it` is `.skip`'d so
 *     parallel agents and forks without secrets stay green.
 *
 * Scenarios:
 *   1. Designer A can create a share-token via create_share_token RPC.
 *   2. Designer B (different workspace) cannot SELECT designer A's token
 *      via direct table read (RLS designer_rw blocks cross-workspace).
 *   3. Anon role cannot SELECT directly from share_tokens (no anon policy).
 *   4. Anon read_share_report RPC returns a non-null jsonb blob for an
 *      active token; the blob carries the title_snapshot.
 *   5. Lifecycle guard — Designer A archives the study (`archived_at` 31
 *      days ago) and the share-token stays active. Cron-side call to
 *      `hard_delete_archived_studies()` returns 0 — the study survives.
 *   6. Lifecycle guard — after Designer A revokes the share-token, the
 *      same cron call returns 1 and the study is hard-deleted (CASCADE
 *      wipes blocks / sessions / responses through to share_tokens).
 *
 * Notes:
 *   - All RPCs that target Plan 04-06 schema use `<any>` casts on the
 *     supabase-js client because types.gen.ts has not been regenerated
 *     yet (orchestrator does that post-merge). Matches the idiom from
 *     `apps/web/src/lib/queries/share-tokens.ts`.
 *   - The token is a fixed-shape nanoid-substitute (`test_token_*`) — we
 *     don't actually need nanoid entropy in a controlled test env.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  anonClient,
  createTestUser,
  deleteTestUser,
  getWorkspaceIdForUser,
  rlsCredentialsAvailable,
  uniqueTestEmail,
  userClient,
  type TestUser,
} from './setup';

describe.skipIf(!rlsCredentialsAvailable)('RLS / share_tokens', () => {
  let userA: TestUser;
  let userB: TestUser;
  let workspaceA: string;
  let studyIdA: string;

  // Use a unique token-string per test run so re-runs don't collide on the
  // share_tokens.token UNIQUE constraint. The format mimics nanoid(21) but
  // is deterministic for assertion convenience.
  const TOKEN_VALUE = `tst_${Date.now().toString(36).padEnd(17, 'a').slice(0, 17)}`;

  beforeAll(async () => {
    userA = await createTestUser(uniqueTestEmail('shareA'));
    userB = await createTestUser(uniqueTestEmail('shareB'));
    workspaceA = (await getWorkspaceIdForUser(userA.id))!;

    const admin = adminClient();
    const { data: s, error: sErr } = await admin
      .from('studies')
      .insert({
        workspace_id: workspaceA,
        title: 'Share-token test study',
        created_by: userA.id,
      })
      .select()
      .single();
    expect(sErr).toBeNull();
    studyIdA = s!.id;
  });

  afterAll(async () => {
    // The lifecycle-guard tests below already delete studyIdA via the cron
    // RPC; we still nuke the users to clean memberships + workspaces. Token
    // rows go away on CASCADE when the study is hard-deleted (test 6) or
    // when the workspace is wiped via user delete.
    if (userA?.id) await deleteTestUser(userA.id);
    if (userB?.id) await deleteTestUser(userB.id);
  });

  it('designer A can create a share-token via create_share_token RPC', async () => {
    const client = userClient(userA.jwt);
    const { data, error } = await (
      client as unknown as {
        rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
      }
    ).rpc('create_share_token', {
      p_study_id: studyIdA,
      p_token: TOKEN_VALUE,
      p_idempotency_key: crypto.randomUUID(),
      p_open_answer_visibility: {},
    });
    expect(error).toBeNull();
    expect((data as { token?: string } | null)?.token).toBe(TOKEN_VALUE);
  });

  it("designer B (different workspace) cannot SELECT designer A's share-token", async () => {
    const client = userClient(userB.jwt);
    const { data, error } = await (
      client as unknown as {
        from: (t: string) => {
          select: (s: string) => {
            eq: (k: string, v: string) => Promise<{ data: unknown[] | null; error: unknown }>;
          };
        };
      }
    )
      .from('share_tokens')
      .select('*')
      .eq('study_id', studyIdA);
    // RLS designer_rw silently filters non-member queries — error null + 0 rows.
    expect(error).toBeNull();
    expect(((data as unknown[]) ?? []).length).toBe(0);
  });

  it('anon cannot SELECT directly from share_tokens (no anon policy)', async () => {
    const client = anonClient();
    const { data, error } = await (
      client as unknown as {
        from: (t: string) => {
          select: (s: string) => {
            eq: (k: string, v: string) => Promise<{ data: unknown[] | null; error: unknown }>;
          };
        };
      }
    )
      .from('share_tokens')
      .select('*')
      .eq('token', TOKEN_VALUE);
    // No anon policy → PostgREST returns empty rows (error null) — RLS
    // doesn't error on missing-policy reads, it just hides everything.
    expect(error).toBeNull();
    expect(((data as unknown[]) ?? []).length).toBe(0);
  });

  it('anon read_share_report returns jsonb blob for an active token', async () => {
    const client = anonClient();
    const { data, error } = await (
      client as unknown as {
        rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
      }
    ).rpc('read_share_report', { p_token: TOKEN_VALUE });
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    const blob = data as { title?: string; blocks?: unknown[]; sessions?: unknown[] };
    expect(blob.title).toBe('Share-token test study');
    expect(Array.isArray(blob.blocks)).toBe(true);
    expect(Array.isArray(blob.sessions)).toBe(true);
  });

  it('LIFECYCLE GUARD: archived study with active share-token survives hard_delete cron', async () => {
    const admin = adminClient();
    // Archive the study with a date 31 days in the past so the time-window
    // condition of hard_delete_archived_studies() fires.
    const archivedAt = new Date(Date.now() - 31 * 24 * 3600 * 1000).toISOString();
    const { error: archErr } = await admin
      .from('studies')
      .update({ archived_at: archivedAt })
      .eq('id', studyIdA);
    expect(archErr).toBeNull();

    // Call the cron RPC as service-role (mirrors the Edge Function caller).
    const { data: deleted1, error: cronErr } = await (
      admin as unknown as {
        rpc: (n: string) => Promise<{ data: unknown; error: unknown }>;
      }
    ).rpc('hard_delete_archived_studies');
    expect(cronErr).toBeNull();
    expect(deleted1).toBe(0);

    // Study row still present.
    const { data: stillThere } = await admin
      .from('studies')
      .select('id')
      .eq('id', studyIdA)
      .maybeSingle();
    expect(stillThere?.id).toBe(studyIdA);
  });

  it('LIFECYCLE GUARD: after revoke, archived study becomes eligible for hard-delete', async () => {
    const client = userClient(userA.jwt);
    const { error: revokeErr } = await (
      client as unknown as {
        rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
      }
    ).rpc('revoke_share_token', { p_token: TOKEN_VALUE, p_reactivate: false });
    expect(revokeErr).toBeNull();

    const admin = adminClient();
    const { data: deleted2, error: cronErr2 } = await (
      admin as unknown as {
        rpc: (n: string) => Promise<{ data: unknown; error: unknown }>;
      }
    ).rpc('hard_delete_archived_studies');
    expect(cronErr2).toBeNull();
    expect(deleted2).toBe(1);

    // CASCADE: studies → blocks/sessions; sessions → responses. Verify the
    // study row is gone.
    const { data: gone } = await admin
      .from('studies')
      .select('id')
      .eq('id', studyIdA)
      .maybeSingle();
    expect(gone).toBeNull();
  });
});
