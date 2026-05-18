/**
 * <Calendar /> — react-day-picker v10 wrapper themed via CSS custom-properties.
 *
 * Plan 03.1-02 — first consumer is `DateRangeControl` (report sidebar). The
 * wrapper centralises the locale (`ru` from `date-fns`) and the theme overrides
 * so any future date-picker site (e.g. response export window selection) gets
 * the design-token surfaces «for free».
 *
 * Theming approach:
 *   - We import the upstream stylesheet (`react-day-picker/style.css`) — its
 *     selectors are scoped under the `.rdp` class so they cannot leak.
 *   - We then override the colour-sensitive class names through the `classNames`
 *     prop, pointing each at Tailwind utilities that consume CSS vars
 *     (`bg-[var(--bg-chip)]`, `text-[var(--text-1)]`, etc.). NO hex literals.
 *   - The grid / spacing / font remain on upstream defaults — they already
 *     match the handoff-v1 scale (32px cells, 14px label font).
 *
 * The exported props type forwards every prop the underlying `DayPicker`
 * accepts, so callers can pass `mode="range"`, `selected={...}`,
 * `onSelect={...}`, `numberOfMonths={2}`, etc.
 *
 * Accessibility:
 *   - `react-day-picker` ships its own ARIA grid semantics + keyboard nav
 *     (arrow keys, PageUp/Down, Home/End) — we don't override those.
 *   - Russian locale: month / weekday names + ARIA labels.
 */

import { DayPicker } from 'react-day-picker';
import { ru } from 'date-fns/locale/ru';
import 'react-day-picker/style.css';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({ classNames, ...props }: CalendarProps) {
  return (
    <DayPicker
      locale={ru}
      classNames={{
        // The root + month / weekday surfaces.
        root: 'rdp text-[var(--text-1)] font-[var(--font-sans)]',
        months: 'flex gap-4',
        month: 'space-y-2',
        caption_label: 'text-[var(--text-1)] font-medium',
        nav: 'flex items-center gap-1',
        button_previous: 'text-[var(--text-2)] hover:text-[var(--text-1)]',
        button_next: 'text-[var(--text-2)] hover:text-[var(--text-1)]',
        weekday: 'text-[var(--text-3)] font-normal',
        // Day surfaces (per UI / DayFlag / SelectionState enums).
        day: 'text-[var(--text-1)]',
        today: 'font-semibold text-[var(--color-accent)]',
        outside: 'text-[var(--text-3)] opacity-50',
        disabled: 'text-[var(--text-3)] opacity-40 cursor-not-allowed',
        selected:
          'bg-[var(--color-accent)] text-[var(--text-on-accent)] rounded-[var(--radius-sm)]',
        range_start:
          'bg-[var(--color-accent)] text-[var(--text-on-accent)] rounded-l-[var(--radius-sm)]',
        range_end:
          'bg-[var(--color-accent)] text-[var(--text-on-accent)] rounded-r-[var(--radius-sm)]',
        range_middle: 'bg-[var(--bg-chip)] text-[var(--text-1)]',
        // Allow the caller to extend / override.
        ...classNames,
      }}
      {...props}
    />
  );
}
