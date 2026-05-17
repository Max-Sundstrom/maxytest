// apps/plugin/src/components/ProgressView.tsx — Phase 02.2 Plan 07 Task 3.
//
// Screen S3 (UI-SPEC §"Screen S3 — Publishing Progress" + Component
// Inventory #8). Driven by IPC `progress` messages from the sandbox during
// rendering, and by the UI iframe's own state during uploading + publishing.
//
// Layout:
//   - Title: "Публикуем «{flowName}»" (16/600, centered, top margin).
//   - DotsLoader centered below the title.
//   - Stage list (4 rows): parsing → rendering → uploading → publishing.
//     Each row: 16×16 icon + label.
//   - Counter (display 20/600 tabular-nums) ONLY visible during rendering
//     or uploading stage. Centered between active row and pending rows.
//
// Stage states:
//   - done    : ✓ accent stroke
//   - active  : ◐ accent half-filled
//   - pending : ○ muted hollow
//
// A11y:
//   - <section aria-live="polite"> wraps the stage list — screen reader
//     announces each transition without interrupting.
//   - Counter has role="status" so updates are announced as a separate
//     live region without re-reading the whole list.

import { frameWord, imageWord } from '../lib/ui/plural';

import DotsLoader from './DotsLoader';

export type ProgressStage = 'parsing' | 'rendering' | 'uploading' | 'publishing';

interface ProgressViewProps {
  flowName: string;
  stage: ProgressStage;
  done: number;
  total: number;
}

const STAGE_ORDER: ProgressStage[] = ['parsing', 'rendering', 'uploading', 'publishing'];

function stageStatus(
  current: ProgressStage,
  candidate: ProgressStage,
): 'done' | 'active' | 'pending' {
  const ci = STAGE_ORDER.indexOf(current);
  const xi = STAGE_ORDER.indexOf(candidate);
  if (xi < ci) return 'done';
  if (xi === ci) return 'active';
  return 'pending';
}

export default function ProgressView({ flowName, stage, done, total }: ProgressViewProps) {
  return (
    <main
      style={{
        flex: 1,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        background: '#FFFFFF',
      }}
    >
      <h1
        style={{
          font: '600 16px/22px var(--font-sans, "IBM Plex Sans"), system-ui',
          color: 'var(--text-1)',
          margin: 0,
          textAlign: 'center',
          marginTop: 12,
        }}
      >
        Публикуем «{flowName}»
      </h1>

      <DotsLoader />

      <section
        aria-live="polite"
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          paddingLeft: 24,
          paddingRight: 24,
        }}
      >
        <StageRow status={stageStatus(stage, 'parsing')} label="Парсинг" />
        <StageRow
          status={stageStatus(stage, 'rendering')}
          label={
            stage === 'rendering'
              ? `Рендеринг ${done}/${total} ${frameWord(total)}`
              : `Рендеринг ${frameWord(total)}`
          }
        />

        {/* Counter between active rendering / uploading row and pending rows. */}
        {(stage === 'rendering' || stage === 'uploading') && total > 0 && (
          <div
            role="status"
            aria-label={`Прогресс: ${done} из ${total}`}
            style={{
              font: '600 20px var(--font-mono, "IBM Plex Mono"), monospace',
              color: 'var(--text-2)',
              textAlign: 'center',
              fontVariantNumeric: 'tabular-nums',
              padding: '4px 0',
            }}
          >
            {done} / {total} ({Math.round((done / total) * 100)}%)
          </div>
        )}

        <StageRow
          status={stageStatus(stage, 'uploading')}
          label={
            stage === 'uploading'
              ? `Загрузка ${done}/${total} ${imageWord(total)}`
              : `Загрузка ${imageWord(total)}`
          }
        />
        <StageRow status={stageStatus(stage, 'publishing')} label="Сохранение" />
      </section>
    </main>
  );
}

function StageRow({ status, label }: { status: 'done' | 'active' | 'pending'; label: string }) {
  const color =
    status === 'done'
      ? 'var(--color-success)'
      : status === 'active'
        ? 'var(--color-accent)'
        : 'var(--text-3)';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        font: '400 14px var(--font-sans, "IBM Plex Sans"), system-ui',
        color: status === 'pending' ? 'var(--text-2)' : 'var(--text-1)',
        fontWeight: status === 'active' ? 500 : 400,
      }}
    >
      <StageIcon status={status} color={color} />
      <span>{label}</span>
    </div>
  );
}

function StageIcon({ status, color }: { status: 'done' | 'active' | 'pending'; color: string }) {
  if (status === 'done') {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 12l5 5L20 7" />
      </svg>
    );
  }
  if (status === 'active') {
    // Half-filled circle — left half filled with accent, right half empty.
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2" fill="none" />
        <path d="M12 2 A10 10 0 0 0 12 22 Z" fill={color} />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2" fill="none" />
    </svg>
  );
}
