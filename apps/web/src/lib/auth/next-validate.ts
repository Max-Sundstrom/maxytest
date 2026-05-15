/**
 * Pitfall 10 mitigation — magic-link `next=` open-redirect guard.
 *
 * Returns true ONLY for same-origin paths that are safe to feed to
 * TanStack Router's `navigate({ to })`. Used by `auth.callback.tsx` after
 * Supabase exchanges the PKCE code for a session, and by any other surface
 * that consumes a user-controlled redirect target.
 *
 * Threat ref: T-01-02-01 (Tampering — magic-link `next=` open redirect).
 *
 * Locked behaviour (do NOT relax without re-reading Pitfall 10):
 *   - input must be a string starting with '/'
 *   - protocol-relative URLs ('//evil.com/...') are rejected — without a
 *     scheme the browser inherits the current page's protocol, which lets
 *     attackers phish via crafted email URLs
 *   - any string containing '://' is rejected (absolute URL)
 *   - any string matching `<scheme>:` (e.g. 'javascript:', 'data:') is rejected
 *   - empty strings, null, and undefined return false
 *
 * The accompanying `DEFAULT_NEXT` constant is the safe fallback the callback
 * route navigates to whenever validation fails.
 */
export function isSameOriginPath(next: unknown): next is string {
  if (typeof next !== 'string') return false;
  if (next === '') return false;
  if (!next.startsWith('/')) return false;
  if (next.startsWith('//')) return false; // protocol-relative URL
  if (next.includes('://')) return false; // absolute URL
  if (/^[a-zA-Z]+:/.test(next)) return false; // javascript: / data: / mailto: etc.
  return true;
}

/** Safe redirect target when `next=` is missing or fails validation. */
export const DEFAULT_NEXT = '/app';
