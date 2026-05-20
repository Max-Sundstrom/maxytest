/**
 * `/share/$token` — anonymous public-share entry point.
 *
 * Plan 04-07 Task 6. File-route under the `_public` pathless layout (so
 * the URL is `/share/<token>`, not `/_public/share/<token>`).
 *
 * Loader contract:
 *   1. Validate the token shape with Zod (matches the nanoid alphabet —
 *    same regex as the Edge Function in supabase/functions/og-share-card).
 *   2. Call `read_share_report(token)` via `supabaseAnon` (anon-RPC defined
 *      in migration 00020 — returns NULL for missing/inactive tokens).
 *   3. NULL → `redirect({ to: '/share/gone' })`. PublicReportShell re-fetches
 *      the same RPC via TanStack Query for cache integration; the loader's
 *      call is the route-level existence gate.
 *   4. Otherwise, extract `title` + `open_answer_visibility` from the blob
 *      and pass them to PublicReportShell as static loader data.
 *
 * Two-Supabase-client boundary (Plan 04-07 Task 3): `supabaseAnon` only.
 * The pre-existing ESLint rule on `src/routes/_public.**` enforces this
 * statically.
 *
 * `head()` emits `<meta name="robots" content="noindex,nofollow">` so
 * search engines never index a share URL even if a designer accidentally
 * publishes it publicly.
 */

import { createFileRoute, redirect, useLoaderData } from '@tanstack/react-router';
import { z } from 'zod';
import { supabaseAnon } from '@/lib/supabase/anon';
import { PublicReportShell } from '@/components/public/PublicReportShell';

// Token format gate — matches nanoid URL-safe base-64 alphabet. Same shape
// as supabase/functions/og-share-card/pure.ts TOKEN_RE.
const tokenSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{15,30}$/) });

export const Route = createFileRoute('/_public/share/$token')({
  params: {
    parse: (raw) => tokenSchema.parse(raw),
  },
  loader: async ({ params }) => {
    const { data, error } = await supabaseAnon.rpc(
      'read_share_report' as never,
      { p_token: params.token } as never,
    );
    if (error || !data) {
      throw redirect({ to: '/share/gone' });
    }
    const blob = data as {
      title: string | null;
      open_answer_visibility: Record<string, boolean> | null;
    };
    return {
      token: params.token,
      titleFromLoader: blob.title ?? null,
      openAnswerVisibility: blob.open_answer_visibility ?? {},
    };
  },
  component: PublicShareRoute,
  head: () => ({
    meta: [
      // T-04-07 / D-104 — never indexable.
      { name: 'robots', content: 'noindex,nofollow' },
    ],
  }),
});

function PublicShareRoute() {
  const { token, titleFromLoader } = useLoaderData({ from: '/_public/share/$token' });
  return <PublicReportShell token={token} titleFromLoader={titleFromLoader} />;
}
