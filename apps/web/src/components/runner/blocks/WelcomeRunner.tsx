/**
 * <WelcomeRunner> — design-system v1 rewrite (2026-05-17).
 *
 * Source: design-system handoff `js/maxitest-runner.jsx` <RunnerScreenWelcome />
 * + index.html `.rr-eyebrow / .rr-h1 / .rr-lede / .rr-meta-cards / .rr-note /
 * .rr-footer / .rr-cta` rules.
 *
 * Layout:
 *   - Accent-color mono eyebrow (e.g. "Исследование Maxitest")
 *   - 28/34 weight-500 h1 — designer's `title`
 *   - 15/22 lede — designer's `body` (optional)
 *   - 3-column meta-grid (estimated minutes / question count / "anonymous")
 *   - chip-bg info note — privacy/recording disclosure
 *   - sticky footer with full-width 48px moss CTA (designer's `cta_label`
 *     or default "Начать")
 *
 * Phase 1 contract preserved:
 *   - On press, `onStart()` fires. RunnerShell handles resume-target jump.
 *   - Tap-target: 48px CTA is taller than 44px touch floor (D-24 / RUNNER-03).
 */

import { ArrowRight, CheckCircle2, Info } from 'lucide-react';
import type { Block } from '@/lib/blocks/types';
import type { WelcomeContent } from '@/lib/blocks/schemas';

export interface WelcomeRunnerProps {
  block: Block;
  /** Total block count — used by the meta-grid "N вопросов" tile. */
  totalBlocks: number;
  onStart: () => void;
}

export function WelcomeRunner({ block, totalBlocks, onStart }: WelcomeRunnerProps) {
  const content = block.content as WelcomeContent;
  const ctaLabel = content.cta_label || 'Начать';

  // Rough estimate of time-to-complete: ~1 minute per question block on average.
  // Show as a range so respondents don't feel locked to an exact number.
  const questionCount = Math.max(1, totalBlocks - 1);
  const minMinutes = Math.max(1, Math.round(questionCount * 0.6));
  const maxMinutes = Math.max(minMinutes + 1, Math.round(questionCount * 1.2));
  const timeRange = `${minMinutes}–${maxMinutes}`;

  return (
    <>
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          minHeight: 0,
          padding: '16px 24px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <span
          style={{
            font: '500 11px var(--font-mono)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--color-accent)',
          }}
        >
          Исследование Maxytest
        </span>
        <h1
          style={{
            font: '500 28px/34px var(--font-sans)',
            color: 'var(--text-1)',
            letterSpacing: '-0.005em',
            margin: 0,
          }}
        >
          {content.title}
        </h1>
        {content.body ? (
          <p
            style={{
              font: '400 15px/22px var(--font-sans)',
              color: 'var(--text-1)',
              margin: 0,
            }}
          >
            {content.body}
          </p>
        ) : null}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 8,
            marginTop: 4,
          }}
        >
          <MetaCard label="минут" value={timeRange} />
          <MetaCard label="вопросов" value={String(questionCount)} />
          <MetaCard
            label="анонимно"
            value={
              <CheckCircle2
                size={20}
                strokeWidth={1.5}
                color="var(--color-success)"
                aria-hidden="true"
              />
            }
          />
        </div>

        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
            padding: '12px 14px',
            background: 'var(--bg-chip)',
            borderRadius: 'var(--radius)',
            font: '400 12.5px/18px var(--font-sans)',
            color: 'var(--text-2)',
            marginTop: 4,
          }}
        >
          <Info
            size={13}
            strokeWidth={1.5}
            aria-hidden="true"
            style={{ flexShrink: 0, marginTop: 2 }}
          />
          <span>
            Будут записаны клики, движения и время. Никакие персональные данные не собираются.
          </span>
        </div>
      </div>

      <footer
        style={{
          display: 'flex',
          padding: '12px 16px 16px',
          paddingBottom: `calc(16px + env(safe-area-inset-bottom, 0px))`,
          gap: 8,
          background: 'var(--bg-page)',
          borderTop: '1px solid var(--border-2)',
        }}
      >
        <button
          type="button"
          onClick={onStart}
          style={{
            flex: 1,
            height: 48,
            background: 'var(--color-accent)',
            color: '#fff',
            border: 0,
            borderRadius: 'var(--radius)',
            font: '500 15px var(--font-sans)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            transition: 'filter 120ms cubic-bezier(.2,.7,.3,1)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.05)')}
          onMouseLeave={(e) => (e.currentTarget.style.filter = 'none')}
        >
          <span>{ctaLabel}</span>
          <ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </footer>
    </>
  );
}

function MetaCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '14px 8px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-1)',
        borderRadius: 'var(--radius)',
      }}
    >
      <span
        style={{
          font: '500 22px/24px var(--font-sans)',
          color: 'var(--text-1)',
          display: 'inline-flex',
          alignItems: 'center',
        }}
      >
        {value}
      </span>
      <span style={{ font: '400 11px var(--font-sans)', color: 'var(--text-2)' }}>{label}</span>
    </div>
  );
}
