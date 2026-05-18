/**
 * `SessionList` — left column of the future PlaybackDrawer (Plan 03-06).
 *
 * Plan 03-05 (Wave 4) Task 3. Leaf component — no own outcome derivation,
 * no own data fetching. The future ReportShell / PlaybackDrawer passes
 * `sessions` (from `useDesignerSessions`) and `outcomes` (from
 * `classifyOutcome` on `useBlockEvents` data) so cache is reused, NOT
 * re-fetched.
 *
 * Layout (top → bottom):
 *   1. Filter pills row — segmented control, 32 px tall (handoff-v1
 *      control-grid), three buttons: «Все» / «Успешно» / «Сдались».
 *      Active pill: --color-accent background + --text-on-accent text.
 *   2. Scrollable column with one row per session matching the active
 *      filter. Each row shows date+time on the left, device icon
 *      (Smartphone / Monitor) and outcome icon (Check green / X warning)
 *      on the right.
 *
 * Filter semantics (D-61 left column):
 *   - 'all'     → sessions where outcomeMap.has(id). INVALID sessions
 *                 (those with no frame_enter — classifyOutcome returned
 *                 null) are filtered out: there's nothing playable to
 *                 show.
 *   - 'success' → outcomeMap.get(id) === 'success'.
 *   - 'giveup'  → outcomeMap.get(id) === 'giveup'.
 *
 * Empty state: when the filtered list is empty (e.g. filter='giveup' and
 * all sessions succeeded) → render a quiet «Нет сессий в этой выборке.»
 * placeholder.
 *
 * Accessibility:
 *   - Filter pills: a single `<div role="tablist">`-style group with
 *     `aria-pressed` on each pill so screen readers announce the active
 *     filter.
 *   - Session rows: `<button>` elements with `aria-pressed` on the
 *     selected row.
 *   - Outer section: `aria-label="Список сессий респондентов"` so
 *     navigating to the drawer reads as a coherent landmark.
 *   - Icons: `aria-label` on each device icon ("Мобильное устройство" /
 *     "Десктоп") since the surrounding row text is date-only.
 *
 * Styling: CSS vars only (handoff-v1 enforcement). No hardcoded hex.
 * Inline `style={{}}` per studio-component convention (PATTERNS.md §12).
 *
 * Source: 03-PATTERNS.md §13 (analog with GoalScreenDrawer ThumbStrip)
 * + 03-CONTEXT.md D-61.
 */

import { useMemo, type JSX } from 'react';
import { Check, Monitor, Smartphone, X } from 'lucide-react';

import type { ClassifyOutcomeResult, SessionOutcome } from '@/lib/analytics/classify-outcome';
import type { DesignerSession } from '@/lib/queries/designer-sessions';

export type SessionFilter = 'all' | 'success' | 'giveup';

export interface SessionListProps {
  /** Full list of sessions from `useDesignerSessions(studyId)`. */
  sessions: DesignerSession[];
  /**
   * Per-session outcome derived from `classifyOutcome` over the block's
   * events. Sessions absent here are invalid (no frame_enter) and are
   * dropped from every filter view.
   */
  outcomes: ClassifyOutcomeResult[];
  /** Currently-selected session id (drives PlaybackPlayer in 03-06). */
  selectedSessionId: string | null;
  onSelect: (sessionId: string) => void;
  /** Currently-active filter pill. */
  filter: SessionFilter;
  onFilterChange: (f: SessionFilter) => void;
}

const ROW_DATE_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'short',
  timeStyle: 'short',
});

/**
 * Map our internal filter value → the `SessionOutcome` we compare against.
 * `null` means "no outcome filter" (i.e. filter='all').
 */
function filterToOutcome(filter: SessionFilter): SessionOutcome | null {
  if (filter === 'success') return 'success';
  if (filter === 'giveup') return 'giveup';
  return null;
}

