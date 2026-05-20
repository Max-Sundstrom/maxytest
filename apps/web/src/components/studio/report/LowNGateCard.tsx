/**
 * <LowNGateCard /> — reusable low-N empty-state for focused-report cards.
 *
 * Phase 4 / Plan 04-04 Task 1. Consumed by every *FocusedReport.tsx component
 * when `validSessionCount < LOW_N_THRESHOLD` (5 per CONTEXT.md D-103) and by
 * the public-share view (Plan 04-07).
 *
 * M-2 closure (CONTEXT.md §"Mitigations"):
 *   When the public-share view (Plan 04-07 PublicReportShell) mounts this card,
 *   it MUST pass `publicMode={true}` — that suppresses the exact N count AND
 *   the «после фильтров» hint AND the explanatory tooltip. The threat model
 *   is: a hostile viewer narrows the date filter until the card disappears,
 *   reading the N counter at each step to triangulate which respondents are
 *   in which date window. By hiding N entirely in public mode, the only
 *   signal is binary «card visible / card not visible» around the 5-respondent
 *   threshold — useless for re-identification.
 *
 *   Designer-side (publicMode=false, the default) shows the exact N + the
 *   explanatory tooltip so the designer can debug «почему пусто?» quickly.
 *
 * Hex literals: NONE — every color references a CSS var that swaps per skin.
 */

import type { JSX } from 'react';

export interface LowNGateCardProps {
  /** Current filter-aware sample size (validSessionIds.size). */
  currentN: number;
  /**
   * `true` iff at least one of (date range, status filter, future filters)
   * is non-default. Drives the «после фильтров» hint AND the «Сбросить
   * фильтры» CTA visibility.
   */
  filtersActive: boolean;
  /**
   * M-2 closure: public-share view (Plan 04-07) passes `publicMode={true}` so
   * the exact N is hidden + the tooltip is suppressed. Designer view leaves
   * `publicMode` undefined / false so the N counter + tooltip are visible.
   */
  publicMode?: boolean;
  /**
   * Optional reset-filters CTA. When provided AND `filtersActive` is true,
   * a 32px button is rendered next to the explanation. Public view typically
   * omits this (filters are designer-only) but the prop is honored if passed.
   */
  onResetFilters?: () => void;
}

export function LowNGateCard({
  currentN,
  filtersActive,
  publicMode = false,
  onResetFilters,
}: LowNGateCardProps): JSX.Element {
  const isPublic = publicMode === true;
  return (
    <article
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-1)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-card)',
        padding: '32px 28px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        alignItems: 'flex-start',
      }}
    >
      <h3
        style={{
          font: '500 18px var(--font-sans)',
          color: 'var(--text-1)',
          margin: 0,
        }}
      >
        Слишком мало ответов для отображения
      </h3>

      {!isPublic && (
        <>
          <p
            style={{
              font: '400 14px/22px var(--font-sans)',
              color: 'var(--text-2)',
              margin: 0,
            }}
          >
            Минимум 5. Сейчас: {currentN}
            {filtersActive ? ' (после фильтров)' : ''}.
          </p>
          <p
            style={{
              font: '400 12px/18px var(--font-sans)',
              color: 'var(--text-3)',
              background: 'var(--bg-input)',
              padding: '8px 12px',
              borderRadius: 'var(--radius)',
              borderLeft: '2px solid var(--color-accent)',
              margin: 0,
            }}
          >
            Защита респондентов от идентификации: при выборке меньше 5 ответов карточка скрыта,
            чтобы зрители не смогли по фильтрам сузить выборку до отдельного человека.
          </p>
        </>
      )}

      {isPublic && (
        // M-2: NO exact N, NO «после фильтров» hint, NO explanatory tooltip —
        // anything that would reveal the size of the underlying dataset is
        // suppressed. The card's mere presence reveals «N < 5», nothing more.
        <p
          style={{
            font: '400 14px/22px var(--font-sans)',
            color: 'var(--text-2)',
            margin: 0,
          }}
        >
          Карточка скрыта, чтобы респонденты остались неузнаваемыми.
        </p>
      )}

      {filtersActive && onResetFilters && (
        <button
          type="button"
          onClick={onResetFilters}
          style={{
            height: 32,
            padding: '0 16px',
            background: 'var(--bg-input)',
            color: 'var(--text-1)',
            border: '1px solid var(--border-1)',
            borderRadius: 'var(--radius)',
            font: '500 13px var(--font-sans)',
            cursor: 'pointer',
          }}
        >
          Сбросить фильтры
        </button>
      )}
    </article>
  );
}
