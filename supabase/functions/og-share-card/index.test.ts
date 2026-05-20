/**
 * Unit tests for og-share-card Edge Function pure-fn surface.
 *
 * Plan 04-07 Task 2. Runs under Node + Vitest (the project's canonical test
 * runner — see CLAUDE.md §7). The Edge Function source file (index.ts)
 * guards its `Deno.serve(...)` call behind `typeof Deno !== 'undefined'`
 * so importing it under Node is side-effect-free; we then exercise the
 * pure exports (isBotUA, escapeHtml, pluralizeOtvet).
 *
 * Coverage focus: behaviors that would silently regress if the Deno copy
 * of BOT_UA_PATTERNS drifted from apps/web/src/lib/share/bot-detection.ts,
 * plus the XSS escape contract (T-04-07-08) and Russian pluralization
 * (CLAUDE.md Russian-first rule).
 *
 * Run from the repo root with:
 *
 *   pnpm exec vitest run --no-file-parallelism \
 *     supabase/functions/og-share-card/index.test.ts \
 *     --root apps/web
 *
 * (or `cd apps/web && pnpm exec vitest run ../../supabase/functions/og-share-card/index.test.ts`).
 *
 * NOTE: This test does NOT exercise the HTTP handler — that would require
 * either a real Supabase instance + secrets OR a heavy mock. The pure-fn
 * coverage here matches the figma-import-worker test-strategy precedent
 * (W-08 workspace-membership gate is unit-tested separately from the full
 * import flow).
 */

import { describe, expect, it } from 'vitest';
// Import from the pure-fn sibling module — NOT from index.ts — because
// index.ts imports `https://esm.sh/@supabase/supabase-js@...` which Node's
// ESM loader rejects. The sibling file holds the canonical Deno copy of the
// BOT_UA_PATTERNS list and the four pure helpers; index.ts re-exports them.
import { isBotUA, escapeHtml, pluralizeOtvet } from './pure';

describe('og-share-card · isBotUA (duplicate-copy invariant)', () => {
  it('returns false for null / undefined / empty', () => {
    expect(isBotUA(null)).toBe(false);
    expect(isBotUA(undefined)).toBe(false);
    expect(isBotUA('')).toBe(false);
  });

  it('returns false for a regular browser UA', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    expect(isBotUA(ua)).toBe(false);
  });

  it.each([
    ['Twitterbot/1.0'],
    ['facebookexternalhit/1.1'],
    ['Facebot'],
    ['LinkedInBot/1.0'],
    ['Slackbot-LinkExpanding 1.0'],
    ['TelegramBot (like TwitterBot)'],
    ['Mozilla/5.0 (compatible; Discordbot/2.0)'],
    ['WhatsApp/2.21.0'],
    ['Mozilla/5.0 (compatible; SkypeUriPreview/0.1)'],
    ['Mozilla/5.0 Pinterest/0.2'],
    ['Mozilla/5.0 (compatible; vkShare; +http://vk.com/dev/Share)'],
    ['Mozilla/5.0 (compatible; redditbot/1.0)'],
    ['Mozilla/5.0 (compatible; Applebot/0.1)'],
    ['http.rb/4.4.1 (Mastodon/4.1.0)'],
    ['Mozilla/5.0 (compatible; Embedly/0.2)'],
    ['Mozilla/5.0 (compatible; Googlebot/2.1)'],
  ])('detects bot UA: %s', (ua) => {
    expect(isBotUA(ua)).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isBotUA('TWITTERBOT/1.0')).toBe(true);
    expect(isBotUA('twitterbot/1.0')).toBe(true);
  });
});

describe('og-share-card · escapeHtml (T-04-07-08 XSS gate)', () => {
  it('escapes all 5 dangerous characters', () => {
    expect(escapeHtml('a&b<c>d"e\'f')).toBe('a&amp;b&lt;c&gt;d&quot;e&#39;f');
  });

  it('leaves Cyrillic and digits untouched', () => {
    expect(escapeHtml('Отчёт 42')).toBe('Отчёт 42');
  });

  it('neutralizes a <script> injection attempt', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('neutralizes an attribute-break attempt', () => {
    // A designer writes ` " /><script>...` into study.title — without escaping
    // this would close the og:title attribute and inject markup.
    expect(escapeHtml('" /><script>x</script>')).toBe('&quot; /&gt;&lt;script&gt;x&lt;/script&gt;');
  });
});

describe('og-share-card · pluralizeOtvet (Russian noun plural)', () => {
  it('1 ответ', () => {
    expect(pluralizeOtvet(1)).toBe('ответ');
  });
  it('2-4 ответа', () => {
    expect(pluralizeOtvet(2)).toBe('ответа');
    expect(pluralizeOtvet(3)).toBe('ответа');
    expect(pluralizeOtvet(4)).toBe('ответа');
  });
  it('0 / 5-10 / 11-14 ответов', () => {
    expect(pluralizeOtvet(0)).toBe('ответов');
    expect(pluralizeOtvet(5)).toBe('ответов');
    expect(pluralizeOtvet(11)).toBe('ответов');
    expect(pluralizeOtvet(12)).toBe('ответов');
    expect(pluralizeOtvet(14)).toBe('ответов');
  });
  it('21 ответ / 22 ответа / 25 ответов', () => {
    expect(pluralizeOtvet(21)).toBe('ответ');
    expect(pluralizeOtvet(22)).toBe('ответа');
    expect(pluralizeOtvet(25)).toBe('ответов');
  });
  it('111-114 ответов (teen-suffix edge)', () => {
    expect(pluralizeOtvet(111)).toBe('ответов');
    expect(pluralizeOtvet(112)).toBe('ответов');
    expect(pluralizeOtvet(114)).toBe('ответов');
  });
});
