/**
 * <CsvDownloadButton /> — Plan 04-05 Task 3.
 *
 * Filter-aware CSV download trigger for the report topbar. Closes M-1 (lazy
 * unfiltered fetch on dialog open) and M-4 (primary CTA uses
 * `var(--text-on-accent)` token — no `#fff` hex fallback).
 *
 *   When filtersActive=false → click → immediate download (current filtered
 *     dataset IS the unfiltered dataset).
 *   When filtersActive=true  → click → open confirmation dialog. The dialog
 *     surfaces three options:
 *       «Скачать это (N)»  — current filtered view (primary CTA).
 *       «Скачать всё (M)»  — entire unfiltered population. Disabled while
 *                              the lazy unfiltered fetch is in flight.
 *       «Отмена»            — close.
 *
 * M-1 closure mechanic:
 *   The component owns three TanStack Query slots that fetch the unfiltered
 *   dataset (sessions / survey-responses / block-events) with NO dateRange.
 *   Each is gated via the `opts.enabled` parameter added in this plan to
 *   `useSurveyResponses`, `useDesignerSessions`, `useBlockEvents`:
 *
 *     enabled = dialogOpen && filtersActive
 *
 *   When the dialog is closed OR filters inactive, none of the three fetches
 *   fire. First-open of the report (the common case — filters inactive) pays
 *   ZERO extra bandwidth. Only when the designer opens the confirmation
 *   dialog do we ask the server for the unfiltered population.
 *
 *   The cache slots are KEYED ON dateRange=null (queryKey already discriminates
 *   per the 03.1-02 / 04-03 pattern) so the unfiltered fetch lives in a slot
 *   independent from the filtered slot ReportShell drives. No collision, no
 *   re-fetch when toggling the dialog.
 *
 * M-4 closure mechanic:
 *   The «Скачать это» primary CTA uses bare `var(--text-on-accent)` with NO
 *   `#fff` fallback. The token was introduced in Plan 04-04 Task 7 in
 *   `apps/web/src/styles/tokens.css` and is defined per skin (paper / white /
 *   dark) — all three currently resolve to white, but routing through the
 *   token keeps future skin changes (e.g. an amber accent that needs black
 *   text) honest.
 */
import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { buildCsv, buildFilename, triggerCsvDownload } from '@/lib/csv/export';
import { useSurveyResponses, type SurveyResponseRow } from '@/lib/queries/survey-responses';
import { useDesignerSessions, type DesignerSession } from '@/lib/queries/designer-sessions';
import { useBlockEvents, type BlockEventRow } from '@/lib/queries/block-events';
import { classifyOutcome, type ClassifyOutcomeResult } from '@/lib/analytics/classify-outcome';
import type { Block } from '@/lib/blocks/types';

// Block types that contribute survey responses (mirrors ReportShell SURVEY_ANALYTICAL_TYPES).
const SURVEY_ANALYTICAL_TYPES: ReadonlyArray<Block['type']> = [
  'choice',
  'scale',
  'nps',
  'agreement',
  'context',
  'open_question',
];

export interface CsvDownloadButtonProps {
  studyId: string;
  studyTitle: string;
  blocks: readonly Block[];
  /** Filtered (current view) — produced by ReportShell's filter chain. */
  sessions: readonly DesignerSession[];
  surveyResponses: readonly SurveyResponseRow[];
  outcomes: readonly ClassifyOutcomeResult[];
  filtersActive: boolean;
  /**
   * Prototype-block driver for the lazy unfiltered events fetch. When the
   * test has no prototype block, both fields are null and the lazy
   * `useBlockEvents` slot stays cold even with the dialog open (the hook's
   * own `!!pvId && !!blockId` enabled-gate short-circuits the request).
   */
  prototypeVersionId: string | null | undefined;
  prototypeBlockId: string | null | undefined;
  /**
   * `finish_frame_ids` from the prototype block content. Required to derive
   * the unfiltered `outcomes` (classifyOutcome consumes this set to mark
   * sessions success vs giveup). Empty array OK — every session classifies
   * as `giveup` then, matching ReportShell's behavior.
   */
  finishFrameIds: readonly string[];
}

