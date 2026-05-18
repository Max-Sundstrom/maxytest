/**
 * <DateRangeControl /> — sidebar trigger button + calendar popover composition.
 *
 * Plan 03.1-02 (GA1 / D-71). Replaces the decorative `<SelectInput>Всё время</SelectInput>`
 * in `ReportSidebar.tsx` with a real date filter:
 *
 *   1. The trigger button visually matches the existing 32px-tall `<SelectInput>`
 *      (background `var(--bg-input)`, border `var(--border-1)`, font
 *      `var(--font-sans)` 13.5px, chevron-down on the right).
 *   2. Clicking it opens a Popover. The popover content shows:
 *        - LEFT — vertical stack of 5 preset buttons (32px each, full-width).
 *        - RIGHT (only when `'custom'` is the active preset) — `<Calendar mode="range">`
 *          with `numberOfMonths={2}`.
 *   3. Picking any non-custom preset fires `onChange(range, preset)` and closes
 *      the popover.
 *   4. Picking a custom range: once both `from` and `to` are set the component
 *      fires `onChange(presetToRange('custom', from, to), 'custom')` and closes.
 *
 * State model:
 *   - `value` + `preset` are owned by the consumer (`ReportShell`). Re-mounts
 *     don't lose them.
 *   - Internal `customStart` / `customEnd` are draft state used only while the
 *     user is composing a custom range; resetting the popover (closing without
 *     finishing) keeps them so re-opening shows the same draft.
 *   - `open` is controlled locally so we can close the popover programmatically
 *     after a preset is chosen.
 *
 * Accessibility:
 *   - `aria-label="Выбрать период"` on the trigger (Russian — matches sidebar
 *     copy convention).
 *   - Popover keyboard nav handled by Radix (`PopoverPrimitive`).
 *   - Calendar keyboard nav handled by react-day-picker (`<Calendar>`).
 *   - `prefers-reduced-motion` honored by both Radix Popover (no slide) and
 *     react-day-picker (no transition between months).
 *
 * Theming:
 *   - CSS vars only. Hex-literal grep returns 0 across this file.
 *   - Custom-range trigger label uses `var(--font-mono)` for the date portion
 *     (handoff-v1 mono convention for tabular data).
 */

import { useState, type CSSProperties } from 'react';

import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  formatRangeRu,
  presetToRange,
  type DatePreset,
  type DateRange,
} from '@/lib/analytics/date-range';

export interface DateRangeControlProps {
  value: DateRange;
  preset: DatePreset;
  onChange: (range: DateRange, preset: DatePreset) => void;
}

// Static preset definitions — order matches the visual stack in the popover.
const PRESETS: ReadonlyArray<{ key: DatePreset; label: string }> = [
  { key: 'all', label: 'Всё время' },
  { key: 'today', label: 'Сегодня' },
  { key: 'last7', label: 'Последние 7 дней' },
  { key: 'last30', label: 'Последние 30 дней' },
  { key: 'custom', label: 'Произвольный период' },
];

export function DateRangeControl({ value, preset, onChange }: DateRangeControlProps) {
  const [open, setOpen] = useState(false);

  // Draft state used only when the user is composing a `'custom'` range. We keep
  // it in sync with the `value` so re-opening the popover (after a previous
  // custom pick) shows the same dates highlighted on the calendar.
  const [customStart, setCustomStart] = useState<Date | null>(() =>
    preset === 'custom' && value ? new Date(value.startISO) : null,
  );
  const [customEnd, setCustomEnd] = useState<Date | null>(() =>
    preset === 'custom' && value ? new Date(value.endISO) : null,
  );

  const label = formatRangeRu(value, preset);
  const isCustom = preset === 'custom';
  // Mono font for the dd.MM.yyyy → dd.MM.yyyy pattern only (when both ends are picked).
  const labelIsDateRange = isCustom && value !== null;

  function pickPreset(p: DatePreset) {
    if (p === 'custom') {
      // Switching to custom mode does NOT close the popover — the user still
      // needs to pick dates. If there is already a saved custom range, fire
      // `onChange` so the consumer keeps the same range while we show the
      // calendar; otherwise just update the preset and leave the filter
      // disabled until the user finishes picking.
      const draft = presetToRange('custom', customStart, customEnd);
      onChange(draft, 'custom');
      return;
    }
    onChange(presetToRange(p), p);
    setOpen(false);
  }

  function handleRangeSelect(range: { from?: Date; to?: Date } | undefined) {
    const from = range?.from ?? null;
    const to = range?.to ?? null;
    setCustomStart(from);
    setCustomEnd(to);
    if (from && to) {
      onChange(presetToRange('custom', from, to), 'custom');
      setOpen(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Выбрать период" style={triggerStyle}>
          <span style={labelIsDateRange ? labelMonoStyle : labelSansStyle}>{label}</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={4}
        style={{
          minWidth: isCustom ? 560 : 240,
          display: 'flex',
          gap: 8,
          padding: 8,
        }}
      >
        {/* LEFT — preset stack */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            minWidth: 200,
          }}
        >
          {PRESETS.map((p) => {
            const active = preset === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => pickPreset(p.key)}
                style={{
                  height: 32,
                  padding: '0 10px',
                  display: 'flex',
                  alignItems: 'center',
                  background: active ? 'var(--bg-chip)' : 'transparent',
                  border: 0,
                  borderRadius: 'var(--radius)',
                  font: '400 13px var(--font-sans)',
                  color: 'var(--text-1)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 120ms cubic-bezier(.2,.7,.3,1)',
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = 'var(--bg-chip)';
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = 'transparent';
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* RIGHT — calendar (only when `custom`) */}
        {isCustom ? (
          <div
            style={{
              borderLeft: '1px solid var(--border-1)',
              paddingLeft: 8,
            }}
          >
            <Calendar
              mode="range"
              numberOfMonths={2}
              selected={{ from: customStart ?? undefined, to: customEnd ?? undefined }}
              onSelect={handleRangeSelect}
            />
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────

const triggerStyle: CSSProperties = {
  height: 32,
  width: '100%',
  padding: '0 12px',
  background: 'var(--bg-input)',
  border: '1px solid var(--border-1)',
  borderRadius: 'var(--radius)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  color: 'var(--text-1)',
  cursor: 'pointer',
  font: '400 13.5px var(--font-sans)',
};

const labelSansStyle: CSSProperties = {
  font: '400 13.5px var(--font-sans)',
  color: 'var(--text-1)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const labelMonoStyle: CSSProperties = {
  font: '500 12.5px var(--font-mono)',
  color: 'var(--text-1)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
