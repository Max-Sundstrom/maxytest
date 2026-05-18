/**
 * `date-range.ts` — pure preset → ISO-range helper for the report DatePicker.
 *
 * Plan: 03.1-sidebar-wiring / 03.1-02 / Task 1.
 *
 * Mirrors the `Plan 03.1-02` data-layer pattern from CONTEXT.md GA1 / D-71:
 * the report sidebar exposes 4 named presets plus a custom range; downstream
 * `useBlockEvents` and `useDesignerSessions` translate the returned `DateRange`
 * tuple to `client_ts BETWEEN startISO AND endISO` / `started_at BETWEEN ...`
 * Supabase predicates. A `null` `DateRange` means «Всё время» (no filter).
 *
 * Timezone semantics:
 *   - `startOfDay` / `endOfDay` from `date-fns` operate in the local timezone
 *     of the running JS environment (the designer's browser). The resulting
 *     `Date` object is then serialised via `.toISOString()` which always
 *     produces a UTC string — Supabase compares its `timestamptz` columns
 *     against the UTC instant, so a designer in UTC+3 picking "today" gets
 *     midnight-to-midnight in their local time correctly normalised to UTC.
 *   - The test harness pins `process.env.TZ = 'UTC'` (see the matching
 *     `__tests__/date-range.test.ts` for the choice + rationale), so the
 *     fixtures assert exact UTC-midnight ISO strings.
 *
 * Trust boundary: pure. No React, no Supabase, no DOM, no clock except the
 * injectable `now` parameter (defaults to `new Date()` for the production
 * call site).
 */

import { startOfDay, endOfDay, subDays, format } from 'date-fns';

/**
 * The 4 sidebar shortcuts + the «Произвольный период» (custom) variant.
 * Driven by CONTEXT.md GA1 §"Presets list".
 */
export type DatePreset = 'all' | 'today' | 'last7' | 'last30' | 'custom';

/**
 * A closed-interval ISO range, or `null` for «no filter applied».
 *
 * `null` is the explicit «Всё время» state — the call site short-circuits the
 * `.gte` / `.lte` predicate chaining when it sees `null`, so the query reads
 * the entire RLS-filtered row set.
 */
export type DateRange = { startISO: string; endISO: string } | null;

/**
 * Translate a preset (+ optional custom dates) to the inclusive ISO tuple
 * that `useBlockEvents` / `useDesignerSessions` feed to Supabase.
 *
 * @param preset      The chosen preset key.
 * @param customStart Required (in pair with `customEnd`) when `preset === 'custom'`.
 * @param customEnd   Required (in pair with `customStart`) when `preset === 'custom'`.
 * @param now         Injectable "current time" (defaults to `new Date()`).
 *
 * Behaviour:
 *  - `'all'`     → `null` (no filter).
 *  - `'today'`   → start-of-today to end-of-today.
 *  - `'last7'`   → start-of-(today − 6) to end-of-today (inclusive 7-day window).
 *  - `'last30'`  → start-of-(today − 29) to end-of-today (inclusive 30-day window).
 *  - `'custom'`  → `{ startISO, endISO }` derived from `customStart` / `customEnd`.
 *                  Returns `null` when either is missing (UI placeholder state).
 *                  Silently swaps the pair when `customStart > customEnd` so a
 *                  user picking dates in reverse order doesn't produce an empty
 *                  filter accidentally.
 */
export function presetToRange(
  preset: DatePreset,
  customStart?: Date | null,
  customEnd?: Date | null,
  now: Date = new Date(),
): DateRange {
  switch (preset) {
    case 'all':
      return null;

    case 'today':
      return {
        startISO: startOfDay(now).toISOString(),
        endISO: endOfDay(now).toISOString(),
      };

    case 'last7':
      return {
        startISO: startOfDay(subDays(now, 6)).toISOString(),
        endISO: endOfDay(now).toISOString(),
      };

    case 'last30':
      return {
        startISO: startOfDay(subDays(now, 29)).toISOString(),
        endISO: endOfDay(now).toISOString(),
      };

    case 'custom': {
      if (!customStart || !customEnd) {
        return null;
      }
      // Swap when the user picked end-before-start. This keeps the resulting
      // range non-empty for both human input orders and avoids a confusing
      // "filter returned 0 rows" state.
      const [lo, hi] =
        customStart.getTime() <= customEnd.getTime()
          ? [customStart, customEnd]
          : [customEnd, customStart];
      return {
        startISO: startOfDay(lo).toISOString(),
        endISO: endOfDay(hi).toISOString(),
      };
    }
  }
}

/**
 * Russian-language label for the trigger button + screen-reader text.
 *
 * For the 4 named presets the function returns a stable phrase regardless of
 * the `range` argument (the trigger label MUST match the preset name the user
 * picked — even if the resulting range happens to overlap with another).
 *
 * For `'custom'`:
 *  - with a non-null `range` → `'dd.MM.yyyy → dd.MM.yyyy'` (IBM Plex Mono in
 *    the call site).
 *  - with a null `range` → `'Произвольный период'` (placeholder while the
 *    designer is still picking dates).
 */
export function formatRangeRu(range: DateRange, preset: DatePreset): string {
  switch (preset) {
    case 'all':
      return 'Всё время';
    case 'today':
      return 'Сегодня';
    case 'last7':
      return 'Последние 7 дней';
    case 'last30':
      return 'Последние 30 дней';
    case 'custom': {
      if (!range) return 'Произвольный период';
      const start = format(new Date(range.startISO), 'dd.MM.yyyy');
      const end = format(new Date(range.endISO), 'dd.MM.yyyy');
      return `${start} → ${end}`;
    }
  }
}
