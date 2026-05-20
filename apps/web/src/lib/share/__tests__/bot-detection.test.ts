/**
 * Vitest unit tests for `apps/web/src/lib/share/bot-detection.ts`.
 *
 * Plan 04-07 Task 1 (TDD RED → GREEN).
 *
 * Coverage:
 *   - Null / undefined / empty-string short-circuit to `false`.
 *   - Regular browser UA strings → `false`.
 *   - All bot UA patterns from RESEARCH.md §"Pattern 7.3" lines 880-896:
 *     Twitterbot, facebookexternalhit, Facebot, LinkedInBot, Slackbot,
 *     TelegramBot, Discordbot, WhatsApp, Skype, Pinterest, vkShare,
 *     redditbot, Applebot, Mastodon, Embedly, googlebot.
 *   - Case-insensitive match (re-flag `i`).
 */
import { describe, expect, it } from 'vitest';
import { BOT_UA_PATTERNS, isBotUA } from '../bot-detection';

describe('isBotUA — null/undefined/empty short-circuit', () => {
  it('returns false for null', () => {
    expect(isBotUA(null)).toBe(false);
  });
  it('returns false for undefined', () => {
    expect(isBotUA(undefined)).toBe(false);
  });
  it('returns false for empty string', () => {
    expect(isBotUA('')).toBe(false);
  });
});

describe('isBotUA — regular browser UA strings', () => {
  it('returns false for Chrome on macOS', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    expect(isBotUA(ua)).toBe(false);
  });
  it('returns false for Safari on iOS', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    expect(isBotUA(ua)).toBe(false);
  });
});

describe('isBotUA — bot patterns', () => {
  it('detects Twitterbot/1.0', () => {
    expect(isBotUA('Twitterbot/1.0')).toBe(true);
  });
  it('detects facebookexternalhit/1.1', () => {
    expect(isBotUA('facebookexternalhit/1.1')).toBe(true);
  });
  it('detects Facebot', () => {
    expect(isBotUA('Facebot')).toBe(true);
  });
  it('detects LinkedInBot/1.0', () => {
    expect(isBotUA('LinkedInBot/1.0 (compatible; Mozilla/5.0; +https://www.linkedin.com)')).toBe(
      true,
    );
  });
  it('detects Slackbot-LinkExpanding 1.0', () => {
    expect(isBotUA('Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)')).toBe(true);
  });
  it('detects TelegramBot inside a compatible UA', () => {
    expect(isBotUA('TelegramBot (like TwitterBot)')).toBe(true);
  });
  it('detects Discordbot embedded in a Mozilla UA', () => {
    expect(isBotUA('Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)')).toBe(true);
  });
  it('detects WhatsApp', () => {
    expect(isBotUA('WhatsApp/2.21.0')).toBe(true);
  });
  it('detects Skype', () => {
    expect(isBotUA('Mozilla/5.0 (compatible; SkypeUriPreview/0.1)')).toBe(true);
  });
  it('detects Pinterest', () => {
    expect(isBotUA('Mozilla/5.0 Pinterest/0.2')).toBe(true);
  });
  it('detects vkShare', () => {
    expect(isBotUA('Mozilla/5.0 (compatible; vkShare; +http://vk.com/dev/Share)')).toBe(true);
  });
  it('detects redditbot', () => {
    expect(
      isBotUA('Mozilla/5.0 (compatible; redditbot/1.0; +http://www.reddit.com/feedback)'),
    ).toBe(true);
  });
  it('detects Applebot', () => {
    expect(
      isBotUA('Mozilla/5.0 (compatible; Applebot/0.1; +http://www.apple.com/go/applebot)'),
    ).toBe(true);
  });
  it('detects Mastodon link-preview crawler', () => {
    expect(isBotUA('http.rb/4.4.1 (Mastodon/4.1.0; +https://mastodon.social/)')).toBe(true);
  });
  it('detects Embedly', () => {
    expect(isBotUA('Mozilla/5.0 (compatible; Embedly/0.2; +http://support.embed.ly/)')).toBe(true);
  });
  it('detects googlebot (case-insensitive)', () => {
    expect(
      isBotUA('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'),
    ).toBe(true);
  });
});

describe('isBotUA — case-insensitive', () => {
  it('treats uppercase TWITTERBOT as a bot', () => {
    expect(isBotUA('TWITTERBOT/1.0')).toBe(true);
  });
  it('treats lowercase twitterbot as a bot', () => {
    expect(isBotUA('twitterbot/1.0')).toBe(true);
  });
});

describe('BOT_UA_PATTERNS export', () => {
  it('exposes 16 patterns matching RESEARCH.md §7.3', () => {
    expect(BOT_UA_PATTERNS).toHaveLength(16);
  });
  it('each pattern is a RegExp with /i flag', () => {
    for (const re of BOT_UA_PATTERNS) {
      expect(re).toBeInstanceOf(RegExp);
      expect(re.flags).toContain('i');
    }
  });
});
