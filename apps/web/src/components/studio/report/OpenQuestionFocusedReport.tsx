/**
 * <OpenQuestionFocusedReport /> — focused-block card for `open_question`-typed
 * blocks (ANALYTICS-14, quote list with search + length filter + sort).
 *
 * Phase 4 / Plan 04-04 Task 3. Consumes the raw survey-response stream for
 * this block from `useSurveyResponses`. Filters internally by
 * `validSessionIds` so the visible list never spills sessions excluded by
 * the report-wide filters (B2 ordering lock preserved).
 *
 * Visual:
 *   - Header pattern from PrototypeFocusedReport.
 *   - Toolbar row: search input + min-length + max-length number inputs +
 *     sort select. All controls are 32px height per design-system.
 *   - List below: each row = quote text + small caption «N символов · дата».
 *   - Empty state: «Нет ответов под текущими фильтрами».
 *
 * REPORT-07 default-OFF (M-2 / Plan 04-07): when `hideOpenAnswers === true`,
 * replace the whole quote list with «N ответов скрыто дизайнером» — the
 * designer (public-share owner) opted out of revealing open answers.
 *
 * Low-N gate (D-103, M-2): when `validSessionIds.size < 5` → LowNGateCard
 * with publicMode forwarded.
 *
 * Threat T-04-04-01 mitigation: quote `text` is rendered via React text node
 * (auto-escaped). No `dangerouslySetInnerHTML` anywhere.
 */

import { useMemo, useState, type JSX } from 'react';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { Block } from '@/lib/blocks/types';
import type { OpenQuestionContent } from '@/lib/blocks/schemas';
import { blockVisualOf } from '@/lib/blocks/visual';
import type { SurveyResponseRow } from '@/lib/queries/survey-responses';
import { passLowNGate } from '@/lib/analytics/low-n-gate';
import { LowNGateCard } from './LowNGateCard';

export interface OpenQuestionFocusedReportProps {
  block: Block;
  /** Filtered survey-response rows whose `block_id === block.id`. */
  responses: readonly SurveyResponseRow[];
  /** Filter-aware sessionId set — drives low-N gate AND visibility filter. */
  validSessionIds: ReadonlySet<string>;
  position: number;
  filtersActive: boolean;
  onResetFilters?: () => void;
  publicMode?: boolean;
  hideOpenAnswers?: boolean;
}

type SortKey = 'newest' | 'longest' | 'shortest';

interface QuoteEntry {
  sessionId: string;
  submittedAt: string;
  text: string;
}

