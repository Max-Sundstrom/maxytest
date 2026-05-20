/**
 * Bot User-Agent detection — pure function consumed by the public-share
 * Edge Function (Plan 04-07 Task 2) to decide between «return OG-meta HTML»
 * (bot path) and «302 redirect to SPA fallback» (human path).
 *
 * Source: RESEARCH.md §"Pattern 7.3" lines 880-896.
 *
 * Duplication invariant
 * ─────────────────────
 * The same `BOT_UA_PATTERNS` list is duplicated in
 * `supabase/functions/og-share-card/index.ts` because the Deno Edge Function
 * runtime cannot import from `apps/web/src/`. When you add / remove a bot
 * pattern here, update the other file in lockstep — both files cross-link
 * each other in their header comment.
 *
 * Behavior
 * ────────
 * - `isBotUA(null | undefined | '')` returns `false` (no UA → treat as human
 *   so the route doesn't accidentally serve OG HTML to a fetch without UA).
 * - Otherwise, `Array.some(re => re.test(ua))` against the 16 patterns.
 *   Patterns carry the `/i` flag so `TWITTERBOT` / `twitterbot` both match.
 */

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
