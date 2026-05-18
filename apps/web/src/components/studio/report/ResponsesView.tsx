/**
 * `ResponsesView` — per-response table for the «Ответы N» view-mode (Plan 03.1-04).
 *
 * Source contract: CONTEXT.md GA3 / D-73 — 5 columns:
 *   1. Дата + время (140 px, IBM Plex Mono, RU short format)
 *   2. Устройство     (80 px, Smartphone / Monitor / HelpCircle icon + SR label)
 *   3. Результат      (100 px, outcome chip: «Цель» / «Сдались» / «Неполный»)
 *   4. Ответы         (flex, prototype-block summary or em-dash placeholder)
 *   5. Действия       (60 px, «▶ Плейбэк» icon-button)
 *
 * The entire row is clickable and triggers the same `onRowClick(sessionId)` as
 * the icon-button — `onRowClick` is the single integration point with
 * ReportShell (which wires it to `setSelectedSessionId(id) + setPlaybackOpen(true)`).
 *
 * Visual conventions:
 *   - Card-wrapped table (rounded var(--radius), border var(--border-1)).
 *   - Zebra striping: even rows on var(--bg-card), odd rows transparent.
 *   - Hex literals forbidden except the one documented exception in the chip
 *     foreground (no `--text-on-success` token in tokens.css — open TODO for
 *     Phase 4).
 *   - Icons: lucide-react `Smartphone`, `Monitor`, `HelpCircle`, `Play`.
 *
 * Accessibility:
 *   - Each row is `tabIndex={0}` with keyboard Enter/Space handling.
 *   - Device icon has a `<span class="sr-only">` Russian fallback label.
 *   - Outcome chip uses semantic background colors with sufficient contrast.
 *   - Action button has `aria-label` describing the session date.
 *
 * Empty state — when `rows.length === 0`, the table renders a centered
 * placeholder. Default copy «Нет ответов в этом периоде / типе.» per GA3;
 * `emptyStateMessage` prop allows override for future call sites.
 *
 * Pluralization caveat: Russian noun forms «1 фрейм / 2 фрейма / 5 фреймов»
 * are simplified to a 2-form switch («1 фрейм» vs «N фреймов») in this
 * plan; full pluralization is a Phase 4 polish.
 */

import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { HelpCircle, Monitor, Play, Smartphone } from 'lucide-react';
import type { JSX } from 'react';

import type { ResponseDeviceType, ResponseOutcome, ResponseRow } from '@/lib/queries/responses';

export interface ResponsesViewProps {
  rows: ResponseRow[];
  /**
   * Fired on row click OR on the action-button click. Caller wires this to
   * `(id) => { setSelectedSessionId(id); setPlaybackOpen(true); }` in
   * ReportShell so the PlaybackDrawer opens pre-selected to that session.
   */
  onRowClick: (sessionId: string) => void;
  /** Empty-state copy — defaults to «Нет ответов в этом периоде / типе.» per GA3. */
  emptyStateMessage?: string;
}

const DEFAULT_EMPTY_MESSAGE = 'Нет ответов в этом периоде / типе.';

export function ResponsesView({
  rows,
  onRowClick,
  emptyStateMessage = DEFAULT_EMPTY_MESSAGE,
}: ResponsesViewProps): JSX.Element {
  if (rows.length === 0) {
    return (
      <div
        style={{
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border-1)',
          background: 'var(--bg-card)',
          padding: 32,
          textAlign: 'center',
        }}
      >
        <p
          style={{
            margin: 0,
            color: 'var(--text-3)',
            font: '400 14px/20px var(--font-sans)',
          }}
        >
          {emptyStateMessage}
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border-1)',
        background: 'var(--bg-card)',
        overflow: 'hidden',
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          tableLayout: 'fixed',
          font: '400 13px var(--font-sans)',
          color: 'var(--text-1)',
        }}
      >
        <colgroup>
          <col style={{ width: 140 }} />
          <col style={{ width: 80 }} />
          <col style={{ width: 100 }} />
          <col style={{ width: 'auto' }} />
          <col style={{ width: 60 }} />
        </colgroup>
        <thead>
          <tr
            style={{
              borderBottom: '1px solid var(--border-1)',
              background: 'var(--bg-card)',
            }}
          >
            <Th>Дата и время</Th>
            <Th>Устройство</Th>
            <Th>Результат</Th>
            <Th>Ответы</Th>
            <Th>
              <span className="sr-only">Действия</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <Row key={row.sessionId} row={row} zebra={idx % 2 === 0} onRowClick={onRowClick} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────

function Th({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <th
      style={{
        textAlign: 'left',
        padding: '10px 12px',
        font: '500 12px/16px var(--font-sans)',
        color: 'var(--text-3)',
        letterSpacing: '0.02em',
      }}
    >
      {children}
    </th>
  );
}

interface RowProps {
  row: ResponseRow;
  zebra: boolean;
  onRowClick: (sessionId: string) => void;
}

