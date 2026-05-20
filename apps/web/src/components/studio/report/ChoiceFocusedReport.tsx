/**
 * <ChoiceFocusedReport /> — focused-block card for `choice`-typed blocks
 * (BLK-04, single + multi mode).
 *
 * Phase 4 / Plan 04-04 Task 1. Consumes the `ChoiceAggregate` produced by
 * `@/lib/analytics/choice-aggregate` (sorted bars + flat otherTexts list).
 * Header pattern mirrors `PrototypeFocusedReport` (position index + chip-icon +
 * title + N-responses); bar list mirrors `FunnelSection` (label + horizontal
 * pct fill + count·pct counter).
 *
 * Visual:
 *   - 8px horizontal bar, moss-accent fill for named options, terra-accent
 *     fill for the appended «Другое» bar (visual distinction without semantic
 *     overload).
 *   - 240ms cubic-bezier transition on bar widths so filter changes animate.
 *   - Under-chart `<details>` accordion with raw otherText strings — only
 *     rendered when `block.content.hasOtherOption === true` AND there is at
 *     least one otherText AND `hideOpenAnswers !== true` (REPORT-07 default-OFF
 *     for public share — Plan 04-07).
 *
 * Low-N gate (D-103, M-2 plumbing): when `validSessionCount < 5`, render
 * <LowNGateCard /> in place of the chart. `publicMode` is forwarded so the
 * public view hides the exact N.
 *
 * Hex literals: NONE — every color references a CSS var or accent token.
 */

import type { JSX } from 'react';
import type { Block } from '@/lib/blocks/types';
import type { ChoiceContent } from '@/lib/blocks/schemas';
import { blockVisualOf } from '@/lib/blocks/visual';
import type { ChoiceAggregate } from '@/lib/analytics/choice-aggregate';
import { passLowNGate } from '@/lib/analytics/low-n-gate';
import { LowNGateCard } from './LowNGateCard';

export interface ChoiceFocusedReportProps {
  block: Block;
  stats: ChoiceAggregate;
  /** 1-indexed position in the test (block.position + 1) for the header «N.». */
  position: number;
  /** Filter-aware sample size (validSessionIds.size) — drives low-N gate. */
  validSessionCount: number;
  /** True when any filter (date / status) is non-default. */
  filtersActive: boolean;
  /** Reset all filters CTA — visible inside low-N empty state if filtersActive. */
  onResetFilters?: () => void;
  /** M-2 / REPORT-07 plumbing: public share view (Plan 04-07) passes true. */
  publicMode?: boolean;
  /**
   * REPORT-07 default-OFF: public share view (Plan 04-07) hides «Другое»
   * accordion when the designer didn't explicitly allow open-answer texts.
   * Designer view always sees the accordion.
   */
  hideOpenAnswers?: boolean;
}

export function ChoiceFocusedReport({
  block,
  stats,
  position,
  validSessionCount,
  filtersActive,
  onResetFilters,
  publicMode = false,
  hideOpenAnswers = false,
}: ChoiceFocusedReportProps): JSX.Element {
  // D-103 low-N gate — gate FIRST so we never leak aggregate counts when the
  // sample is too small. Returns LowNGateCard (which honors publicMode).
  if (!passLowNGate(validSessionCount)) {
    return (
      <LowNGateCard
        currentN={validSessionCount}
        filtersActive={filtersActive}
        publicMode={publicMode}
        onResetFilters={onResetFilters}
      />
    );
  }

  const content = block.content as ChoiceContent;
  const visual = blockVisualOf(block.type);
  const ChipIcon = visual.icon;
  const title = (content.question ?? '').trim() || 'Без вопроса';

  return (
    <article
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-1)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-card)',
        padding: '24px 28px 28px',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      {/* Header — position + chip + title + N */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          aria-hidden="true"
          style={{
            font: '500 16px var(--font-sans)',
            color: 'var(--text-2)',
            minWidth: 22,
          }}
        >
          {position}.
        </span>
        <span
          aria-hidden="true"
          style={{
            width: 28,
            height: 28,
            borderRadius: 'var(--radius)',
            background: visual.chipBg,
            color: visual.chipFg,
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          <ChipIcon size={14} strokeWidth={1.5} />
        </span>
        <span
          style={{
            flex: 1,
            font: '500 15px/22px var(--font-sans)',
            color: 'var(--text-1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </span>
        <span
          style={{
            font: '400 13px var(--font-sans)',
            color: 'var(--text-2)',
            whiteSpace: 'nowrap',
          }}
        >
          {stats.totalResponses} ответов
        </span>
      </header>

      {/* Bars */}
      {stats.bars.length === 0 ? (
        <p
          style={{
            font: '400 14px var(--font-sans)',
            color: 'var(--text-3)',
            margin: 0,
          }}
        >
          Нет ответов на этот вопрос.
        </p>
      ) : (
        <ul
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            margin: 0,
            padding: 0,
            listStyle: 'none',
          }}
        >
          {stats.bars.map((bar) => (
            <li
              key={bar.optionId}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 12,
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span
                  style={{
                    font: '400 14px var(--font-sans)',
                    color: 'var(--text-1)',
                  }}
                >
                  {bar.label}
                </span>
                <div
                  style={{
                    height: 8,
                    background: 'var(--bg-input)',
                    borderRadius: 4,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${bar.pct}%`,
                      height: '100%',
                      background: bar.isOtherOption
                        ? 'var(--color-accent-2)'
                        : 'var(--color-accent)',
                      transition: 'width 240ms cubic-bezier(.2,.7,.3,1)',
                    }}
                  />
                </div>
              </div>
              <span
                style={{
                  font: '400 13px var(--font-mono)',
                  color: 'var(--text-2)',
                  minWidth: 80,
                  textAlign: 'right',
                  whiteSpace: 'nowrap',
                }}
              >
                {bar.count} · {bar.pct}%
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* «Другое» accordion — open-answer texts under the chart.
          REPORT-07 default-OFF: hidden in public mode unless designer
          explicitly allowed open-answer text reveal. */}
      {content.hasOtherOption && stats.otherTexts.length > 0 && !hideOpenAnswers && (
        <details
          style={{
            borderTop: '1px solid var(--border-1)',
            paddingTop: 16,
          }}
        >
          <summary
            style={{
              font: '500 13px var(--font-sans)',
              color: 'var(--text-1)',
              cursor: 'pointer',
              listStyle: 'revert',
            }}
          >
            Что написали в «Другое» ({stats.otherTexts.length})
          </summary>
          <ul
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              marginTop: 12,
              padding: 0,
              listStyle: 'none',
            }}
          >
            {stats.otherTexts.map((t, i) => (
              <li
                key={i}
                style={{
                  font: '400 14px/22px var(--font-sans)',
                  color: 'var(--text-2)',
                  // T-04-04-01 — text node rendering, NO dangerouslySetInnerHTML.
                  // React auto-escapes; arbitrary HTML in `t` cannot execute.
                }}
              >
                {t}
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