export function OpenQuestionFocusedReport({
  block,
  responses,
  validSessionIds,
  position,
  filtersActive,
  onResetFilters,
  publicMode = false,
  hideOpenAnswers = false,
}: OpenQuestionFocusedReportProps): JSX.Element {
  // Hooks MUST run unconditionally on every render (react-hooks/rules-of-hooks).
  // We compute everything first, then decide whether to short-circuit to the
  // low-N gate at render time below.
  const content = block.content as OpenQuestionContent;
  const visual = blockVisualOf(block.type);
  const ChipIcon = visual.icon;
  const title = (content.question ?? '').trim() || 'Открытый вопрос';

  // Pre-filter to valid sessions + extract `text` from the `answer` jsonb.
  // The shape is `{ text?: string }` per the runner submit path.
  const allEntries = useMemo<QuoteEntry[]>(() => {
    const out: QuoteEntry[] = [];
    for (const r of responses) {
      if (!validSessionIds.has(r.session_id)) continue;
      const a = r.answer as { text?: string } | undefined;
      const text = typeof a?.text === 'string' ? a.text : '';
      if (text.length === 0) continue;
      out.push({ sessionId: r.session_id, submittedAt: r.submitted_at, text });
    }
    return out;
  }, [responses, validSessionIds]);

  const [search, setSearch] = useState('');
  const [minLength, setMinLength] = useState<number | ''>('');
  const [maxLength, setMaxLength] = useState<number | ''>('');
  const [sortBy, setSortBy] = useState<SortKey>('newest');

  const filtered = useMemo<QuoteEntry[]>(() => {
    let list = allEntries;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((e) => e.text.toLowerCase().includes(q));
    }
    if (typeof minLength === 'number') {
      list = list.filter((e) => e.text.length >= minLength);
    }
    if (typeof maxLength === 'number') {
      list = list.filter((e) => e.text.length <= maxLength);
    }
    // Sort — create a fresh copy so we don't mutate the upstream memoization.
    const sorted = [...list];
    if (sortBy === 'newest') {
      sorted.sort((a, b) =>
        a.submittedAt < b.submittedAt ? 1 : a.submittedAt > b.submittedAt ? -1 : 0,
      );
    } else if (sortBy === 'longest') {
      sorted.sort((a, b) => b.text.length - a.text.length);
    } else if (sortBy === 'shortest') {
      sorted.sort((a, b) => a.text.length - b.text.length);
    }
    return sorted;
  }, [allEntries, search, minLength, maxLength, sortBy]);

  // Low-N gate evaluated AFTER all hooks ran — count of valid sessions, not
  // count of responses (a session may have no open-answer response yet still
  // count toward N for the gate).
  if (!passLowNGate(validSessionIds.size)) {
    return (
      <LowNGateCard
        currentN={validSessionIds.size}
        filtersActive={filtersActive}
        publicMode={publicMode}
        onResetFilters={onResetFilters}
      />
    );
  }

  // ── REPORT-07 hide path ───────────────────────────────────────────────
  // Even when designer hid open answers, the header + N counter remain so
  // a public viewer sees the question and its volume; only the text list is
  // suppressed. The hidden-count comes from `allEntries.length` (valid-only).
  const totalVisible = allEntries.length;

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
          {totalVisible} ответов
        </span>
      </header>

      {/* REPORT-07 default-OFF: hide the list entirely if designer didn't
          opt-in for public open-answer reveal. */}
      {hideOpenAnswers ? (
        <p
          style={{
            font: '400 14px/22px var(--font-sans)',
            color: 'var(--text-3)',
            background: 'var(--bg-input)',
            padding: '14px 16px',
            borderRadius: 'var(--radius)',
            margin: 0,
          }}
        >
          {totalVisible} ответов скрыто. Дизайнер не разрешил показывать открытые ответы публично.
        </p>
      ) : (
        <>
          {/* Toolbar */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 100px 100px 160px',
              gap: 10,
              alignItems: 'center',
            }}
          >
            <input
              type="search"
              placeholder="Поиск по тексту…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={inputStyle}
            />
            <input
              type="number"
              min={0}
              placeholder="Мин. длина"
              value={minLength}
              onChange={(e) => {
                const v = e.target.value;
                setMinLength(v === '' ? '' : Math.max(0, Number(v)));
              }}
              style={inputStyle}
            />
            <input
              type="number"
              min={0}
              placeholder="Макс. длина"
              value={maxLength}
              onChange={(e) => {
                const v = e.target.value;
                setMaxLength(v === '' ? '' : Math.max(0, Number(v)));
              }}
              style={inputStyle}
            />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              style={inputStyle}
            >
              <option value="newest">Сначала новые</option>
              <option value="longest">Сначала длинные</option>
              <option value="shortest">Сначала короткие</option>
            </select>
          </div>

          {/* Quote list */}
          {filtered.length === 0 ? (
            <p
              style={{
                font: '400 14px var(--font-sans)',
                color: 'var(--text-3)',
                margin: 0,
              }}
            >
              Нет ответов под текущими фильтрами.
            </p>
          ) : (
            <ul
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                margin: 0,
                padding: 0,
                listStyle: 'none',
                maxHeight: 520,
                overflowY: 'auto',
              }}
            >
              {filtered.map((entry) => (
                <li
                  key={entry.sessionId}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    padding: '12px 14px',
                    background: 'var(--bg-input)',
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--border-1)',
                  }}
                >
                  <p
                    style={{
                      font: '400 14px/22px var(--font-sans)',
                      color: 'var(--text-1)',
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      // T-04-04-01 — React text node, NO dangerouslySetInnerHTML.
                    }}
                  >
                    {entry.text}
                  </p>
                  <span
                    style={{
                      font: '400 12px var(--font-mono)',
                      color: 'var(--text-3)',
                    }}
                  >
                    {entry.text.length} символов · {formatSubmittedAt(entry.submittedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </article>
  );
}

const inputStyle: React.CSSProperties = {
  height: 32,
  padding: '0 10px',
  background: 'var(--bg-card)',
  border: '1px solid var(--border-1)',
  borderRadius: 'var(--radius)',
  font: '400 13px var(--font-sans)',
  color: 'var(--text-1)',
  outline: 'none',
};

function formatSubmittedAt(iso: string): string {
  try {
    return format(parseISO(iso), 'dd.MM.yyyy, HH:mm', { locale: ru });
  } catch {
    return iso;
  }
}
