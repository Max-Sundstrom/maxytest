# Maxytest Figma Plugin (dev)

> Phase 02.2 ships only the **dev manifest** install path. Figma Community
> publishing is deferred (see `.planning/phases/02.2-figma-plugin-primary-import-path/02.2-CONTEXT.md` D-01).

## Install (Figma Desktop, ≤30 s)

1. Clone the repo:
   ```bash
   git clone https://github.com/<org>/maxytest.git
   cd maxytest
   ```
2. Install dependencies and build the plugin bundle:
   ```bash
   pnpm install
   SUPABASE_URL="https://<your-ref>.supabase.co" \
   SUPABASE_ANON_KEY="<your-anon-key>" \
     pnpm --filter @maxytest/plugin build
   ```
   This emits `apps/plugin/dist/code.js` (Figma sandbox bundle) and
   `apps/plugin/dist/ui.html` (self-contained iframe with inlined `<script>`).
3. Open **Figma Desktop** → menu **Plugins** → **Development** →
   **Import plugin from manifest…**
4. Pick `apps/plugin/manifest.json` from the cloned repo.
5. Open any Figma file → **Plugins** → **Development** → **Maxytest** →
   **Run**.

On first import, Figma Desktop generates a unique plugin `id` and stores the
mapping in its desktop config. The repo-checked-in `manifest.json` keeps
`"id": "REPLACE_WITH_FIGMA_GENERATED_ID"` as a placeholder; Figma does NOT
overwrite the file — the id binding lives only in the desktop install.
Community publication (Phase 02.2 deferred → Phase 7) will replace this with
a permanent id.

## Dev loop

```bash
pnpm --filter @maxytest/plugin dev
```

Keeps a watch on `src/`. In Figma Desktop, right-click the plugin in
**Plugins → Development → Maxytest** and pick **Hot reload** to reload after
each rebuild. The watch script rebuilds the UI iframe every ~1.5 s via a
simple poll loop (esbuild context watch handles `code.ts` continuously); this
is the KISS pattern per `02.2-PATTERNS.md` §5.

## Sign in

First run prompts a magic-link sign-in. The plugin opens your default
browser to `<VIEWER_URL>/auth/plugin-callback?nonce=<uuid>` (the
`VIEWER_URL` defaults to `http://localhost:5173` if `VIEWER_URL` was not set
at build time — see `build.mjs`). Sign in there, return to Figma, and the
plugin picks up the session via a Supabase Realtime broadcast and caches it
in `figma.clientStorage` per-Figma-user (cross-file). Sign-in is real in
Plan 05; this scaffold ships only the smoke "Hello Maxytest" UI.

## Verifying with the timeout-bug file

> **Placeholder UAT checklist — finalized in Plan 08 (integration).**

The 2026-05-16 UAT proved that `figma-import-worker` (REST + Edge Function
path) times out at 150 s for the Figma file with key
`AnPMpM9Locu4TGVZjK0emK`. This file is the canonical end-to-end test for
proving the plugin path bypasses that ceiling.

Once the import pipeline lands (Plan 07), the verification ritual will be:

1. Open the Figma file with key `AnPMpM9Locu4TGVZjK0emK` in Figma Desktop.
2. Open the Maxytest plugin (**Plugins → Development → Maxytest → Run**).
3. Sign in (one-time per device).
4. Pick the prototype's main flow in the **Flow Picker** screen.
5. Click **Опубликовать**.
6. Expected: progress UI walks through parsing → rendering → uploading →
   publishing → **✓ Опубликовано** within ~15–30 s regardless of file size.
7. Click **Open in Maxytest →** — the deep link opens the study editor with
   the new prototype version already wired in.
8. Cross-check in Supabase: new row in `public.prototype_versions`, matching
   `frames` and `hotspots` rows, audit row in `public.prototype_imports`
   with `path='plugin'`, and PNGs in `prototype-renders` Storage bucket at
   `<workspace_id>/<prototype_version_id>/<frame_id>-<hash>@1x.png` (and
   `@2x.png`).

For Plan 01 (this plan), the only check is the smoke render described in
**Install** step 5 above — a 360 × 540 window with "Hello Maxytest" and a
Close button.

## What's in this scaffold (Plan 01)

| File                                        | Role                                                          |
| ------------------------------------------- | ------------------------------------------------------------- |
| `package.json`                              | pnpm workspace (`@maxytest/plugin`) + scripts + deps          |
| `tsconfig.json` / `.code.json` / `.ui.json` | Two-target TS (sandbox no-DOM + UI iframe with DOM)           |
| `eslint.config.js`                          | Root-extends + plugin-scoped rules (no cross-app, no SVC key) |
| `vitest.config.ts`                          | Node env, pure-logic unit tests (used in Plan 06)             |
| `build.mjs`                                 | esbuild pipeline (code.ts → IIFE, ui.tsx → inline HTML)       |
| `manifest.json`                             | Figma manifest (Supabase-only allowedDomains)                 |
| `src/code.ts`                               | Smoke sandbox entrypoint (opens 360×540 UI, close handler)    |
| `src/ui.tsx`                                | Smoke UI entrypoint ("Hello Maxytest" + Close button)         |
| `src/ui.template.html`                      | HTML shell with `<!--INLINE_JS-->` token for the bundle       |

Subsequent phase-02.2 plans build on this foundation:

- Plan 02 — `publish_prototype_from_plugin` SECURITY DEFINER RPC
- Plan 03 — Web `/auth/plugin-callback` route + Realtime broadcast
- Plan 04 — `FigmaImportDialog` D-06a hint
- Plan 05 — Plugin auth flow (magic-link + Realtime + clientStorage)
- Plan 06 — Pure-logic libs (flow detection, BFS, sha256_16, payload shape)
- Plan 07 — Full import pipeline (flow picker → exportAsync → upload → RPC)
- Plan 08 — Integration + UAT against `AnPMpM9Locu4TGVZjK0emK`
