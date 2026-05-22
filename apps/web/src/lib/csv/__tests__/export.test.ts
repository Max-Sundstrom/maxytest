/**
 * Plan 04-05 Task 2 — golden-fixture tests for `buildCsv`.
 *
 * Three fixtures cover the matrix CONTEXT.md D-110 column-naming contract:
 *
 *   1. `prototype-only.csv`  — 1 prototype block, 2 sessions (success + giveup).
 *   2. `survey-only.csv`     — 5 survey block types, 3 fully-answered sessions.
 *   3. `mixed.csv`           — 1 prototype + 2 survey + 1 open_question; one
 *                              session skips one of the survey blocks (empty
 *                              cell, not `—`/`null`).
 *
 * Why fixture-comparison over snapshot-style tests:
 *   - The CSV format is a CONTRACT (D-110). Downstream consumers parse the
 *     header names and the meta-column order. Snapshot tests would let any
 *     drift slip in silently; reading the golden file forces the test author
 *     to look at the exact byte stream they're claiming is correct.
 *   - CRLF newlines + Excel BOM are part of the contract. A snapshot would
 *     normalize these; raw byte compare via `readFileSync(..., 'utf-8')`
 *     preserves them.
 *
 * Fixture authoring rules (`vitest`-friendly):
 *   - `Papa.unparse` always terminates rows with `\r\n` per the
 *     `newline: '\r\n'` opt we pass. The fixture files have a trailing CRLF
 *     after the last row (papaparse default behavior) → tests don't trim.
 *   - When `options.includeBom: true`, the file begins with U+FEFF (one
 *     code-point, 3 bytes UTF-8). Vitest reads via Node's `fs` which
 *     transparently surfaces the BOM as the first char of the string.
 *   - All test inputs use the same canonical block IDs / session IDs so
 *     fixtures stay diff-readable.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Block } from '@/lib/blocks/types';
import type { ClassifyOutcomeResult } from '@/lib/analytics/classify-outcome';
import type { DesignerSession } from '@/lib/queries/designer-sessions';
import type { SurveyResponseRow } from '@/lib/queries/survey-responses';

import { buildCsv, buildFilename } from '../export';

const FIXTURES = join(__dirname, 'fixtures');

// ─── Shared session helpers ──────────────────────────────────────────────

function sess(
  id: string,
  startedAt: string,
  completedAt: string | null,
  deviceType: string | null,
  status: 'completed' | 'in_progress' = 'completed',
): DesignerSession {
  return {
    id,
    study_id: 'study-1',
    run_token: 'tok-1',
    session_token: `st-${id}`,
    respondent_id: null,
    prototype_version_pin: null,
    user_agent: null,
    started_at: startedAt,
    completed_at: completedAt,
    last_seen_at: completedAt ?? startedAt,
    device_type: deviceType,
    status,
  };
}

function outcome(
  sessionId: string,
  kind: 'success' | 'giveup',
  durationMs: number,
): ClassifyOutcomeResult {
  return {
    sessionId,
    outcome: kind,
    durationMs,
    firstEventTs: '2026-05-01T10:00:00.000Z',
    lastEventTs: new Date(Date.parse('2026-05-01T10:00:00.000Z') + durationMs).toISOString(),
  };
}

// ─── 1. Empty input ──────────────────────────────────────────────────────

describe('buildCsv — empty input', () => {
  it('produces only the header row with no data rows', () => {
    const csv = buildCsv([], [], [], [], {});
    expect(csv).toBe('session_id,started_at,completed_at,duration_seconds,device_type,outcome\r\n');
  });

  it('respects includeBom: true (Excel-friendly prepend)', () => {
    const csv = buildCsv([], [], [], [], { includeBom: true });
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe(
      'session_id,started_at,completed_at,duration_seconds,device_type,outcome\r\n',
    );
  });
});

// ─── 2. Prototype-only fixture ───────────────────────────────────────────

describe('buildCsv — prototype-only fixture', () => {
  it('matches prototype-only.csv golden', () => {
    const blocks: Block[] = [
      {
        id: 'block-welcome',
        study_id: 'study-1',
        position: 0,
        type: 'welcome',
        pinned: true,
        content: { type: 'welcome', title: 'Hi', body: '', cta_label: 'Start' },
        version: 0,
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'block-proto',
        study_id: 'study-1',
        position: 1,
        type: 'prototype',
        pinned: false,
        content: {
          type: 'prototype',
          prototype_version_id: '11111111-1111-1111-1111-111111111111',
          starting_frame_id: 'fr-start',
          task_instruction: 'Найдите кнопку «Купить»',
        },
        version: 1,
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'block-thanks',
        study_id: 'study-1',
        position: 2,
        type: 'thanks',
        pinned: true,
        content: { type: 'thanks', title: 'Спасибо', body: '' },
        version: 0,
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
    ];

    const sessions: DesignerSession[] = [
      sess('sess-A', '2026-05-01T10:00:00.000Z', '2026-05-01T10:01:30.000Z', 'mobile'),
      sess('sess-B', '2026-05-01T11:00:00.000Z', '2026-05-01T11:00:45.000Z', 'desktop'),
    ];

    const outcomes: ClassifyOutcomeResult[] = [
      outcome('sess-A', 'success', 90_000),
      outcome('sess-B', 'giveup', 45_000),
    ];

    const csv = buildCsv(blocks, sessions, [], outcomes, { includeBom: true });
    const golden = readFileSync(join(FIXTURES, 'prototype-only.csv'), 'utf-8');
    expect(csv).toBe(golden);
  });
});

// ─── 3. Survey-only fixture ──────────────────────────────────────────────

describe('buildCsv — survey-only fixture', () => {
  it('matches survey-only.csv golden', () => {
    const blocks: Block[] = [
      {
        id: 'block-welcome',
        study_id: 'study-1',
        position: 0,
        type: 'welcome',
        pinned: true,
        content: { type: 'welcome', title: 'Hi', body: '', cta_label: 'Start' },
        version: 0,
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
      // choice (multi, with «Другое»)
      {
        id: 'block-choice',
        study_id: 'study-1',
        position: 1,
        type: 'choice',
        pinned: false,
        content: {
          type: 'choice',
          question: 'Какие устройства вы используете?',
          mode: 'multi',
          options: [
            { id: 'opt-mob', label: 'Мобильный' },
            { id: 'opt-desk', label: 'Десктоп' },
            { id: 'opt-tab', label: 'Планшет' },
          ],
          hasOtherOption: true,
          shuffleOptions: false,
          required: false,
        },
        version: 1,
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
      // scale 5-point
      {
        id: 'block-scale',
        study_id: 'study-1',
        position: 2,
        type: 'scale',
        pinned: false,
        content: {
          type: 'scale',
          question: 'Насколько просто было?',
          points: 5,
          required: false,
        },
        version: 1,
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
      // nps
      {
        id: 'block-nps',
        study_id: 'study-1',
        position: 3,
        type: 'nps',
        pinned: false,
        content: {
          type: 'nps',
          question: 'Порекомендуете?',
          required: false,
        },
        version: 1,
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
      // agreement
      {
        id: 'block-agree',
        study_id: 'study-1',
        position: 4,
        type: 'agreement',
        pinned: false,
        content: {
          type: 'agreement',
          question: 'Согласие',
          legalText: 'Принимаю условия',
          required: true,
        },
        version: 1,
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
      // context (all 3 sub-questions enabled)
      {
        id: 'block-ctx',
        study_id: 'study-1',
        position: 5,
        type: 'context',
        pinned: false,
        content: {
          type: 'context',
          title: 'О вас',
          age_question: {
            enabled: true,
            options: [
              { id: '18-24', label: '18–24' },
              { id: '25-34', label: '25–34' },
            ],
          },
          experience_question: {
            enabled: true,
            points: 5,
            endpointMinLabel: 'Новичок',
            endpointMaxLabel: 'Эксперт',
          },
          role_question: {
            enabled: true,
            placeholder: '',
          },
          required: false,
        },
        version: 1,
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'block-thanks',
        study_id: 'study-1',
        position: 6,
        type: 'thanks',
        pinned: true,
        content: { type: 'thanks', title: 'Спасибо', body: '' },
        version: 0,
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
    ];

    const sessions: DesignerSession[] = [
      sess('sess-1', '2026-05-01T10:00:00.000Z', '2026-05-01T10:02:00.000Z', 'mobile'),
      sess('sess-2', '2026-05-01T11:00:00.000Z', '2026-05-01T11:03:00.000Z', 'desktop'),
      sess('sess-3', '2026-05-01T12:00:00.000Z', '2026-05-01T12:04:00.000Z', 'tablet'),
    ];

    const surveyResponses: SurveyResponseRow[] = [
      // sess-1: chose mobile+desktop, other='iPad', scale=4, nps=9, agreed,
      // age=25-34, experience=3, role='UX-дизайнер'
      {
        session_id: 'sess-1',
        block_id: 'block-choice',
        answer: { selectedIds: ['opt-mob', 'opt-desk'], otherText: 'iPad' },
        time_ms: 5000,
        submitted_at: '2026-05-01T10:00:30.000Z',
      },
      {
        session_id: 'sess-1',
        block_id: 'block-scale',
        answer: { value: 4 },
        time_ms: 3000,
        submitted_at: '2026-05-01T10:01:00.000Z',
      },
      {
        session_id: 'sess-1',
        block_id: 'block-nps',
        answer: { score: 9 },
        time_ms: 3000,
        submitted_at: '2026-05-01T10:01:15.000Z',
      },
      {
        session_id: 'sess-1',
        block_id: 'block-agree',
        answer: { agreed: true },
        time_ms: 2000,
        submitted_at: '2026-05-01T10:01:30.000Z',
      },
      {
        session_id: 'sess-1',
        block_id: 'block-ctx',
        answer: { age: '25-34', experience: 3, role: 'UX-дизайнер' },
        time_ms: 8000,
        submitted_at: '2026-05-01T10:02:00.000Z',
      },
      // sess-2: chose desktop only, no other, scale=2, nps=6, agreed,
      // age=18-24, experience=1, role='Разработчик'
      {
        session_id: 'sess-2',
        block_id: 'block-choice',
        answer: { selectedIds: ['opt-desk'] },
        time_ms: 4000,
        submitted_at: '2026-05-01T11:00:30.000Z',
      },
      {
        session_id: 'sess-2',
        block_id: 'block-scale',
        answer: { value: 2 },
        time_ms: 3000,
        submitted_at: '2026-05-01T11:01:00.000Z',
      },
      {
        session_id: 'sess-2',
        block_id: 'block-nps',
        answer: { score: 6 },
        time_ms: 3000,
        submitted_at: '2026-05-01T11:01:15.000Z',
      },
      {
        session_id: 'sess-2',
        block_id: 'block-agree',
        answer: { agreed: true },
        time_ms: 2000,
        submitted_at: '2026-05-01T11:01:30.000Z',
      },
      {
        session_id: 'sess-2',
        block_id: 'block-ctx',
        answer: { age: '18-24', experience: 1, role: 'Разработчик' },
        time_ms: 8000,
        submitted_at: '2026-05-01T11:03:00.000Z',
      },
      // sess-3: chose tablet only, scale=5, nps=10, agreed,
      // age=25-34, experience=5, role='Продакт'
      {
        session_id: 'sess-3',
        block_id: 'block-choice',
        answer: { selectedIds: ['opt-tab'] },
        time_ms: 4000,
        submitted_at: '2026-05-01T12:00:30.000Z',
      },
      {
        session_id: 'sess-3',
        block_id: 'block-scale',
        answer: { value: 5 },
        time_ms: 3000,
        submitted_at: '2026-05-01T12:01:00.000Z',
      },
      {
        session_id: 'sess-3',
        block_id: 'block-nps',
        answer: { score: 10 },
        time_ms: 3000,
        submitted_at: '2026-05-01T12:01:15.000Z',
      },
      {
        session_id: 'sess-3',
        block_id: 'block-agree',
        answer: { agreed: true },
        time_ms: 2000,
        submitted_at: '2026-05-01T12:01:30.000Z',
      },
      {
        session_id: 'sess-3',
        block_id: 'block-ctx',
        answer: { age: '25-34', experience: 5, role: 'Продакт' },
        time_ms: 8000,
        submitted_at: '2026-05-01T12:04:00.000Z',
      },
    ];

    const csv = buildCsv(blocks, sessions, surveyResponses, [], { includeBom: true });
    const golden = readFileSync(join(FIXTURES, 'survey-only.csv'), 'utf-8');
    expect(csv).toBe(golden);
  });
});

// ─── 4. Mixed fixture ────────────────────────────────────────────────────

describe('buildCsv — mixed (proto + survey + open_question) fixture', () => {
  it('matches mixed.csv golden, including skipped-block empty cell', () => {
    const blocks: Block[] = [
      {
        id: 'block-welcome',
        study_id: 'study-1',
        position: 0,
        type: 'welcome',
        pinned: true,
        content: { type: 'welcome', title: 'Hi', body: '', cta_label: 'Start' },
        version: 0,
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'block-proto',
        study_id: 'study-1',
        position: 1,
        type: 'prototype',
        pinned: false,
        content: {
          type: 'prototype',
          prototype_version_id: '11111111-1111-1111-1111-111111111111',
          starting_frame_id: 'fr-start',
          task_instruction: 'Купите товар',
        },
        version: 1,
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'block-choice',
        study_id: 'study-1',
        position: 2,
        type: 'choice',
        pinned: false,
        content: {
          type: 'choice',
          question: 'Что больше всего понравилось?',
          mode: 'single',
          options: [
            { id: 'opt-speed', label: 'Скорость' },
            { id: 'opt-ux', label: 'Удобство' },
          ],
          hasOtherOption: false,
          shuffleOptions: false,
          required: false,
        },
        version: 1,
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'block-scale',
        study_id: 'study-1',
        position: 3,
        type: 'scale',
        pinned: false,
        content: {
          type: 'scale',
          question: 'Простота?',
          points: 5,
          required: false,
        },
        version: 1,
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'block-open',
        study_id: 'study-1',
        position: 4,
        type: 'open_question',
        pinned: false,
        content: {
          type: 'open_question',
          question: 'Что-то ещё?',
        },
        version: 1,
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'block-thanks',
        study_id: 'study-1',
        position: 5,
        type: 'thanks',
        pinned: true,
        content: { type: 'thanks', title: 'Спасибо', body: '' },
        version: 0,
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
    ];

    const sessions: DesignerSession[] = [
      sess('sess-A', '2026-05-01T10:00:00.000Z', '2026-05-01T10:03:00.000Z', 'mobile'),
      // sess-B SKIPS the scale block (no response row for block-scale)
      sess('sess-B', '2026-05-01T11:00:00.000Z', '2026-05-01T11:02:00.000Z', 'desktop'),
    ];

    const outcomes: ClassifyOutcomeResult[] = [
      outcome('sess-A', 'success', 180_000),
      outcome('sess-B', 'giveup', 120_000),
    ];

    const surveyResponses: SurveyResponseRow[] = [
      // sess-A: chose Удобство, scale=5, open answer with comma + Cyrillic
      {
        session_id: 'sess-A',
        block_id: 'block-choice',
        answer: { selectedId: 'opt-ux' },
        time_ms: 4000,
        submitted_at: '2026-05-01T10:01:00.000Z',
      },
      {
        session_id: 'sess-A',
        block_id: 'block-scale',
        answer: { value: 5 },
        time_ms: 3000,
        submitted_at: '2026-05-01T10:01:30.000Z',
      },
      {
        session_id: 'sess-A',
        block_id: 'block-open',
        answer: { text: 'Всё было отлично, продолжайте!' },
        time_ms: 10000,
        submitted_at: '2026-05-01T10:02:30.000Z',
      },
      // sess-B: chose Скорость, NO scale (skipped), open answer
      {
        session_id: 'sess-B',
        block_id: 'block-choice',
        answer: { selectedId: 'opt-speed' },
        time_ms: 4000,
        submitted_at: '2026-05-01T11:01:00.000Z',
      },
      {
        session_id: 'sess-B',
        block_id: 'block-open',
        answer: { text: 'Долго грузилось' },
        time_ms: 10000,
        submitted_at: '2026-05-01T11:01:30.000Z',
      },
    ];

    const csv = buildCsv(blocks, sessions, surveyResponses, outcomes, { includeBom: true });
    const golden = readFileSync(join(FIXTURES, 'mixed.csv'), 'utf-8');
    expect(csv).toBe(golden);
  });
});

// ─── 4.5. SEQ + UMUX-Lite + NASA-TLX fixture (Quick task 260522-skm) ─────

describe('buildCsv — seq + umux_lite + nasa_tlx fixture', () => {
  it('matches seq-umux-tlx.csv golden, including UMUX partial row + NASA-TLX skipped block + disabled-dim drop', () => {
    const blocks: Block[] = [
      {
        id: 'block-welcome',
        study_id: 'study-1',
        position: 0,
        type: 'welcome',
        pinned: true,
        content: { type: 'welcome', title: 'Hi', body: '', cta_label: 'Start' },
        version: 0,
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
      // SEQ — single 7-point Likert
      {
        id: 'block-seq',
        study_id: 'study-1',
        position: 1,
        type: 'seq',
        pinned: false,
        content: {
          type: 'seq',
          question: 'В целом эта задача была…',
          required: false,
        },
        version: 1,
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
      // UMUX-Lite — two 7-point Likerts, composite 0..100
      {
        id: 'block-umux',
        study_id: 'study-1',
        position: 2,
        type: 'umux_lite',
        pinned: false,
        content: {
          type: 'umux_lite',
          item1_label: 'Возможности этого продукта соответствуют моим требованиям',
          item2_label: 'Этим продуктом легко пользоваться',
          required: false,
        },
        version: 1,
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
      // NASA-TLX — Physical DISABLED (sit-at-desk usability test). Expect
      // headers to skip `q3_tlx_physical` entirely (mirrors `context.age.enabled`
      // precedent).
      {
        id: 'block-tlx',
        study_id: 'study-1',
        position: 3,
        type: 'nasa_tlx',
        pinned: false,
        content: {
          type: 'nasa_tlx',
          title: 'Оценка нагрузки на задачу',
          dimensions: {
            mental: true,
            physical: false,
            temporal: true,
            performance: true,
            effort: true,
            frustration: true,
          },
          required: false,
        },
        version: 1,
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'block-thanks',
        study_id: 'study-1',
        position: 4,
        type: 'thanks',
        pinned: true,
        content: { type: 'thanks', title: 'Спасибо', body: '' },
        version: 0,
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
    ];

    const sessions: DesignerSession[] = [
      sess('sess-A', '2026-05-01T10:00:00.000Z', '2026-05-01T10:02:00.000Z', 'mobile'),
      sess('sess-B', '2026-05-01T11:00:00.000Z', '2026-05-01T11:02:00.000Z', 'desktop'),
      sess('sess-C', '2026-05-01T12:00:00.000Z', '2026-05-01T12:02:00.000Z', 'tablet'),
    ];

    const surveyResponses: SurveyResponseRow[] = [
      // ─── sess-A: fully answered ─────────────────────────────────────
      // SEQ=6 → «Очень легко»
      // UMUX item1=6, item2=7 → composite ((5)+(6)) * 100/12 = 91.6666… → '91.67' → «Отлично»
      // NASA-TLX 5 enabled dims all=5 → total=25, rtlx=(25/(5*20))*100=25.00 → «Низкая нагрузка»
      {
        session_id: 'sess-A',
        block_id: 'block-seq',
        answer: { value: 6 },
        time_ms: 3000,
        submitted_at: '2026-05-01T10:00:30.000Z',
      },
      {
        session_id: 'sess-A',
        block_id: 'block-umux',
        answer: { item1: 6, item2: 7 },
        time_ms: 5000,
        submitted_at: '2026-05-01T10:01:00.000Z',
      },
      {
        session_id: 'sess-A',
        block_id: 'block-tlx',
        answer: { mental: 5, temporal: 5, performance: 5, effort: 5, frustration: 5 },
        time_ms: 12000,
        submitted_at: '2026-05-01T10:02:00.000Z',
      },
      // ─── sess-B: SEQ + PARTIAL UMUX + full NASA-TLX (Performance=20) ─
      // SEQ=3 → «Скорее сложно»
      // UMUX item1=4, item2=undefined → item1 cell '4', item2/composite/interpretation EMPTY
      //   (Pitfall 2 — never feed undefined into umuxLiteScore).
      // NASA-TLX mental=10, temporal=10, performance=20, effort=10, frustration=10
      //   → total=60, rtlx=60.00 → «Умеренная нагрузка» (boundary `<=60`).
      //   Performance=20 alongside others=10 proves no Performance inversion —
      //   the composite is NOT pulled down by Performance (Pitfall 4 lock).
      {
        session_id: 'sess-B',
        block_id: 'block-seq',
        answer: { value: 3 },
        time_ms: 4000,
        submitted_at: '2026-05-01T11:00:30.000Z',
      },
      {
        session_id: 'sess-B',
        block_id: 'block-umux',
        answer: { item1: 4 },
        time_ms: 5000,
        submitted_at: '2026-05-01T11:01:00.000Z',
      },
      {
        session_id: 'sess-B',
        block_id: 'block-tlx',
        answer: { mental: 10, temporal: 10, performance: 20, effort: 10, frustration: 10 },
        time_ms: 12000,
        submitted_at: '2026-05-01T11:02:00.000Z',
      },
      // ─── sess-C: SEQ + full UMUX, SKIPS NASA-TLX entirely ───────────
      // SEQ=7 → «Очень легко»
      // UMUX item1=7, item2=7 → composite (6+6)*100/12 = 100.00 → «Отлично»
      //   ('100.00' not '100' — Pitfall 5 lock).
      // NASA-TLX: NO response row → all q3_tlx_* cells EMPTY (Pitfall 1 lock).
      {
        session_id: 'sess-C',
        block_id: 'block-seq',
        answer: { value: 7 },
        time_ms: 2000,
        submitted_at: '2026-05-01T12:00:30.000Z',
      },
      {
        session_id: 'sess-C',
        block_id: 'block-umux',
        answer: { item1: 7, item2: 7 },
        time_ms: 5000,
        submitted_at: '2026-05-01T12:01:00.000Z',
      },
    ];

    const csv = buildCsv(blocks, sessions, surveyResponses, [], { includeBom: true });

    // One-shot fixture generation — flip GENERATE_FIXTURE to `true`, run the
    // test once, inspect the file by eye, then flip back to `false`. The
    // committed fixture is the byte-equality reference forever after.
    const GENERATE_FIXTURE = false;
    if (GENERATE_FIXTURE) {
      writeFileSync(join(FIXTURES, 'seq-umux-tlx.csv'), csv, 'utf-8');
    }

    const golden = readFileSync(join(FIXTURES, 'seq-umux-tlx.csv'), 'utf-8');
    expect(csv).toBe(golden);
  });
});

// ─── 5. buildFilename sanity ─────────────────────────────────────────────

describe('buildFilename', () => {
  it('appends "-filtered" when filtersActive=true', () => {
    const fn = buildFilename('Моя гипотеза 01', true);
    expect(fn).toMatch(/-filtered\.csv$/);
  });

  it('omits "-filtered" when filtersActive=false', () => {
    const fn = buildFilename('Моя гипотеза 01', false);
    expect(fn).not.toMatch(/-filtered/);
    expect(fn).toMatch(/\.csv$/);
  });

  it('replaces unsafe filename characters with hyphens', () => {
    const fn = buildFilename('Тест #1 / 2026 ★', false);
    expect(fn).not.toMatch(/[ #/★]/);
    expect(fn).toMatch(/\.csv$/);
  });

  it('caps the safe-title segment at 60 chars (excluding date+ext)', () => {
    const longTitle = 'a'.repeat(120);
    const fn = buildFilename(longTitle, false);
    // Format: {safe ≤60}-{YYYY-MM-DD}.csv → 60 + 1 + 10 + 4 = 75 max
    expect(fn.length).toBeLessThanOrEqual(75);
  });
});
