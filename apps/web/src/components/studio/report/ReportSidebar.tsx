/**
 * <ReportSidebar /> — 288px filter sidebar for the report screen.
 *
 * Source: design-system handoff `js/maxitest-report.jsx` <ReportSidebar /> +
 * index.html `.mx-rside*` rules.
 *
 * Layout (top→bottom, 24/20 padding, 20px gap between groups):
 *   1. Дата — label + 32px select-input "Всё время ▾"
 *   2. Источник респондентов — label + 32px check-rows (Link / Pathway Panel)
 *   3. Тип — label + 32px check-rows (Completed / Incomplete)
 *   4. "Фильтры" — inline icon button (text)
 *   5. Pill segmented tabs (Сводный отчёт / Ответы N)
 *   6. Block-jump list — one row per content block; active block highlighted
 *      with accent border + soft shadow
 *
 * All filter controls are display-only in this commit. Real filtering wiring
 * is Phase 3 territory (REPORT-04 / ANALYTICS-04). The check-rows reflect
 * counts from the response/session totals passed in as props.
 */

import { Check } from 'lucide-react';
import type { Block } from '@/lib/blocks/types';
import { blockVisualOf } from '@/lib/blocks/visual';
import type { DatePreset, DateRange } from '@/lib/analytics/date-range';
import type { StatusFilter } from '@/lib/analytics/session-filter';
import { DateRangeControl } from './DateRangeControl';

export interface ReportSidebarProps {
  blocks: Block[];
  /** Currently-focused block id (highlights its row). */
  activeBlockId: string | null;
  /** Switch focus to a different block by clicking its row. */
  onSelectBlock: (blockId: string) => void;
  completedCount: number;
  incompleteCount: number;
  /** Plan 03.1-02 — current date filter ({startISO,endISO} | null). */
  dateRange: DateRange;
  /** Plan 03.1-02 — current preset key (drives the trigger label). */
  datePreset: DatePreset;
  /** Plan 03.1-02 — fires when designer picks a different period. */
  onDateChange: (range: DateRange, preset: DatePreset) => void;
  /** Plan 03.1-03 (GA2/D-72) — current «Тип» filter state. */
  statusFilter: StatusFilter;
  /** Plan 03.1-03 — fires when designer toggles a «Тип» checkbox. */
  onStatusFilterChange: (next: StatusFilter) => void;
  /** Plan 03.1-04 — current view-mode ('aggregate' = summary report, 'responses' = per-session table). */
  viewMode: 'aggregate' | 'responses';
  /** Plan 03.1-04 — fires when designer clicks one of the PillTabs. */
  onViewModeChange: (mode: 'aggregate' | 'responses') => void;
  /** Plan 03.1-04 — count rendered next to the «Ответы N» tab label (live, filtered). */
  responsesCount: number;
  /**
   * Plan 04-03 (D-97) — optional per-block response count for the sidebar
   * block-list. Phase 4 surfaces this number next to each block row in
   * Plan 04-04 (visual focused-report cards). 04-03 only threads the
   * data through the interface so the wiring lands atomically with the
   * focused-block router.
   */
  responseCountByBlock?: Record<string, number>;
}

// Block types hidden from the report block-list per D-96 (welcome / thanks
// are pinned chrome; agreement is a consent gate, not an analytical block).
const HIDDEN_FROM_BLOCK_LIST: ReadonlySet<string> = new Set(['welcome', 'thanks', 'agreement']);

