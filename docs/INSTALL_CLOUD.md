# Install — Cloud (Supabase Cloud + Cloudflare Pages)

Phase 1 ships the walking skeleton end-to-end on a free-tier cloud stack.
You can be running the dev server in ~10 minutes and serving the public
runner on a Cloudflare Pages URL in another ~10.

This guide covers Phase 1 only — magic-link auth, the test builder, and
the mobile runner. Phases 2+ extend with prototype-block import, analytics,
and the rest.

> If you'd rather host everything yourself, see
> [INSTALL_SELFHOST.md](./INSTALL_SELFHOST.md). Phase 8 ships the polished
> single-`docker compose up` story.

---

## Prerequisites

- **Node 22+** — `.nvmrc` pins the major version; `nvm use` if you have nvm.
- **pnpm 10+** — `npm i -g pnpm@10` (or use Corepack: `corepack enable && corepack prepare pnpm@10 --activate`).
- A free **Supabase Cloud** account → <https://supabase.com>.
- A **Cloudflare** account (for Pages hosting) → <https://dash.cloudflare.com>.
- A **GitHub** account + a fresh repo to push this code into.

---

## Step 1 — Clone + install

```bash
git clone <your-fork-url> maxytest
cd maxytest
pnpm install --frozen-lockfile
```

---

## Step 2 — Supabase: create the project + apply migrations

1. In the Supabase dashboard click **New project**. Pick a region close to
   your users (West EU is the default for Maxytest's reference deploy).
   Save the database password somewhere safe.
2. From the project's **Project Settings → API** page, copy:
   - `Project URL` → goes into `VITE_SUPABASE_URL`
   - `anon public` key → goes into `VITE_SUPABASE_ANON_KEY`
   - `service_role` key → goes into `SUPABASE_SERVICE_ROLE_KEY` (KEEP THIS SECRET)
3. Link your local checkout to the project:

   ```bash
   pnpm dlx supabase login
   pnpm dlx supabase link --project-ref <ref-from-dashboard>
   pnpm dlx supabase db push
   pnpm gen-types
   ```

   `db push` applies migrations `00001…00006` (users, workspaces, studies,
   blocks, sessions, responses, lifecycle RPCs, runner RPCs).
4. **Auth URL configuration** (Dashboard → Authentication → URL Configuration):
   - **Site URL**: your production Cloudflare Pages URL (you'll add this
     after Step 4). Until then, use `http://localhost:5173`.
   - **Redirect URLs** (allow-list):
     - `http://localhost:5173/auth/callback` (local dev)
     - `https://<project-name>.pages.dev/auth/callback` (production)
     - `https://*.<project-name>.pages.dev/auth/callback` (preview deploys)
5. **Cron the hard-delete Edge Function** (Plan 01-04 archived-study GC).
   Dashboard → Edge Functions → `hard_delete_archived_studies` → **Schedule**.
   Cron expression: `0 3 * * *` (daily at 03:00 UTC). The function itself
   is already deployed; you only need to attach the schedule.

---

## Step 3 — Local dev

```bash
cp apps/web/.env.example apps/web/.env.local
# Fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in .env.local
pnpm --filter @maxytest/web dev
# → http://localhost:5173
```

Sign in with your email; check your inbox for the magic-link email; click it.
You should land on `/app` with an empty test list and a "Create your first
test (60s)" button.

---

## Step 4 — Cloudflare Pages: connect the repo

1. **Workers & Pages → Create application → Pages → Connect to Git**.
2. Pick the repo. Configure the build:
   - **Build command:** `pnpm --filter @maxytest/web build`
   - **Build output directory:** `apps/web/dist`
   - **Root directory:** `/` (default)
   - **Framework preset:** None / Vite (either works)
   - **Node version:** `22` (set under **Settings → Environment variables**
     as `NODE_VERSION=22`)
3. **Environment variables** — set for **both** Production and Preview:
   - `VITE_SUPABASE_URL` = (your project URL)
   - `VITE_SUPABASE_ANON_KEY` = (your anon key)
   - `NODE_VERSION` = `22`
4. **Trigger first deploy:** push a commit to `main`. The first build
   should be green in ~2 minutes. Cloudflare will publish to
   `https://<project-name>.pages.dev/`.
5. **Update Supabase Auth** (Step 2.4 above) with the now-known production URL.
6. Smoke-test: sign in from the production URL; create a test; publish;
   open the run-token URL on your phone; complete the test. End-to-end on
   a free-tier cloud stack.

---

## Step 5 — GitHub Actions secrets (CI gate)

1. Create a **second** Supabase project ("maxytest-test") with the same
   migrations applied. CI tests will create + delete users in this project;
   you do not want production noise here.
2. In your repo: **Settings → Secrets and variables → Actions → New repository secret**:
   - `VITE_SUPABASE_URL` = (test project URL)
   - `VITE_SUPABASE_ANON_KEY` = (test anon key)
   - `SUPABASE_SERVICE_ROLE_KEY` = (test service-role key — **NEVER**
     production)
3. Open a draft PR with a trivial change. The `.github/workflows/ci.yml`
   pipeline should run lint → typecheck → vitest → build → playwright. The
   first run takes ~5 min; subsequent PRs are faster thanks to `cache: pnpm`.
4. (Optional) Add a GitHub Actions status badge to `README.md`. The badge
   URL pattern is:
   `https://github.com/<owner>/<repo>/actions/workflows/ci.yml/badge.svg`.

> **Why a separate test project?** The RLS + E2E suites create real auth
> users and studies. Running them against production would leave detritus
> and rate-limit your real users. The free Supabase tier allows two
> projects per organisation.

---

## Step 6 — Smoke test the whole chain

Sign-in works in production? Builder loads? Publish mints a run-token?
Mobile runner accepts responses? Then Phase 1 is live.

You are done with the Phase 1 install. Subsequent phases extend the
schema (Phase 2 adds prototype_versions, frame storage) — re-run `pnpm
dlx supabase db push` after each migration ships.

---

## Troubleshooting

- **`pnpm dlx supabase` errors with "command not found":** install the
  Supabase CLI directly: `npm i -g supabase` (or `brew install supabase/tap/supabase` on macOS).
- **Magic-link email not arriving:** check spam; Supabase's built-in email
  is rate-limited. For production, add an SMTP provider (Resend / Mailgun)
  in **Project Settings → Auth → SMTP Settings**.
- **Cloudflare build fails with "node not found":** double-check
  `NODE_VERSION=22` is set in env vars.
- **E2E tests fail with "Invalid URL" or "401":** confirm the GitHub
  Actions secrets are set on the **repo** (not just personal account).
- **CI is red on a PR from a fork:** GitHub's default is to not expose
  secrets to fork-originated PRs. The lint/typecheck/build steps still
  run; session-dependent E2E cases `test.fixme()` automatically.