function Row({ row, zebra, onRowClick }: RowProps): JSX.Element {
  const dateText = formatStartedAt(row.startedAt);

  const handleActivate = () => onRowClick(row.sessionId);
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleActivate();
    }
  };

  return (
    <tr
      tabIndex={0}
      role="button"
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
      style={{
        cursor: 'pointer',
        background: zebra ? 'var(--bg-card)' : 'transparent',
        borderTop: '1px solid var(--border-2)',
        transition: 'background 120ms cubic-bezier(.2,.7,.3,1)',
      }}
    >
      <td
        style={{
          padding: '10px 12px',
          font: '400 13px var(--font-mono)',
          color: 'var(--text-1)',
          whiteSpace: 'nowrap',
        }}
      >
        {dateText}
      </td>
      <td style={{ padding: '10px 12px' }}>
        <DeviceCell deviceType={row.deviceType} />
      </td>
      <td style={{ padding: '10px 12px' }}>
        <OutcomeChip outcome={row.outcome} />
      </td>
      <td
        style={{
          padding: '10px 12px',
          color: row.prototypeSummary ? 'var(--text-1)' : 'var(--text-3)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {formatPrototypeSummary(row)}
      </td>
      <td style={{ padding: '6px 12px', textAlign: 'right' }}>
        <PlaybackButton
          sessionId={row.sessionId}
          dateLabel={dateText}
          onClick={(e) => {
            // Stop the click from bubbling to the row handler — otherwise
            // onRowClick fires twice.
            e.stopPropagation();
            onRowClick(row.sessionId);
          }}
        />
      </td>
    </tr>
  );
}

function DeviceCell({ deviceType }: { deviceType: ResponseDeviceType }): JSX.Element {
  const { Icon, label } = deviceIconAndLabel(deviceType);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Icon
        size={16}
        strokeWidth={1.5}
        aria-hidden="true"
        style={{ color: 'var(--text-3)', flexShrink: 0 }}
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}

function OutcomeChip({ outcome }: { outcome: ResponseOutcome }): JSX.Element {
  if (outcome === 'success') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          height: 22,
          padding: '0 8px',
          borderRadius: 'var(--radius)',
          background: 'var(--color-success)',
          // TODO Phase 4: introduce --text-on-success token. The single-hex
          // exception is documented in the file header.
          color: '#fff',
          font: '500 12px var(--font-sans)',
        }}
      >
        Цель
      </span>
    );
  }
  if (outcome === 'giveup') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          height: 22,
          padding: '0 8px',
          borderRadius: 'var(--radius)',
          background: 'var(--color-warning)',
          color: 'var(--text-on-accent)',
          font: '500 12px var(--font-sans)',
        }}
      >
        Сдались
      </span>
    );
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 22,
        padding: '0 8px',
        borderRadius: 'var(--radius)',
        background: 'transparent',
        border: '1px solid var(--border-1)',
        color: 'var(--text-3)',
        font: '500 12px var(--font-sans)',
      }}
    >
      Неполный
    </span>
  );
}

interface PlaybackButtonProps {
  sessionId: string;
  dateLabel: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

function PlaybackButton({ dateLabel, onClick }: PlaybackButtonProps): JSX.Element {
  return (
    <button
      type="button"
      aria-label={`Открыть плейбэк сессии ${dateLabel}`}
      onClick={onClick}
      style={{
        width: 32,
        height: 32,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: 0,
        borderRadius: 'var(--radius)',
        cursor: 'pointer',
        color: 'var(--text-1)',
        transition: 'background 120ms cubic-bezier(.2,.7,.3,1)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-input)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <Play size={16} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}

// ─── Pure helpers ───────────────────────────────────────────────────────

function deviceIconAndLabel(deviceType: ResponseDeviceType): {
  Icon: typeof Smartphone;
  label: string;
} {
  if (deviceType === 'mobile') return { Icon: Smartphone, label: 'Мобильное устройство' };
  if (deviceType === 'tablet') return { Icon: Smartphone, label: 'Планшет' };
  if (deviceType === 'desktop') return { Icon: Monitor, label: 'Десктоп' };
  return { Icon: HelpCircle, label: 'Неизвестное устройство' };
}

function formatStartedAt(iso: string): string {
  try {
    return format(parseISO(iso), 'dd.MM.yyyy, HH:mm', { locale: ru });
  } catch {
    return iso;
  }
}

function formatPrototypeSummary(row: ResponseRow): string {
  if (!row.prototypeSummary) return '—';
  const { framesVisited, durationMs } = row.prototypeSummary;
  // Simple 2-form pluralization: «1 фрейм» / «N фреймов». Full Russian
  // pluralization («2 фрейма» / «5 фреймов») is deferred to Phase 4 — the
  // 2-form approach catches the singular vs plural distinction and reads
  // naturally for the common N ≠ 1 case.
  const framesWord = framesVisited === 1 ? 'фрейм' : 'фреймов';
  const minutes = (durationMs / 60_000).toFixed(1);
  return `«${framesVisited} ${framesWord} · ${minutes} мин»`;
}
