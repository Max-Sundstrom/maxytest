// =============================================================================
// og-share-card — Supabase Edge Function (Deno)
// =============================================================================
//
// Plan: 04-survey-blocks-v1 / 04-07 / Task 2.
// Phase 4 REPORT-06 + CONTEXT.md D-104.
//
// What this does
//   Routes every `/share/{token}` request that the Cloudflare Pages
//   `_redirects` rule forwards here. The decision is User-Agent-based:
//
//     - **Bot UA** (Twitterbot, Slackbot, Discordbot, …) → respond
//       200 + minimal HTML containing OpenGraph + Twitter Card meta tags
//       (og:title = title_snapshot, og:description = "N ответов · Отчёт
//       Maxytest", og:image = static PNG) + `x-robots-tag: noindex,nofollow`
//       header so search engines never index the share URL.
//     - **Human UA** → 302 redirect to `${PUBLIC_BASE_URL}/share/{token}?fallback=1`.
//       The Cloudflare Pages SPA index.html serves at root, TanStack Router
//       picks up `/share/{token}` and PublicReportShell mounts.
//
//   Inactive / unknown token → 410 Gone. This branch is hit BEFORE the bot
//   check so revoked links don't leak title_snapshot.
//
// Deploy
//   Dashboard manual deploy with `Verify JWT` = OFF (mirrors
//   hard_delete_archived_studies). ENV vars required:
//     - SUPABASE_URL              (set in Phase 2)
//     - SUPABASE_SERVICE_ROLE_KEY (set in Phase 2)
//     - PUBLIC_BASE_URL           (new — Cloudflare Pages URL or custom domain)
//
// Duplication invariant
//   `BOT_UA_PATTERNS` / `isBotUA` / `escapeHtml` / `pluralizeOtvet` live in
//   `./pure.ts` so index.test.ts (Vitest under Node) can import them without
//   pulling in the `https://esm.sh/...` supabase-js import. The web-tier
//   copy is `apps/web/src/lib/share/bot-detection.ts`. Update all three
//   files in lockstep when adjusting bot patterns.
//
// Threat model (Plan 04-07 §<threat_model>)
//   T-04-07-01 — token format gate via `TOKEN_RE` before touching Supabase.
//   T-04-07-08 — XSS via title_snapshot mitigated by `escapeHtml(...)`
//                on title + description before HTML template injection.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.105.4';
import { isBotUA, escapeHtml, pluralizeOtvet, TOKEN_RE } from './pure.ts';

// Re-export so existing import sites (e.g. index.test.ts pre-refactor) work.
export { isBotUA, escapeHtml, pluralizeOtvet, TOKEN_RE };

// Deno typings — declared loosely so the file is import-safe under Node.
declare const Deno:
  | {
      serve: (handler: (req: Request) => Promise<Response>) => unknown;
      env: { get(name: string): string | undefined };
    }
  | undefined;

if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
  Deno.serve(async (req: Request): Promise<Response> => {
    const supabaseUrl = Deno!.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno!.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const publicBase = Deno!.env.get('PUBLIC_BASE_URL') ?? '';

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response('configuration_missing', { status: 500 });
    }

    const url = new URL(req.url);
    const token = url.pathname.split('/').filter(Boolean).pop();
    if (!token || !TOKEN_RE.test(token)) {
      return new Response('Not found', { status: 404 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // read_share_report returns a jsonb blob OR NULL when token is
    // inactive/unknown. We use it as the existence-check (also gives us
    // title_snapshot in one round-trip).
    const { data: blob } = await supabase.rpc('read_share_report', { p_token: token });
    if (!blob) {
      return new Response('Gone', { status: 410 });
    }

    const ua = req.headers.get('user-agent');
    if (!isBotUA(ua)) {
      // Human — redirect to SPA fallback URL.
      return Response.redirect(`${publicBase}/share/${token}?fallback=1`, 302);
    }

    // Bot — count completed sessions for the description tile.
    const { data: countRaw } = await supabase.rpc('count_share_responses', { p_token: token });
    const n = typeof countRaw === 'number' ? countRaw : Number(countRaw ?? 0);

    const title = ((blob as { title?: string }).title ?? '').trim() || 'Отчёт Maxytest';
    const description = `${n} ${pluralizeOtvet(n)} · Отчёт Maxytest`;
    const ogImage = `${publicBase}/og-share-baseline.png`;

    const html =
      `<!DOCTYPE html>\n<html lang="ru">\n<head>\n` +
      `<meta charset="utf-8" />\n` +
      `<meta name="robots" content="noindex,nofollow" />\n` +
      `<title>${escapeHtml(title)}</title>\n` +
      `<meta property="og:title" content="${escapeHtml(title)}" />\n` +
      `<meta property="og:description" content="${escapeHtml(description)}" />\n` +
      `<meta property="og:image" content="${ogImage}" />\n` +
      `<meta property="og:type" content="website" />\n` +
      `<meta name="twitter:card" content="summary_large_image" />\n` +
      `</head>\n<body></body>\n</html>\n`;

    return new Response(html, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'x-robots-tag': 'noindex,nofollow',
        'cache-control': 'public, max-age=300',
      },
    });
  });
}
