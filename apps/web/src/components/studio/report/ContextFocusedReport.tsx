/**
 * <ContextFocusedReport /> — focused-block card for `context`-typed blocks
 * (BLK-08, composite age + experience + role).
 *
 * Phase 4 / Plan 04-04 Task 3. Consumes the `ContextAggregate` produced by
 * `@/lib/analytics/context-aggregate`.
 *
 * Composite layout — three independent sub-sections under one header. Each
 * sub-section renders only when the designer enabled the corresponding
 * sub-question (D-92):
 *   - **Возраст** (age) — when `stats.age !== null`: bar list (label + bar +
 *     count·pct) ordered by the designer's original bucket order.
 *   - **Опыт** (experience) — when `stats.experience !== null`: small
 *     vertical histogram + mean tile.
 *   - **Роль** (role) — when `stats.role !== null` AND `!hideOpenAnswers`:
 *     scrollable list of role texts (each item preserves sessionId metadata
 *     internally — used by 04-07 public-share toggle). Hidden when
 *     `hideOpenAnswers === true` per REPORT-07 default-OFF; replaced with
 *     «Ответы скрыты дизайнером» empty-state.
 *
 * Low-N gate (D-103, M-2): when `validSessionCount < 5` → LowNGateCard with
 * publicMode forwarded.
 */

import type { JSX } from 'react';
import type { Block } from '@/lib/blocks/types';
import type { ContextContent } from '@/lib/blocks/schemas';
import { blockVisualOf } from '@/lib/blocks/visual';
import type { ContextAggregate } from '@/lib/analytics/context-aggregate';
import { passLowNGate } from '@/lib/analytics/low-n-gate';
import { LowNGateCard } from './LowNGateCard';

export interface ContextFocusedReportProps {
  block: Block;
  stats: ContextAggregate;
  position: number;
  validSessionCount: number;
  filtersActive: boolean;
  onResetFilters?: () => void;
  publicMode?: boolean;
  /**
   * REPORT-07 default-OFF: when true, the «Роль» open-answer section is
   * replaced with «Ответы скрыты дизайнером» empty-state. Designer view
   * always passes `false` (the default) — full role text list visible.
   */
  hideOpenAnswers?: boolean;
}

export function ContextFocusedReport({
  block,
  stats,
  position,
  validSessionCount,
  filtersActive,
  onResetFilters,
  publicMode = false,
  hideOpenAnswers = false,
}: ContextFocusedReportProps): JSX.Element {
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

  const content = block.content as ContextContent;
  const visual = blockVisualOf(block.type);
  const ChipIcon = visual.icon;
  const title = (content.title ?? '').trim() || 'О респонденте';

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
        gap: 28,
      }}
    >
      {/* Header */}
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
          {stats.n} ответов
        </span>
      </header>

      {/* Age sub-section — bar list */}
      {stats.age !== null && (
        <SubSection title="Возраст">
          {stats.age.length === 0 ? (
            <EmptySubSection text="Нет ответов." />
          ) : (
            <ul
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                margin: 0,
                padding: 0,
                listStyle: 'none',
              }}
            >
              {stats.age.map((bucket) => (
                <li
                  key={bucket.bucketId}
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
                        font: '400 13.5px var(--font-sans)',
                        color: 'var(--text-1)',
                      }}
                    >
                      {bucket.label}
                    </span>
                    <div
                      style={{
                        height: 6,
                        background: 'var(--bg-input)',
                        borderRadius: 4,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${bucket.pct}%`,
                          height: '100%',
                          background: 'var(--color-accent)',
                          transition: 'width 240ms cubic-bezier(.2,.7,.3,1)',
                        }}
                      />
                    </div>
                  </div>
                  <span
                    style={{
                      font: '400 12.5px var(--font-mono)',
                      color: 'var(--text-2)',
                      minWidth: 80,
                      textAlign: 'right',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {bucket.count} · {bucket.pct}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SubSection>
      )}

      {/* Experience sub-section — mini histogram + mean */}
      {stats.experience !== null && (
        <SubSection title="Опыт респондентов">
          {stats.experience.n === 0 ? (
            <EmptySubSection text="Нет ответов." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Mean tile */}
              <div
                style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-1)',
                  borderRadius: 'var(--radius)',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 10,
                  alignSelf: 'flex-start',
                }}
              >
                <span
                  style={{
                    font: '400 12px var(--font-sans)',
                    color: 'var(--text-3)',
                  }}
                >
                  Среднее
                </span>
                <span
                  style={{
                    font: '500 18px var(--font-sans)',
                    color: 'var(--text-1)',
                  }}
                >
                  {stats.experience.mean.toFixed(2)}
                </span>
              </div>
              {/* Mini histogram */}
              <ExperienceHistogram histogram={stats.experience.histogram} />
            </div>
          )}
        </SubSection>
      )}

      {/* Role sub-section — open-answer list. REPORT-07 hide path. */}
      {stats.role !== null && (
        <SubSection title="Роль">
          {hideOpenAnswers ? (
            <EmptySubSection text="Ответы скрыты дизайнером." />
          ) : stats.role.length === 0 ? (
            <EmptySubSection text="Нет ответов." />
          ) : (
            <ul
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                margin: 0,
                padding: 0,
                listStyle: 'none',
                maxHeight: 280,
                overflowY: 'auto',
              }}
            >
              {stats.role.map((entry) => (
                <li
                  key={entry.sessionId}
                  // sessionId attached internally — used by 04-07 toggle.
                  data-session-id={entry.sessionId}
                  style={{
                    font: '400 14px/22px var(--font-sans)',
                    color: 'var(--text-2)',
                    padding: '6px 10px',
                    background: 'var(--bg-input)',
                    borderRadius: 'var(--radius)',
                    // T-04-04-01 — React text node, NO dangerouslySetInnerHTML.
                  }}
                >
                  {entry.text}
                </li>
              ))}
            </ul>
          )}
        </SubSection>
      )}
    </article>
  );
}

function SubSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h4
        style={{
          font: '500 14px var(--font-sans)',
          color: 'var(--text-1)',
          margin: 0,
        }}
      >
        {title}
      </h4>
      {children}
    </section>
  );
}

function EmptySubSection({ text }: { text: string }): JSX.Element {
  return (
    <p
      style={{
        font: '400 13px var(--font-sans)',
        color: 'var(--text-3)',
        margin: 0,
      }}
    >
      {text}
    </p>
  );
}

function ExperienceHistogram({ histogram }: { histogram: number[] }): JSX.Element {
  const max = Math.max(...histogram, 1);
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'flex-end',
        height: 100,
      }}
    >
      {histogram.map((count, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            height: '100%',
            justifyContent: 'flex-end',
          }}
        >
          <span
            style={{
              font: '500 11px var(--font-mono)',
              color: 'var(--text-2)',
            }}
          >
            {count}
          </span>
          <div
            style={{
              width: '100%',
              height: `${(count / max) * 100}%`,
              background: 'var(--color-accent)',
              borderRadius: 'var(--radius-sm)',
              minHeight: count > 0 ? 4 : 0,
              transition: 'height 240ms cubic-bezier(.2,.7,.3,1)',
            }}
          />
          <span
            style={{
              font: '400 11px var(--font-mono)',
              color: 'var(--text-3)',
            }}
          >
            {i + 1}
          </span>
        </div>
      ))}
    </div>
  );
}
