# Maxytest

Веб-платформа для удалённых UX-исследований и количественного тестирования
Figma-прототипов. Maze-class self-hostable alternative.

> The polished README ships with **Phase 8 (DIST-04)**. This file is a
> Phase 1 placeholder — short, honest, points at the install docs.

---

## Try in 60 seconds

Cloud install on the free tier (Supabase Cloud + Cloudflare Pages):

→ **[docs/INSTALL_CLOUD.md](./docs/INSTALL_CLOUD.md)**

Want to host everything yourself? See
[docs/INSTALL_SELFHOST.md](./docs/INSTALL_SELFHOST.md). Phase 8 ships the
polished single-Docker self-host story.

---

## What this is

Maxytest is a remote UX research platform built around one core value:

> A designer sees not just *what* respondents answered, but *how* they
> actually behaved on the prototype — where they clicked, where they got
> stuck, where they didn't get to. The test becomes a real usability
> research tool, not just a survey.

Target users: product/UX designers, freelance researchers, design students,
PMs validating hypotheses. Respondents: the general public on mobile
devices (~80% of traffic), no required signup.

---

## Stack (Phase 1)

| Layer | Choice |
|---|---|
| Build / dev server | Vite 7 |
| UI | React 19 + TypeScript strict |
| Routing | TanStack Router (file-based, type-safe) |
| Server state | TanStack Query |
| Local UI state | Zustand + zundo (undo/redo) |
| Styles | Tailwind CSS v4 (CSS-first, OKLCH) |
| UI primitives | shadcn/ui (Radix under the hood) |
| Forms + validation | react-hook-form + Zod |
| Drag-and-drop | @dnd-kit |
| PWA | vite-plugin-pwa (Workbox) |
| Backend (DB + Auth + Storage) | Supabase (Postgres 15+ + RLS + RPC + Storage) |
| Async jobs | Supabase Edge Functions (Deno) |
| Cloud deploy | Cloudflare Pages (front) + Supabase Cloud (back) |
| Self-host | Docker Compose (Phase 8) |
| Tests | Vitest + Playwright + @axe-core/playwright + supabase-js test client |

Full rationale lives in `.planning/research/STACK.md`.

---

## Development quickstart

```bash
pnpm install --frozen-lockfile
pnpm --filter @maxytest/web dev
# → http://localhost:5173
```

You will need a Supabase project. See
[docs/INSTALL_CLOUD.md](./docs/INSTALL_CLOUD.md) Steps 1-3 for the full
setup.

### Common commands

```bash
pnpm -r lint          # ESLint across workspace
pnpm -r typecheck     # tsc --noEmit
pnpm -r test          # vitest (unit + RLS) — serial via --no-file-parallelism
pnpm --filter @maxytest/web build       # production build → apps/web/dist
pnpm --filter @maxytest/web e2e         # Playwright E2E (needs preview server)
pnpm --filter @maxytest/web e2e:install # install Playwright browsers first
pnpm format                             # Prettier write
```

---

## Repo layout (Phase 1)

```
.
├── apps/web/              Vite SPA, all Phase 1 code lives here
│   ├── src/
│   ├── tests/rls/         supabase-js RLS suite (36 cases)
│   └── tests/e2e/         Playwright E2E (13 cases × 3 device projects)
├── supabase/
│   ├── migrations/        SQL — 00001..00006 ship in Phase 1
│   └── functions/         Edge Functions (Deno)
├── docs/                  Install + operator docs
├── .planning/             Planning artefacts (PRD, research, plans, state)
└── .github/workflows/     CI + deploy stubs
```

Workspace decomposes incrementally — `packages/blocks` lands in Phase 2,
`packages/templates` in Phase 6. See `.planning/research/STACK.md` §5.

---

## Status

| Phase | Description | Status |
|---|---|---|
| 1 | Walking skeleton (auth, builder, runner, lifecycle) | In progress (this branch) |
| 2 | Flagship prototype block + heatmap (Figma plugin import) | Not started |
| 3 | Prototype analytics depth | Not started |
| 4 | Survey blocks v1 + reports | Not started |
| 5 | Runner robustness + PWA | Not started |
| 6 | Team collaboration | Not started |
| 7 | Specialised formats + Figma plugin | Not started |
| 8 | Polish + self-host | Not started |

Per-phase plans live under `.planning/phases/`.

---

## License

License: TBD. To be decided in Phase 8.
