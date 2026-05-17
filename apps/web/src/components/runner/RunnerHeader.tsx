/**
 * <RunnerHeader /> — design-system v1 sticky header for the respondent runner.
 *
 * Source: design-system handoff `js/maxitest-runner.jsx` <RunnerHeader />
 * + index.html `.rr-header / .rr-logo-mini / .rr-progress / .rr-close` rules.
 *
 *   [28×28 mini-M-logo] [progress 5px track + filled fill + "step / total" mono]
 *                                                                 [28×28 close-x]
 *
 * Grid `28px 1fr 28px` with 12px gap, 8/16/12 padding. Sticks to the top of
 * the runner viewport so the progress bar stays visible while content scrolls.
 *
 * Close button:
 *   - Hidden in production (no good UX — browsers block window.close() on
 *     non-script-opened tabs).
 *   - Visible when `onClose` prop is provided (preview/designer mode).
 *
 * Replaces the old `<RunnerProgressBar />` fixed-top 4px stripe — the
 * progress is now part of the header chrome, not a separate sliver.
 */

import { X } from 'lucide-react';

export interface RunnerHeaderProps {
  /** 0-based block index (Welcome = 0 → progress shows 1/N for that slot). */
  current: number;
  total: number;
  /** When provided, renders the close-x. Phase 1 production omits this. */
  onClose?: () => void;
}

export function RunnerHeader({ current, total, onClose }: RunnerHeaderProps) {
  // Defensive arithmetic — mirrors the old RunnerProgressBar contract.
  const safeTotal = Math.max(1, total);
  const safeCurrent = Math.min(Math.max(0, current), safeTotal - 1);
  const step = safeCurrent + 1;
  const pct = (step / safeTotal) * 100;
  const valueText = `Шаг ${step} из ${safeTotal}`;

  return (
    <header
      style={{
        display: 'grid',
        gridTemplateColumns: '28px 1fr 28px',
        gap: 12,
        alignItems: 'center',
        padding: '8px 16px 12px',
        background: 'var(--bg-page)',
        flexShrink: 0,
        paddingTop: `calc(8px + env(safe-area-inset-top, 0px))`,
      }}
    >
      {/* Mini M-logo — handoff .rr-logo-mini */}
      <span
        aria-hidden="true"
        style={{
          width: 28,
          height: 28,
          background: 'var(--ink-0)',
          color: 'var(--bg-page)',
          borderRadius: 'var(--radius)',
          display: 'grid',
          placeItems: 'center',
          font: '600 13px var(--font-sans)',
          letterSpacing: '-0.02em',
          position: 'relative',
          flexShrink: 0,
        }}
      >
        M
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 3,
            right: 3,
            width: 4,
            height: 4,
            borderRadius: '50%',
            background: 'var(--color-accent)',
          }}
        />
      </span>

      {/* Progress — handoff .rr-progress */}
      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={safeTotal}
        aria-valuenow={step}
        aria-valuetext={valueText}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div
          style={{
            flex: 1,
            height: 5,
            background: 'var(--bg-chip)',
            borderRadius: 'var(--radius-full)',
            overflow: 'hidden',
          }}
        >
          <div
            aria-hidden="true"
            style={{
              width: `${pct}%`,
              height: '100%',
              background: 'var(--color-accent)',
              borderRadius: 'var(--radius-full)',
              transition: 'width 240ms cubic-bezier(.2,.7,.3,1)',
            }}
          />
        </div>
        <span
          style={{
            font: '500 11px var(--font-mono)',
            color: 'var(--text-2)',
            whiteSpace: 'nowrap',
          }}
        >
          {step} / {safeTotal}
        </span>
      </div>

      {/* Close-X (preview only). Use a transparent placeholder to keep the
          grid layout when no close handler is wired. */}
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: 'var(--bg-chip)',
            border: 0,
            color: 'var(--text-2)',
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      ) : (
        <span aria-hidden="true" />
      )}
    </header>
  );
}
