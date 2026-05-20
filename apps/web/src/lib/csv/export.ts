/**
 * `buildCsv` — pure-fn CSV serializer for designer-side export (Plan 04-05 §2).
 *
 * The CSV column contract is locked in CONTEXT.md D-110:
 *
 *   Meta columns (fixed order):
 *     session_id,started_at,completed_at,duration_seconds,device_type,outcome
 *
 *   Per-block columns (in `block.position` order, welcome/thanks skipped):
 *     choice           → q{p}_choice                         (single = label, multi = pipe-separated labels)
 *                        q{p}_choice_other_text              (only when hasOtherOption=true)
 *     scale            → q{p}_scale                          (integer)
 *     nps              → q{p}_nps                            (integer 0..10)
 *     agreement        → q{p}_agreement                      (TRUE / FALSE)
 *     context          → q{p}_context_age                    (enabled only)
 *                        q{p}_context_experience             (enabled only)
 *                        q{p}_context_role                   (enabled only)
 *     prototype        → q{p}_prototype_outcome              (success / giveup)
 *                        q{p}_prototype_duration_s
 *     open_question    → q{p}_open_question_text
 *
 * Wire format (papaparse defaults we explicitly opt into):
 *   - Delimiter:  ,
 *   - Newline:    \r\n  (CRLF — Excel convention)
 *   - Quoting:    smart (default of `Papa.unparse` — only fields containing
 *                 ",", "\"" or a newline get quoted; embedded quotes doubled).
 *   - Optional BOM (`includeBom: true` → prepend U+FEFF) so Excel detects
 *     UTF-8 for Cyrillic correctness. M-1 closure path (Plan 04-05 Task 3)
 *     turns this on by default at the consumer site.
 *
 * Purity contract:
 *   - No Supabase. No React. No `Date.now()`. No reads from `window` or
 *     `document`. Given the same inputs, the same string out — that's what
 *     makes the golden-fixture tests (Plan 04-05 Task 2) reliable.
 *   - `triggerCsvDownload` IS impure (it touches Blob/URL/document); kept
 *     separately so callers can use `buildCsv` from a unit-test or an
 *     Edge Function without rebinding `document`.
 *
 * Pitfall log:
 *   - papaparse's `Papa.unparse(data, opts)` accepts either an array of
 *     row-objects (auto-discovered fields) OR an `{ fields, data }` shape
 *     where `data` is a `string[][]`. We use the latter form because (1)
 *     it locks the header order to OUR D-110 ordering rather than papaparse's
 *     iteration order, and (2) it lets us emit an EMPTY cell as `''` instead
 *     of `'undefined'`.
 *   - Numeric values are serialized via `String(...)` — papaparse would
 *     stringify `0` as `'0'` already, but we don't want to accidentally
 *     route a `0` through coercion that produces `''` for falsy values.
 *   - The session-table column is `device_type` (not `device_class` — the
 *     plan spec used the latter as a placeholder; the DB column is
 *     `sessions.device_type` per migrations/00001).
 */
import Papa from 'papaparse';

import type { Block } from '@/lib/blocks/types';
import type {
  AgreementAnswer,
  ChoiceAnswer,
  ChoiceContent,
  ContextAnswer,
  ContextContent,
  NpsAnswer,
  OpenQuestionContent,
  ScaleAnswer,
  ScaleContent,
} from '@/lib/blocks/schemas';
import type { ClassifyOutcomeResult } from '@/lib/analytics/classify-outcome';
import type { SurveyResponseRow } from '@/lib/queries/survey-responses';
import type { DesignerSession } from '@/lib/queries/designer-sessions';

export interface BuildCsvOptions {
  /** Symbol to write into empty cells. Defaults to `''` per D-110. */
  emptyValue?: string;
  /** Prepend U+FEFF so Excel detects UTF-8. Recommended `true` at consumer sites. */
  includeBom?: boolean;
  /**
   * Informational. NOT included in the CSV bytes. The consumer button in
   * Task 3 sets this to log a filename suffix; included here so the API
   * is symmetric across both call sites.
   */
  filtersActive?: boolean;
}

const META_HEADERS: ReadonlyArray<string> = [
  'session_id',
  'started_at',
  'completed_at',
  'duration_seconds',
  'device_type',
  'outcome',
];

/**
 * Builds the per-block header tail in `block.position` order. Welcome /
 * thanks contribute zero columns. `choice` adds 1 or 2 columns depending
 * on whether the block enabled the «Другое» option. `context` adds 0..3
 * columns depending on which sub-questions are enabled.
 *
 * Exported only as part of `buildHeaders` for testing convenience; the
 * full headers ARE the contract being golden-tested.
 */
