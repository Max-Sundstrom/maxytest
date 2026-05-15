# Install — Self-host

> **Status (Phase 1):** Phase 1 ships the application code only. The
> polished single-`docker compose up` self-host story lands in **Phase 8
> (DIST-01)**. Until then, self-host requires manual Supabase Docker
> setup and is recommended for advanced users only.
>
> For now we recommend the cloud path: see
> [INSTALL_CLOUD.md](./INSTALL_CLOUD.md).

This document is a skeleton that future phases will extend. It describes
how Phase 1's code can already run on a self-hosted Supabase stack today,
even though the operator UX is rough.

---

## Why self-host?

- Privacy / compliance — UX research data may include sensitive screen
  recordings of internal tools.
- Cost — Maxytest's free tier on Supabase Cloud fits early-stage solo
  designers; teams hitting Free-tier limits may prefer to run on their
  own VPS.
- Architectural fit with the `Self-hostability is priority #1` constraint
  (see `CLAUDE.md`).

---

## Prerequisites

- Linux/macOS VPS with **Docker 24+** and **Docker Compose v2**.
- A domain name pointed at the VPS (Cloudflare DNS recommended).
- A reverse proxy (Caddy / Nginx / Traefik) terminating TLS — Phase 8
  ships a bundled Caddy config; Phase 1 leaves you to BYO.
- An **SMTP provider** (Resend / Mailgun / Postmark / your own) — the
  built-in Supabase email is unsuitable for self-host (the JWT-signed
  Supabase service does not include an SMTP relay).

---

## Manual self-host (advanced users, Phase 1)

```bash
# 1. Clone + install
git clone <your-fork-url> maxytest
cd maxytest
pnpm install --frozen-lockfile

# 2. Spin up Supabase locally (Docker under the hood)
pnpm dlx supabase init
pnpm dlx supabase start    # boots Postgres + GoTrue + PostgREST + Studio + Kong
# Note the printed `API URL`, `anon key`, and `service_role key`.

# 3. Apply migrations
pnpm dlx supabase db push --db-url postgres://postgres:postgres@localhost:54322/postgres

# 4. Generate TS types
pnpm gen-types

# 5. Configure env
cp apps/web/.env.example apps/web/.env.local
# Set VITE_SUPABASE_URL=http://localhost:54321
# Set VITE_SUPABASE_ANON_KEY=<from `supabase start` output>

# 6. Build the SPA
pnpm --filter @maxytest/web build
# → apps/web/dist/

# 7. Serve dist/ from any static host
#    Examples:
#      caddy file-server --listen :8080 --root apps/web/dist
#      nginx ... root /var/www/maxytest;
#      python3 -m http.server 8080 --directory apps/web/dist
```

---

## Required ops glue (Phase 1)

These items are NOT bundled in Phase 1; you wire them yourself.

- **SMTP for magic-link auth.** In the Supabase Studio (running on
  `http://localhost:54323` by default after `supabase start`), open
  **Authentication → SMTP Settings** and point it at your provider. Without
  this, magic-link emails never leave the host.
- **Reverse proxy + TLS.** Terminate HTTPS at Caddy/Nginx in front of both
  the static dist/ and the Supabase API (`:54321`). Match
  `VITE_SUPABASE_URL` to the public HTTPS URL.
- **Edge Functions** (Phase 1 ships `hard_delete_archived_studies`):

  ```bash
  pnpm dlx supabase functions deploy hard_delete_archived_studies
  ```

  Then schedule it (the cron table lives in Supabase Studio or directly in
  Postgres):

  ```sql
  -- Run via psql against your self-hosted Postgres:
  -- 1. Enable pg_cron extension (Phase 8 will bundle this in the
  --    migration; for now do it manually):
  --    create extension if not exists pg_cron;
  -- 2. Schedule the function at 03:00 UTC daily.
  select cron.schedule(
    'hard_delete_archived_studies_daily',
    '0 3 * * *',
    $$ select net.http_post(
         url := 'http://localhost:54321/functions/v1/hard_delete_archived_studies',
         headers := jsonb_build_object('Authorization', 'Bearer <service_role_key>')
       ); $$
  );
  ```

- **Backups.** Phase 1 has no automated backup story for self-host.
  Operators should `pg_dump` on a cron and ship the dumps off-host.

---

## What's coming in Phase 8

- A single `docker compose up -d` that boots Postgres + GoTrue + PostgREST
  + Storage + Realtime + Studio + Kong + a Caddy reverse proxy + the
  Maxytest static dist, all behind one TLS-terminating endpoint.
- A bootstrap script that:
  - generates fresh JWT secrets
  - applies migrations
  - schedules pg_cron jobs
  - prompts for SMTP credentials
- Telemetry-free defaults.

Until Phase 8 ships, the cloud path is the supported install. The manual
steps above are documented for parity but are not the recommended Phase 1
deployment.
