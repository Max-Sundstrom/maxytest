/**
 * <RunnerProgressBar> — Plan 01-05 Task 3 / UI-SPEC.md §"<RunnerProgressBar>"
 *                      / D-23 / RUNNER-02.
 *
 * Top-of-viewport progress bar; ALWAYS visible (including the thanks screen,
 * which shows a full 100% bar). Position is `fixed top-0 inset-x-0 h-1`
 * (4px) so it does NOT push content. The runner container reserves padding
 * for the bar's height visually but layout-wise the bar is overlaid.
 *
 * Arithmetic (D-23):
 *   - current is the 0-based block index.
 *   - total is blocks.length.
 *   - width = ((current+1) / total) * 100%.
 *   - Welcome (index 0) on a 3-block test → 33%.
 *   - Thanks (index 2) on a 3-block test → 100%.
 *
 * A11y:
 *   - role="progressbar" + aria-valuemin / aria-valuemax / aria-valuenow /
 *     aria-valuetext for SR announcements.
 *   - Motion respects prefers-reduced-motion via Tailwind's motion-safe /
 *     motion-reduce variants. The progress bar is INFORMATIONAL though, so
 *     even with reduced-motion preference we still let the width change —
 *     just without the 200ms transition.
 */

import { cn } from '@/lib/utils';

export interface RunnerProgressBarProps {
  current: number;
  total: number;
  /** Visually-hidden override; defaults to "Block X of Y". */
  label?: string;
  className?: string;
}

export function RunnerProgressBar({ current, total, label, className }: RunnerProgressBarProps) {
  // Defensive: a malformed (current,total) pair shouldn't crash the runner.
  const safeTotal = Math.max(1, total);
  const safeCurrent = Math.min(Math.max(0, current), safeTotal - 1);
  const pct = ((safeCurrent + 1) / safeTotal) * 100;

  const valueText = label ?? `Block ${safeCurrent + 1} of ${safeTotal}`;

  return (
    <div
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={safeTotal}
      aria-valuenow={safeCurrent + 1}
      aria-valuetext={valueText}
      className={cn('fixed top-0 inset-x-0 h-1 bg-slate-100 z-50', className)}
    >
      <div
        className="h-full bg-accent motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-linear motion-reduce:transition-none"
        style={{ width: `${pct}%` }}
        aria-hidden="true"
      />
    </div>
  );
}