function buildHeaders(blocks: readonly Block[]): string[] {
  const headers: string[] = [...META_HEADERS];
  for (const block of blocks) {
    const p = block.position;
    switch (block.type) {
      case 'welcome':
      case 'thanks':
        // No data column — runner doesn't write responses.
        break;
      case 'choice': {
        headers.push(`q${p}_choice`);
        const c = block.content as ChoiceContent;
        if (c.hasOtherOption) headers.push(`q${p}_choice_other_text`);
        break;
      }
      case 'scale':
        headers.push(`q${p}_scale`);
        break;
      case 'nps':
        headers.push(`q${p}_nps`);
        break;
      case 'agreement':
        headers.push(`q${p}_agreement`);
        break;
      case 'context': {
        const c = block.content as ContextContent;
        if (c.age_question?.enabled) headers.push(`q${p}_context_age`);
        if (c.experience_question?.enabled) headers.push(`q${p}_context_experience`);
        if (c.role_question?.enabled) headers.push(`q${p}_context_role`);
        break;
      }
      case 'prototype':
        headers.push(`q${p}_prototype_outcome`, `q${p}_prototype_duration_s`);
        break;
      case 'open_question':
        headers.push(`q${p}_open_question_text`);
        break;
      default:
        // Phase 4.1 / Phase 7 blocks (matrix, ranking, etc.) — punt for now.
        // The CSV header CONTRACT widens when those ship; this function will
        // grow new cases.
        break;
    }
  }
  return headers;
}

/**
 * Build a `Map<sessionId::blockId, SurveyResponseRow>` once so per-cell
 * lookups during row generation are O(1). The two-step nested map shape
 * would be more idiomatic but the flat-string key keeps both
 * allocations and lookups cheap for the row-builder's tight loop.
 */
function indexResponses(rows: readonly SurveyResponseRow[]): Map<string, SurveyResponseRow> {
  const m = new Map<string, SurveyResponseRow>();
  for (const r of rows) m.set(`${r.session_id}::${r.block_id}`, r);
  return m;
}

/** Returns the integer-second duration between two ISO strings, or `''` when either is missing. */
function durationSeconds(startedAt: string, completedAt: string | null | undefined): string {
  if (!completedAt) return '';
  const ms = Date.parse(completedAt) - Date.parse(startedAt);
  if (!Number.isFinite(ms) || ms < 0) return '';
  return String(Math.round(ms / 1000));
}

/**
 * Produce one row (string-keyed, one entry per header) for a given session.
 * Cells absent from the returned object render as `options.emptyValue` (default `''`).
 */
function buildSessionRow(
  session: DesignerSession,
  blocks: readonly Block[],
  responsesByKey: Map<string, SurveyResponseRow>,
  outcomesBySession: Map<string, ClassifyOutcomeResult>,
): Record<string, string> {
  const out: Record<string, string> = {};
  const sessOutcome = outcomesBySession.get(session.id);

  out['session_id'] = session.id;
  out['started_at'] = session.started_at;
  out['completed_at'] = session.completed_at ?? '';
  out['duration_seconds'] = durationSeconds(session.started_at, session.completed_at);
  out['device_type'] = session.device_type ?? '';
  out['outcome'] = sessOutcome?.outcome ?? '';

  for (const block of blocks) {
    const p = block.position;
    const resp = responsesByKey.get(`${session.id}::${block.id}`);
    const ans = resp?.answer as unknown;

    switch (block.type) {
      case 'welcome':
      case 'thanks':
        break;
      case 'choice': {
        const c = block.content as ChoiceContent;
        const a = ans as Partial<ChoiceAnswer> | undefined;
        if (a) {
          if (c.mode === 'single' && typeof a.selectedId === 'string') {
            const opt = c.options.find((o) => o.id === a.selectedId);
            out[`q${p}_choice`] = opt?.label ?? a.selectedId;
          } else if (c.mode === 'multi' && Array.isArray(a.selectedIds)) {
            const labels = a.selectedIds.map(
              (id) => c.options.find((o) => o.id === id)?.label ?? id,
            );
            out[`q${p}_choice`] = labels.join('|');
          }
        }
        if (c.hasOtherOption) {
          out[`q${p}_choice_other_text`] = (a?.otherText as string | undefined) ?? '';
        }
        break;
      }
      case 'scale': {
        const a = ans as Partial<ScaleAnswer> | undefined;
        if (typeof a?.value === 'number') out[`q${p}_scale`] = String(a.value);
        // Suppress unused-var warning on `_c` for the linter strictness — we
        // intentionally read the schema only to verify shape via the type cast.
        void (block.content as ScaleContent);
        break;
      }
      case 'nps': {
        const a = ans as Partial<NpsAnswer> | undefined;
        if (typeof a?.score === 'number') out[`q${p}_nps`] = String(a.score);
        break;
      }
      case 'agreement': {
        const a = ans as Partial<AgreementAnswer> | undefined;
        if (resp) {
          // Response present → TRUE if `agreed`, FALSE otherwise. Empty when
          // the session never reached this block (no response row).
          out[`q${p}_agreement`] = a?.agreed === true ? 'TRUE' : 'FALSE';
        }
        break;
      }
      case 'context': {
        const c = block.content as ContextContent;
        const a = ans as Partial<ContextAnswer> | undefined;
        if (c.age_question?.enabled) {
          out[`q${p}_context_age`] = (a?.age as string | undefined) ?? '';
        }
        if (c.experience_question?.enabled) {
          out[`q${p}_context_experience`] =
            typeof a?.experience === 'number' ? String(a.experience) : '';
        }
        if (c.role_question?.enabled) {
          out[`q${p}_context_role`] = (a?.role as string | undefined) ?? '';
        }
        break;
      }
      case 'prototype': {
        // Prototype outcome + duration come from `outcomes`, not `responses`
        // (the prototype block doesn't write to `responses` — it writes to
        // `events`, classified by classifyOutcome). Same `sessOutcome` that
        // backs the meta-column `outcome`.
        if (sessOutcome) {
          out[`q${p}_prototype_outcome`] = sessOutcome.outcome;
          out[`q${p}_prototype_duration_s`] = String(Math.round(sessOutcome.durationMs / 1000));
        }
        break;
      }
      case 'open_question': {
        const a = ans as { text?: string } | undefined;
        void (block.content as OpenQuestionContent);
        if (typeof a?.text === 'string') out[`q${p}_open_question_text`] = a.text;
        break;
      }
      default:
        break;
    }
  }
  return out;
}