export function ReportSidebar({
  blocks,
  activeBlockId,
  onSelectBlock,
  completedCount,
  incompleteCount,
  dateRange,
  datePreset,
  onDateChange,
  statusFilter,
  onStatusFilterChange,
  viewMode,
  onViewModeChange,
  responsesCount,
  responseCountByBlock,
}: ReportSidebarProps) {
  // Plan 04-04 D-96 — block-list visibility. Welcome/thanks/agreement are
  // hidden so the sidebar surfaces only analytical blocks. Defensive: if
  // ReportShell passes pre-filtered `blocks` we still apply the filter so
  // the contract holds regardless of upstream wiring.
  const visibleBlocks = blocks.filter((b) => !HIDDEN_FROM_BLOCK_LIST.has(b.type));

  return (
    <aside
      style={{
        background: 'var(--bg-page)',
        borderRight: '1px solid var(--border-2)',
        padding: '24px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        overflow: 'hidden',
        minHeight: 0,
      }}
    >
      <Group label="Дата">
        <DateRangeControl value={dateRange} preset={datePreset} onChange={onDateChange} />
      </Group>

      <Group label="Тип">
        <CheckRow
          checked={statusFilter.completed}
          label="Завершённые"
          n={completedCount}
          onClick={() =>
            onStatusFilterChange({ ...statusFilter, completed: !statusFilter.completed })
          }
        />
        <CheckRow
          checked={statusFilter.incomplete}
          label="Неполные"
          n={incompleteCount}
          onClick={() =>
            onStatusFilterChange({ ...statusFilter, incomplete: !statusFilter.incomplete })
          }
        />
      </Group>

      <div
        style={{
          display: 'flex',
          gap: 2,
          padding: 3,
          background: 'var(--bg-chip)',
          borderRadius: 'var(--radius)',
        }}
      >
        <PillTab active={viewMode === 'aggregate'} onClick={() => onViewModeChange('aggregate')}>
          Сводный отчёт
        </PillTab>
        <PillTab active={viewMode === 'responses'} onClick={() => onViewModeChange('responses')}>
          Ответы {responsesCount}
        </PillTab>
      </div>

      {/* Plan 04-04 D-99 — block-list is the only sticky-scrolling region.
          Filters above stay pinned. The wrapper has `flex: 1` + `minHeight: 0`
          so the sidebar shrinks predictably under tall tests (15+ blocks). */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {visibleBlocks.length === 0 ? (
          <p
            style={{
              font: '400 13px/20px var(--font-sans)',
              color: 'var(--text-3)',
              margin: 0,
              padding: '8px 4px',
            }}
          >
            В тесте нет аналитических блоков. Добавьте choice / scale / nps / context в
            конструкторе.
          </p>
        ) : (
          <ul
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              margin: 0,
              padding: 0,
              listStyle: 'none',
            }}
          >
            {visibleBlocks.map((block, i) => {
              const visual = blockVisualOf(block.type);
              const ChipIcon = visual.icon;
              const active = block.id === activeBlockId;
              const blockTitle =
                (block.content as { title?: string; question?: string }).title?.toString().trim() ||
                (block.content as { title?: string; question?: string }).question
                  ?.toString()
                  .trim() ||
                'Без названия';
              const count = responseCountByBlock?.[block.id] ?? 0;

              return (
                <li key={block.id}>
                  <button
                    type="button"
                    onClick={() => onSelectBlock(block.id)}
                    style={{
                      width: '100%',
                      height: 32,
                      display: 'grid',
                      gridTemplateColumns: '20px 1fr auto',
                      gap: 8,
                      alignItems: 'center',
                      padding: '0 10px',
                      background: active ? 'var(--bg-card)' : 'transparent',
                      border: `1px solid ${active ? 'var(--color-accent)' : 'transparent'}`,
                      borderRadius: 'var(--radius)',
                      cursor: 'pointer',
                      boxShadow: active ? 'var(--shadow-card)' : 'none',
                      font: '400 13px/16px var(--font-sans)',
                      color: 'var(--text-1)',
                      textAlign: 'left',
                      transition: 'background 120ms cubic-bezier(.2,.7,.3,1)',
                    }}
                    onMouseEnter={(e) => {
                      if (!active) e.currentTarget.style.background = 'var(--bg-card)';
                    }}
                    onMouseLeave={(e) => {
                      if (!active) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 'var(--radius-sm)',
                        background: visual.chipBg,
                        color: visual.chipFg,
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <ChipIcon size={11} strokeWidth={1.5} />
                    </span>
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span style={{ color: 'var(--text-3)', marginRight: 6 }}>{i + 1}.</span>
                      {blockTitle}
                    </span>
                    <span
                      style={{
                        font: '400 12px var(--font-mono)',
                        color: 'var(--text-3)',
                      }}
                      aria-label={`Ответов: ${count}`}
                    >
                      {count}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span
        style={{
          font: '400 12.5px/16px var(--font-sans)',
          color: 'var(--text-2)',
          letterSpacing: '0.01em',
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

function CheckRow({
  checked,
  icon,
  label,
  n,
  muted,
  onClick,
}: {
  checked?: boolean;
  icon?: React.ReactNode;
  label: string;
  n: number;
  muted?: boolean;
  /**
   * Plan 03.1-03 — when provided, renders the row as an interactive
   * `<button role="checkbox" aria-pressed={checked}>` so screen readers can
   * announce state changes and keyboard users can toggle via Space/Enter.
   * When omitted, falls back to the original read-only `<div>` rendering
   * — kept for future call sites (the only previous consumer was deleted
   * in Plan 03.1-01).
   */
  onClick?: () => void;
}) {
  // Shared visual definition — only the wrapping element switches between
  // `<button>` (interactive) and `<div>` (read-only).
  const sharedChildren = (
    <>
      <span
        aria-hidden="true"
        style={{
          width: 18,
          height: 18,
          borderRadius: 'var(--radius-sm)',
          border: checked ? '0' : '1.5px solid var(--border-strong)',
          background: checked ? 'var(--color-accent)' : 'transparent',
          display: 'grid',
          placeItems: 'center',
          color: '#fff',
          flexShrink: 0,
        }}
      >
        {checked ? <Check size={11} strokeWidth={3} /> : null}
      </span>
      {icon ? <span style={{ color: 'var(--text-2)', flexShrink: 0 }}>{icon}</span> : null}
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <span
        style={{
          marginLeft: 'auto',
          color: 'var(--text-3)',
          font: '500 12px var(--font-mono)',
        }}
      >
        {n}
      </span>
    </>
  );

  const sharedStyle: React.CSSProperties = {
    height: 32,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '0 10px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-1)',
    borderRadius: 'var(--radius)',
    font: '400 13.5px var(--font-sans)',
    color: 'var(--text-1)',
    opacity: muted ? 0.7 : 1,
    width: '100%',
    textAlign: 'left',
  };

  if (onClick) {
    return (
      <button
        type="button"
        role="checkbox"
        aria-pressed={!!checked}
        aria-checked={!!checked}
        onClick={onClick}
        style={{
          ...sharedStyle,
          cursor: 'pointer',
        }}
      >
        {sharedChildren}
      </button>
    );
  }

  return <div style={sharedStyle}>{sharedChildren}</div>;
}

function PillTab({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  /** Plan 03.1-04 — forwarded to the underlying button so the tab is actually
   *  interactive. Optional to keep the historical read-only call shape working
   *  if a future consumer wants a non-interactive label. */
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        height: 26,
        padding: '0 10px',
        background: active ? 'var(--bg-card)' : 'transparent',
        border: 0,
        borderRadius: 'var(--radius-sm)',
        font: `${active ? 500 : 400} 12px var(--font-sans)`,
        color: active ? 'var(--text-1)' : 'var(--text-2)',
        cursor: 'pointer',
        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.02)' : 'none',
        transition: 'background 120ms cubic-bezier(.2,.7,.3,1)',
      }}
    >
      {children}
    </button>
  );
}
