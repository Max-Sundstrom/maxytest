# hard_delete_archived_studies — Scheduled Edge Function

**Phase:** 1 (Walking Skeleton)
**Plan:** 01-04
**Owner:** lifecycle subsystem (TESTMGMT-03 / D-28)

## What this does

Invokes the Postgres function `public.hard_delete_archived_studies()` which
deletes studies whose `archived_at` is older than 30 days. The cascade FK
declarations in `supabase/migrations/00001_init.sql` propagate the delete
through `blocks`, `sessions`, and `responses`.

## Deploy

From the repo root:

```sh
pnpm dlx supabase functions deploy hard_delete_archived_studies --no-verify-jwt
```

`--no-verify-jwt` is intentional: this function authenticates via the
`SUPABASE_SERVICE_ROLE_KEY` from its environment, not via a user JWT. The
threat model (`01-04-PLAN.md` T-01-04-06) addresses why the public URL is
acceptable.

## Schedule (operator-only — Task 6 in 01-04-PLAN)

This is a manual, one-time Dashboard click:

1. Open **Supabase Dashboard → Edge Functions → `hard_delete_archived_studies`
   → Triggers** tab.
2. Click **New trigger** → choose **Cron schedule**.
3. Schedule: `0 3 * * *` (3 AM UTC daily).
4. Save.

Self-host alternative: uncomment the `pg_cron` block at the bottom of
`supabase/migrations/00004_phase1_lifecycle.sql` and re-run
`supabase db push`.

## Smoke test

```sh
# Manual one-off invocation (via supabase CLI from a credentialed shell)
pnpm dlx supabase functions invoke hard_delete_archived_studies --no-verify-jwt
```

Expected: HTTP 200 with `{"deleted_count": N}`. The count is typically 0
unless a row was force-aged via:

```sql
UPDATE public.studies SET archived_at = now() - interval '31 days' WHERE title LIKE '%dummy%';
SELECT public.hard_delete_archived_studies();
```

## Logs

`console.log` lines surface in **Dashboard → Edge Functions →
hard_delete_archived_studies → Logs**. A successful run logs:

```
hard_delete_archived_studies removed N studies
```

A failure logs the Postgres error message and returns HTTP 500. Both are
visible without any extra instrumentation.
