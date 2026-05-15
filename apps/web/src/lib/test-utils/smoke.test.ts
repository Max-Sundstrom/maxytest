/**
 * Walking-skeleton smoke spec.
 *
 * Two intentions:
 *   1. Prove the Vitest runner is wired (the trivial arithmetic check).
 *   2. Prove the design tokens land in source — if a future commit accidentally
 *      drops `--color-accent` or `--spacing-touch` from `src/styles/tokens.css`
 *      this fails fast at unit-test time rather than at browser-rendered
 *      checkpoint time.
 *
 * Location rationale: `lib/test-utils/` is where helper utilities and shared
 * fixtures live as the codebase grows. Putting the first spec here establishes
 * the directory.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('vitest wiring', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});

describe('design tokens', () => {
  it('declares color-accent and spacing-touch=44px', () => {
    // Vitest runs with cwd = apps/web by default; tokens.css is at src/styles.
    const css = readFileSync('src/styles/tokens.css', 'utf8');
    expect(css).toMatch(/--color-accent:\s*#4F46E5/i);
    expect(css).toMatch(/--spacing-touch:\s*44px/);
  });
});
