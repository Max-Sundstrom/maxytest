// =============================================================================
// hard_delete_archived_studies — Supabase Scheduled Edge Function
// =============================================================================
//
// Plan: 01-walking-skeleton / 01-04 / Task 5
//
// What this does
//   Invokes the Postgres function `public.hard_delete_archived_studies()`
//   which deletes studies whose `archived_at` is older than 30 days. Cascade
//   FKs (declared in 00001_init.sql) sweep blocks, sessions, and responses
//   that belonged to the deleted studies.
//
// How it's invoked
//   - SUPABASE CLOUD: Scheduled via the Dashboard → Edge Functions →
//     hard_delete_archived_studies → Triggers → New trigger → CRON
//     `0 3 * * *` (3 AM UTC daily). Task 6 captures this human step.
//   - SELF-HOST: prefer the commented `pg_cron` block in
//     `supabase/migrations/00004_phase1_lifecycle.sql`. The Edge Function
//     remains deployable as a manual smoke-test endpoint.
//
// Auth model
//   The function uses the SUPABASE_SERVICE_ROLE_KEY from its environment to
//   call the SQL function. Service-role bypasses RLS, which is required
//   because:
//   - The SQL function is SECURITY DEFINER but has no `current_workspace_role`
//     guard (it's not user-callable; it's maintenance).
//   - The Edge Function is deployed `--no-verify-jwt`. Even if a third party
//     hits the public URL, the only effect is to run an idempotent maintenance
//     task; there's no data read, no PII leak, and the cron's 30-day filter
//     prevents accelerated deletion of any individual row (T-01-04-06).
//
// Logging
//   Successful invocations log the `deleted_count` so Dashboard operators can
//   audit retention behavior. A non-zero count followed by zero counts is
//   the expected steady state.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.105.4';

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      'hard_delete_archived_studies: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment',
    );
    return new Response(JSON.stringify({ error: 'configuration_missing' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc('hard_delete_archived_studies');

  if (error) {
    console.error('hard_delete_archived_studies failed:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  const deletedCount = typeof data === 'number' ? data : 0;
  console.log(`hard_delete_archived_studies removed ${deletedCount} studies`);

  return new Response(JSON.stringify({ deleted_count: deletedCount }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});
