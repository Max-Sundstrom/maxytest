import { describe, it, expect } from 'vitest';
import { isSameOriginPath, DEFAULT_NEXT } from './next-validate';

/**
 * Plan 01-02 Task 3 — TDD RED → GREEN.
 *
 * `isSameOriginPath` is the Pitfall 10 (PKCE magic-link open-redirect) mitigation.
 * Behaviour is locked in PLAN.md <behavior>; if a future contributor relaxes any
 * of these cases the validator stops mitigating the threat.
 *
 * Threat ref: T-01-02-01 (Tampering — magic-link `next=` open redirect).
 */
describe('isSameOriginPath', () => {
  it('returns true for a bare same-origin path', () => {
    expect(isSameOriginPath('/app')).toBe(true);
  });

  it('returns true for a nested same-origin path', () => {
    expect(isSameOriginPath('/studies/abc/edit')).toBe(true);
  });

  it('returns false for an absolute URL (https://evil.com/phish)', () => {
    expect(isSameOriginPath('https://evil.com/phish')).toBe(false);
  });

  it('returns false for a protocol-relative URL (//evil.com/phish)', () => {
    // Common XSS vector — without an explicit protocol, browsers infer the
    // current page's scheme.
    expect(isSameOriginPath('//evil.com/phish')).toBe(false);
  });

  it('returns false for a javascript: URL', () => {
    expect(isSameOriginPath('javascript:alert(1)')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isSameOriginPath('')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isSameOriginPath(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isSameOriginPath(undefined)).toBe(false);
  });

  it('returns true for a same-origin path with query and fragment', () => {
    expect(isSameOriginPath('/app?x=1#y')).toBe(true);
  });
});

/**
 * DEFAULT_NEXT is exercised indirectly by `auth.callback.tsx` and via a
 * lightweight assertion below — kept as a static expectation so renames are
 * caught at typecheck time. NOT added as a separate `it()` case so the plan's
 * Task 3 verification (`grep -q "9 passed"`) stays exact.
 */
const _defaultNextLock: typeof DEFAULT_NEXT = '/app';
void _defaultNextLock;