export function SessionList(props: SessionListProps): JSX.Element {
  const { sessions, outcomes, selectedSessionId, onSelect, filter, onFilterChange } = props;

  // Build the (sessionId → outcome) map ONCE per outcomes-change. The
  // calling component (ReportShell / PlaybackDrawer in 03-06) holds
  // `outcomes` in a stable useMemo, so this map is cheap.
  const outcomeMap = useMemo(() => {
    const map = new Map<string, SessionOutcome>();
    for (const o of outcomes) {
      map.set(o.sessionId, o.outcome);
    }
    return map;
  }, [outcomes]);

  // Apply the active filter. `all` still drops invalid sessions (no
  // frame_enter → not in outcomeMap → nothing playable).
  const visibleSessions = useMemo(() => {
    const targetOutcome = filterToOutcome(filter);
    return sessions.filter((s) => {
      const outcome = outcomeMap.get(s.id);
      if (outcome === undefined) return false;
      if (targetOutcome === null) return true;
      return outcome === targetOutcome;
    });
  }, [sessions, outcomeMap, filter]);

  return (
    <section
      aria-label="Список сессий респондентов"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        height: '100%',
        minHeight: 0,
      }}
    >
      {/* Filter pills — segmented control */}
      <div
        role="group"
        aria-label="Фильтр сессий по результату"
        style={{
          display: 'flex',
          gap: 4,
          padding: 2,
          background: 'var(--bg-chip)',
          border: '1px solid var(--border-1)',
          borderRadius: 8,
          height: 32,
          flexShrink: 0,
        }}
      >
        <FilterPill label="Все" active={filter === 'all'} onClick={() => onFilterChange('all')} />
        <FilterPill
          label="Успешно"
          active={filter === 'success'}
          onClick={() => onFilterChange('success')}
        />
        <FilterPill
          label="Сдались"
          active={filter === 'giveup'}
          onClick={() => onFilterChange('giveup')}
        />
      </div>

      {/* Scrollable session rows */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {visibleSessions.length === 0 ? (
          <p
            style={{
              padding: 24,
              margin: 0,
              color: 'var(--text-3)',
              font: '400 13px/18px var(--font-sans)',
              textAlign: 'center',
            }}
          >
            Нет сессий в этой выборке.
          </p>
        ) : (
          visibleSessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              outcome={outcomeMap.get(session.id) ?? null}
              selected={selectedSessionId === session.id}
              onSelect={() => onSelect(session.id)}
            />
          ))
        )}
      </div>
    </section>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────

interface FilterPillProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function FilterPill({ label, active, onClick }: FilterPillProps): JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={{
        flex: 1,
        height: 28,
        padding: '0 12px',
        border: 'none',
        borderRadius: 6,
        background: active ? 'var(--color-accent)' : 'transparent',
        color: active ? 'var(--text-on-accent)' : 'var(--text-2)',
        font: '500 12.5px/16px var(--font-sans)',
        cursor: 'pointer',
        transition: 'background 120ms cubic-bezier(.2,.7,.3,1)',
      }}
    >
      {label}
    </button>
  );
}

interface SessionRowProps {
  session: DesignerSession;
  outcome: SessionOutcome | null;
  selected: boolean;
  onSelect: () => void;
}

function SessionRow({ session, outcome, selected, onSelect }: SessionRowProps): JSX.Element {
  const deviceLabel = session.device_type === 'mobile' ? 'Мобильное устройство' : 'Десктоп';

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: '8px 12px',
        background: selected
          ? 'color-mix(in oklab, var(--color-accent) 12%, var(--bg-card))'
          : 'var(--bg-card)',
        border: selected ? '2px solid var(--color-accent)' : '1px solid var(--border-1)',
        borderRadius: 8,
        cursor: 'pointer',
        textAlign: 'left',
        color: 'var(--text-1)',
        font: '400 13px/18px var(--font-sans)',
        transition: 'background 120ms cubic-bezier(.2,.7,.3,1)',
      }}
    >
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {ROW_DATE_FORMATTER.format(new Date(session.started_at))}
      </span>
      <DeviceIcon deviceType={session.device_type} label={deviceLabel} />
      <OutcomeIcon outcome={outcome} />
    </button>
  );
}

function DeviceIcon({
  deviceType,
  label,
}: {
  deviceType: string | null;
  label: string;
}): JSX.Element | null {
  if (deviceType === 'mobile') {
    return (
      <Smartphone
        size={16}
        strokeWidth={1.5}
        aria-label={label}
        style={{ color: 'var(--text-3)' }}
      />
    );
  }
  if (deviceType === 'desktop') {
    return (
      <Monitor size={16} strokeWidth={1.5} aria-label={label} style={{ color: 'var(--text-3)' }} />
    );
  }
  return null;
}

function OutcomeIcon({ outcome }: { outcome: SessionOutcome | null }): JSX.Element | null {
  if (outcome === 'success') {
    return (
      <Check
        size={16}
        strokeWidth={2}
        aria-label="Успешно завершено"
        style={{ color: 'var(--color-success)' }}
      />
    );
  }
  if (outcome === 'giveup') {
    return (
      <X size={16} strokeWidth={2} aria-label="Сдался" style={{ color: 'var(--color-warning)' }} />
    );
  }
  return null;
}