/**
 * Pure CSV builder. See file header for the column contract.
 */
export function buildCsv(
  blocks: readonly Block[],
  sessions: readonly DesignerSession[],
  surveyResponses: readonly SurveyResponseRow[],
  outcomes: readonly ClassifyOutcomeResult[],
  options: BuildCsvOptions = {},
): string {
  const emptyValue = options.emptyValue ?? '';

  // 1. Position-sorted blocks (skip welcome/thanks at the header layer).
  const orderedBlocks = [...blocks]
    .sort((a, b) => a.position - b.position)
    .filter((b) => b.type !== 'welcome' && b.type !== 'thanks');

  // 2. Headers + indexes.
  const headers = buildHeaders(orderedBlocks);
  const responsesByKey = indexResponses(surveyResponses);
  const outcomesBySession = new Map(outcomes.map((o) => [o.sessionId, o] as const));

  // 3. Rows in session order (caller's iteration order; ReportShell sorts
  //    sessions DESC by started_at upstream).
  const dataRows: string[][] = sessions.map((s) => {
    const rec = buildSessionRow(s, orderedBlocks, responsesByKey, outcomesBySession);
    return headers.map((h) => rec[h] ?? emptyValue);
  });

  // 4. papaparse unparse — fields/data form locks header order.
  let csv = Papa.unparse(
    { fields: headers as string[], data: dataRows },
    {
      delimiter: ',',
      newline: '\r\n',
      // Smart quoting: only quote when needed (default behavior). The header
      // row + data rows both get the same treatment so consumer parsers
      // (Excel, Numbers, pandas) recover values identically.
      quotes: false,
    },
  );

  // 5. Trailing CRLF — `Papa.unparse` does NOT emit one by default. Empty
  //    fixture (header-only) expects `...\r\n` so we always append.
  if (!csv.endsWith('\r\n')) csv += '\r\n';

  if (options.includeBom) csv = '\uFEFF' + csv;
  return csv;
}

/**
 * Impure — drop a CSV blob into the user's downloads. Must be called from a
 * user-initiated event handler (click) so the browser allows the synthetic
 * `<a>` click to dispatch.
 *
 * Safe to no-op when `typeof document === 'undefined'` (SSR / Node tests).
 */
export function triggerCsvDownload(csv: string, filename: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Filename builder. Sanitizes the study title to a filesystem-safe slug,
 * caps the slug at 60 chars, appends ISO date, and (optionally) the
 * `-filtered` suffix to telegraph that the bytes reflect a narrowed view.
 *
 * The slug allows Latin and Cyrillic letters + digits + hyphens / underscores.
 * Everything else (spaces, punctuation, emoji) collapses to `-`.
 */
export function buildFilename(studyTitle: string, filtersActive: boolean): string {
  // Trim → replace runs of unsafe chars with `-` → collapse multi-hyphens
  // → strip leading/trailing hyphens → cap at 60.
  let safe = studyTitle
    .trim()
    .replace(/[^A-Za-zА-Яа-яЁё0-9_-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (safe.length === 0) safe = 'export';
  safe = safe.slice(0, 60);
  const date = new Date().toISOString().slice(0, 10);
  return `${safe}-${date}${filtersActive ? '-filtered' : ''}.csv`;
}