export function CsvDownloadButton(props: CsvDownloadButtonProps) {
  const [open, setOpen] = useState(false);

  // The lazy unfiltered fetches are gated on (dialogOpen && filtersActive).
  // When filters are inactive there's no «всё» branch to fetch — the
  // filtered dataset already IS the full population. When the dialog is
  // closed, we conserve bandwidth.
  const lazyEnabled = open && props.filtersActive;

  // Survey-block ids — same predicate as ReportShell so the cache slot
  // keys align (different `dateRange` slot, but same blockIds set).
  const surveyBlockIds = useMemo(
    () => props.blocks.filter((b) => SURVEY_ANALYTICAL_TYPES.includes(b.type)).map((b) => b.id),
    [props.blocks],
  );

  // ── M-1: three lazy unfiltered query slots ──────────────────────────────
  // queryKey includes `dateRange=null` for each, so a SEPARATE cache slot
  // lives next to the filter-active slot ReportShell drives. No collision.

  const unfilteredSessionsQ = useDesignerSessions(props.studyId, undefined, {
    enabled: lazyEnabled,
  });
  const unfilteredSurveyResponsesQ = useSurveyResponses(props.studyId, surveyBlockIds, undefined, {
    enabled: lazyEnabled,
  });
  const unfilteredEventsQ = useBlockEvents(
    props.prototypeVersionId ?? undefined,
    props.prototypeBlockId ?? undefined,
    undefined,
    { enabled: lazyEnabled },
  );

  // Derive unfiltered outcomes locally — same classifyOutcome chain ReportShell
  // uses, but driven by unfiltered events. classifyOutcome is pure.
  const unfilteredOutcomes = useMemo<ClassifyOutcomeResult[]>(() => {
    const events = unfilteredEventsQ.data ?? [];
    if (events.length === 0) return [];
    const bySession = new Map<string, BlockEventRow[]>();
    for (const e of events) {
      const list = bySession.get(e.session_id) ?? [];
      list.push(e);
      bySession.set(e.session_id, list);
    }
    const finishIds = [...props.finishFrameIds];
    const result: ClassifyOutcomeResult[] = [];
    for (const evts of bySession.values()) {
      const r = classifyOutcome(evts, finishIds);
      if (r !== null) result.push(r);
    }
    return result;
  }, [unfilteredEventsQ.data, props.finishFrameIds]);

  // Loading flag: at least one of the three lazy slots is still in flight,
  // AND we're actually expected to be loading (dialog open + filters active).
  // Block-events query disables itself when there's no prototype, so
  // we mask its `isLoading` via the same `enabled` predicate the hook uses.
  const hasPrototype = !!(props.prototypeVersionId && props.prototypeBlockId);
  const loadingUnfiltered =
    lazyEnabled &&
    (unfilteredSessionsQ.isLoading ||
      (surveyBlockIds.length > 0 && unfilteredSurveyResponsesQ.isLoading) ||
      (hasPrototype && unfilteredEventsQ.isLoading));

  // Unfiltered datasets — readable defaults so the renderer doesn't need to
  // null-check inside the count tile.
  const unfilteredSessions = unfilteredSessionsQ.data ?? [];
  const unfilteredSurveyResponses = unfilteredSurveyResponsesQ.data ?? [];

  // ── Action handlers ────────────────────────────────────────────────────

  const downloadFiltered = () => {
    const csv = buildCsv(props.blocks, props.sessions, props.surveyResponses, props.outcomes, {
      includeBom: true,
      filtersActive: true,
    });
    triggerCsvDownload(csv, buildFilename(props.studyTitle, true));
    setOpen(false);
  };

  const downloadAll = () => {
    const csv = buildCsv(
      props.blocks,
      unfilteredSessions,
      unfilteredSurveyResponses,
      unfilteredOutcomes,
      { includeBom: true, filtersActive: false },
    );
    triggerCsvDownload(csv, buildFilename(props.studyTitle, false));
    setOpen(false);
  };

  const onClick = () => {
    if (!props.filtersActive) {
      // No filters → filtered === unfiltered → immediate download with no
      // confirmation dialog. Saves a click in the common case.
      const csv = buildCsv(props.blocks, props.sessions, props.surveyResponses, props.outcomes, {
        includeBom: true,
        filtersActive: false,
      });
      triggerCsvDownload(csv, buildFilename(props.studyTitle, false));
      return;
    }
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        aria-label="Скачать CSV"
        style={{
          height: 32,
          padding: '0 14px',
          background: 'transparent',
          color: 'var(--text-1)',
          border: '1px solid var(--border-1)',
          borderRadius: 'var(--radius)',
          font: '500 13px var(--font-sans)',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          transition:
            'background 120ms cubic-bezier(.2,.7,.3,1), border-color 120ms cubic-bezier(.2,.7,.3,1)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--bg-chip)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
      >
        <Download size={14} strokeWidth={1.5} />
        Скачать CSV
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Скачать CSV</DialogTitle>
            <DialogDescription>
              Фильтры активны — что выгрузить? Файл содержит по одной строке на сессию и колонки для
              каждого блока.
            </DialogDescription>
          </DialogHeader>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: '4px 0 12px',
              font: '400 13.5px/20px var(--font-sans)',
              color: 'var(--text-1)',
            }}
          >
            <div style={{ display: 'flex', gap: 16 }}>
              <span style={{ color: 'var(--text-2)', minWidth: 140 }}>Под фильтрами:</span>
              <strong style={{ font: '500 13.5px var(--font-mono)' }}>
                {props.sessions.length}
              </strong>
              <span style={{ color: 'var(--text-3)' }}>сессий</span>
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <span style={{ color: 'var(--text-2)', minWidth: 140 }}>Без фильтров:</span>
              <strong style={{ font: '500 13.5px var(--font-mono)' }}>
                {loadingUnfiltered ? '…' : unfilteredSessions.length}
              </strong>
              <span style={{ color: 'var(--text-3)' }}>сессий</span>
            </div>
            {loadingUnfiltered && (
              <p
                style={{
                  margin: '4px 0 0',
                  font: '400 12px var(--font-mono)',
                  color: 'var(--text-3)',
                }}
              >
                Загружаем полную выборку, чтобы посчитать «Скачать всё»…
              </p>
            )}
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={secondaryBtnStyle}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-chip)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={downloadAll}
              disabled={loadingUnfiltered}
              aria-busy={loadingUnfiltered || undefined}
              style={{
                ...secondaryBtnStyle,
                opacity: loadingUnfiltered ? 0.6 : 1,
                cursor: loadingUnfiltered ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(e) => {
                if (!loadingUnfiltered) e.currentTarget.style.background = 'var(--bg-chip)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              Скачать всё ({loadingUnfiltered ? '…' : unfilteredSessions.length})
            </button>
            <button
              type="button"
              onClick={downloadFiltered}
              style={primaryBtnStyle}
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = 'brightness(0.96)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = 'none';
              }}
            >
              Скачать это ({props.sessions.length})
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Inline styles (CSS-vars only — no hardcoded colours, M-4 closure) ──

const secondaryBtnStyle: React.CSSProperties = {
  height: 32,
  padding: '0 14px',
  background: 'transparent',
  color: 'var(--text-1)',
  border: '1px solid var(--border-1)',
  borderRadius: 'var(--radius)',
  font: '500 13px var(--font-sans)',
  cursor: 'pointer',
  transition: 'background 120ms cubic-bezier(.2,.7,.3,1)',
};

const primaryBtnStyle: React.CSSProperties = {
  height: 32,
  padding: '0 16px',
  background: 'var(--color-accent)',
  // M-4 closure — bare token, no `#fff` fallback (introduced in Plan 04-04 Task 7).
  color: 'var(--text-on-accent)',
  border: 0,
  borderRadius: 'var(--radius)',
  font: '500 13px var(--font-sans)',
  cursor: 'pointer',
  transition: 'filter 120ms cubic-bezier(.2,.7,.3,1)',
};
