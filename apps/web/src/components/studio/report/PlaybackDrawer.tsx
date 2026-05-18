/**
 * `PlaybackDrawer` — drawer that composes `<SessionList>` (left) +
 * `<PlaybackPlayer>` (right) inside the canonical `<Drawer>` primitive
 * (Plan 03-06 Task 2).
 *
 * Second consumer of the `<Drawer>` primitive shipped in Plan 02.3-07
 * (the first being `<GoalScreenDrawer>`). The pattern note
 * `project_drawer_pattern_pending` graduates to RESOLVED after this slice.
 *
 * Layout (top→bottom inside `<Drawer side="right" maxWidth={1040}>`):
 *   1. `<DrawerHeader title="Сессии респондентов" meta="{n} сессий" />`
 *   2. Two-column grid `280px 1fr`:
 *      - LEFT (280px): `<SessionList>` with filter pills + scrollable rows.
 *      - RIGHT (1fr): `<PlaybackPlayer>` when a session is selected,
 *        otherwise a quiet placeholder «Выберите сессию слева».
 *   3. `<DrawerFooter>` with a hint — only shown until the user picks
 *      a session (D-61) so the drawer feels less crowded once playback
 *      is active.
 *
 * Local Drawer state:
 *   - `selectedSessionId: string | null` (default null).
 *   - `filter: SessionFilter` (default 'all').
 *   Both reset on every drawer open (component re-mounts on `open=false`
 *   thanks to ReportShell's conditional render — D-64).
 *
 * Data fetching:
 *   - `useDesignerSessions(studyId)` runs INSIDE the drawer (not in
 *     ReportShell). The drawer is conditionally mounted, so the query
 *     stays cold until the designer clicks «Смотреть сессии». Saves the
 *     report page-load from one round-trip it doesn't need 95% of the
 *     time.
 *   - `outcomes` is passed in as a prop because ReportShell already has it
 *     (derived from `useBlockEvents` + `classifyOutcome`) — passing it
 *     down reuses the same memoized array, no duplicate work.
 *
 * Accessibility:
 *   - Drawer primitive handles focus-trap + ESC + scrim click + inert
 *     background + prefers-reduced-motion (Radix Dialog under the hood —
 *     see `apps/web/src/components/ui/drawer.tsx`).
 *   - `ariaLabel="Воспроизведение сессии"` (Russian, screen-reader parity).
 *
 * Source: 03-PATTERNS.md §15 lines 588-654 (two-column grid analog) +
 * 03-CONTEXT.md D-60/D-61/D-64 lines 177-213.
 */

import { useState, type JSX } from 'react';

import { Drawer, DrawerFooter, DrawerHeader } from '@/components/ui/drawer';
import type { ClassifyOutcomeResult } from '@/lib/analytics/classify-outcome';
import type { DateRange } from '@/lib/analytics/date-range';
import { useDesignerSessions } from '@/lib/queries/designer-sessions';
import type { Frame } from '@/lib/queries/prototypes';

import { PlaybackPlayer } from './PlaybackPlayer';
import { SessionList, type SessionFilter } from './SessionList';

export interface PlaybackDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studyId: string;
  blockId: string;
  /** Reserved for future use (e.g. re-mint signedUrls on prototype switch). */
  prototypeVersionId: string;
  frames: Frame[];
  /**
   * Per-session outcome classification (passed down from ReportShell so we
   * reuse the same memoized array — no duplicate `classifyOutcome` work).
   */
  outcomes: ClassifyOutcomeResult[];
  /**
   * Plan 03.1-02 — current sidebar date filter (or null = «Всё время»).
   * Forwarded into `useDesignerSessions` so the playback list mirrors the
   * same time window the header tiles and sankey are reading.
   */
  dateRange?: DateRange;
  /**
   * Plan 03.1-04 — controlled selection mode. When defined, the drawer
   * surfaces this as the selected session and reports changes via
   * `onSelectedSessionIdChange`. When `undefined`, the drawer falls back to
   * its original local-state behavior — preserves backward-compat with any
   * fixture or future call site that wants the «pick on the inside»
   * flow.
   */
  selectedSessionId?: string | null;
  onSelectedSessionIdChange?: (id: string | null) => void;
}

export function PlaybackDrawer({
  open,
  onOpenChange,
  studyId,
  blockId,
  prototypeVersionId: _prototypeVersionId,
  frames,
  outcomes,
  dateRange,
  selectedSessionId: controlledSelectedSessionId,
  onSelectedSessionIdChange,
}: PlaybackDrawerProps): JSX.Element {
  // Local Drawer state — re-mounts fresh on next open (D-64). Used when the
  // controlled-mode prop is omitted (backward-compat).
  const [internalSelectedSessionId, setInternalSelectedSessionId] = useState<string | null>(null);
  const isControlled = controlledSelectedSessionId !== undefined;
  const selectedSessionId = isControlled ? controlledSelectedSessionId : internalSelectedSessionId;
  const setSelectedSessionId = (id: string | null) => {
    // Always notify the controlled-mode parent if it provided a setter, AND
    // update local state so the drawer renders correctly when running in
    // uncontrolled mode too (no harm when controlled — the parent's next
    // render reconciles).
    onSelectedSessionIdChange?.(id);
    setInternalSelectedSessionId(id);
  };
  const [filter, setFilter] = useState<SessionFilter>('all');

  // Lazy fetch — sessions list only loads while the drawer is mounted.
  // The date filter is forwarded so the list narrows in lock-step with the
  // report's header tiles when the designer picks a non-default preset.
  const sessionsQuery = useDesignerSessions(studyId, dateRange);
  const sessions = sessionsQuery.data ?? [];

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      side="right"
      ariaLabel="Воспроизведение сессии"
      maxWidth={1040}
    >
      <DrawerHeader
        title="Сессии респондентов"
        meta={<span style={{ font: '500 12px var(--font-mono)' }}>{outcomes.length} сессий</span>}
        onClose={() => onOpenChange(false)}
      />

      {/* Two-column body: 280px session list + flexible player. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '280px 1fr',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {/* Left column — session list. Inset padding so the rows don't
            butt up against the drawer edge. */}
        <div
          style={{
            padding: '16px 12px 16px 24px',
            borderRight: '1px solid var(--border-1)',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          <SessionList
            sessions={sessions}
            outcomes={outcomes}
            selectedSessionId={selectedSessionId}
            onSelect={setSelectedSessionId}
            filter={filter}
            onFilterChange={setFilter}
          />
        </div>

        {/* Right column — player or empty hint. */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          {selectedSessionId ? (
            <PlaybackPlayer sessionId={selectedSessionId} blockId={blockId} frames={frames} />
          ) : (
            <RightColumnEmpty />
          )}
        </div>
      </div>

      {/* Footer hint — only while no session is picked, so the player
          gets the full vertical space once playback starts. */}
      {!selectedSessionId ? (
        <DrawerFooter>
          <span
            style={{
              font: '400 13px var(--font-sans)',
              color: 'var(--text-3)',
            }}
          >
            Кликни на сессию слева, чтобы открыть воспроизведение.
          </span>
        </DrawerFooter>
      ) : null}
    </Drawer>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────

function RightColumnEmpty(): JSX.Element {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <p
        style={{
          margin: 0,
          font: '400 14px/20px var(--font-sans)',
          color: 'var(--text-3)',
          textAlign: 'center',
          maxWidth: 320,
        }}
      >
        Выберите сессию слева, чтобы посмотреть, как респондент проходил прототип.
      </p>
    </div>
  );
}
