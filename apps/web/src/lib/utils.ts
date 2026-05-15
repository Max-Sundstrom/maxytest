import { useEffect, useState } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * shadcn `cn` helper — combines clsx + tailwind-merge so conflicting
 * Tailwind classes (`p-2 p-4`) are deduped to the last-applied value.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * `formatRelativeTime(date)` — UI-SPEC.md §Copy Lock autosave row.
 *
 * - <60s     → "{N}s ago"
 * - <60m     → "{N}m ago"
 * - >=1h     → "Saved" (the caller prepends "Saved " for the <60s/<60m cases)
 *
 * Plan 01-03 SaveStateIndicator passes the returned string verbatim after
 * "Saved " for the saved state. The "Saved" return (long-ago case) means the
 * indicator just shows "Saved" without a suffix.
 */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) {
    return `${diffSec}s ago`;
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }
  // After 1h drop the precision — UI-SPEC: "after 1 hour drops to 'Saved' only".
  return 'Saved';
}

/**
 * `useDebouncedValue(value, ms)` — returns `value` after it has stayed unchanged
 * for `ms`. Used by every block editor to coalesce rapid keystrokes into a
 * single autosave fire (700ms per D-13).
 */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/**
 * `useMediaQuery(query)` — true when `window.matchMedia(query).matches`. Used
 * by `<BuilderShell>` to switch to `<MobileBuilderBlocked>` below 1024px.
 *
 * SSR-safe: returns `false` during the first render pass (no `window`).
 */
export function useMediaQuery(query: string): boolean {
  const getMatch = (): boolean => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  };
  const [matches, setMatches] = useState<boolean>(getMatch);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    // Sync state on mount in case the initial getMatch ran during SSR.
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    // `addEventListener('change', ...)` is the modern API; the older
    // `addListener` is deprecated but still on Safari 13 — we target Safari 16+
    // per STACK.md so this is safe.
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
