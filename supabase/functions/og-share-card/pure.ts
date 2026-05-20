// =============================================================================
// og-share-card · pure-fn helpers
// =============================================================================
//
// Plan 04-07 Task 2. Co-located helpers consumed by index.ts (Edge Function
// handler) AND index.test.ts (Vitest unit tests). Lives in its own module so
// the test file can import these without dragging in the `https://esm.sh/...`
// supabase-js import that breaks Node's ESM loader.
//
// Duplication invariant
//   `BOT_UA_PATTERNS` here is a duplicate of the list in
//   `apps/web/src/lib/share/bot-detection.ts`. When you add / remove a bot
//   pattern in either file, update the other in the same commit.
// =============================================================================

export const BOT_UA_PATTERNS: readonly RegExp[] = [
  /Twitterbot/i,
  /facebookexternalhit/i,
  /Facebot/i,
  /LinkedInBot/i,
  /Slackbot/i,
  /TelegramBot/i,
  /Discordbot/i,
  /WhatsApp/i,
  /Skype/i,
  /Pinterest/i,
  /vkShare/i,
  /redditbot/i,
  /Applebot/i,
  /Mastodon/i,
  /Embedly/i,
  /googlebot/i,
];

export function isBotUA(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return BOT_UA_PATTERNS.some((re) => re.test(userAgent));
}

/**
 * HTML-escape — mitigates T-04-07-08 XSS via title_snapshot. All 5
 * dangerous characters (& < > " ') are replaced with their named / numeric
 * HTML entities before being injected into the OG-meta template.
 */
export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      (
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        }) as Record<string, string>
      )[c]!,
  );
}

/**
 * Russian-plural rule for the «N ответов» counter in the OG description.
 * Maxytest is Russian-first (CLAUDE.md §"Общение с пользователем").
 *
 *   1            → «ответ»
 *   2 / 3 / 4    → «ответа»
 *   0 / 5-10 / 11-14 → «ответов»
 *
 * Edge cases (21 ответ, 22 ответа, 25 ответов, 111-114 ответов) covered
 * by the standard Slavic plural algorithm.
 */
export function pluralizeOtvet(n: number): string {
  const abs = Math.abs(n);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'ответов';
  if (mod10 === 1) return 'ответ';
  if (mod10 >= 2 && mod10 <= 4) return 'ответа';
  return 'ответов';
}

// Token format gate — match the nanoid alphabet (URL-safe base-64 minus
// padding). Keeps obvious garbage from hitting Supabase RPCs.
export const TOKEN_RE = /^[A-Za-z0-9_-]{15,30}$/;
