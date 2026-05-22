/**
 * <NasaTlxRunner> — Quick task 260522-jwn / NASA-TLX (Raw).
 *
 * Mobile-first single-page runner: up to 6 stacked sections, one per enabled
 * dimension. Each section = label + helper + 21-cell row + endpoint captions.
 * Cells store integer cell-index 0..20 (NOT the 0..100 RTLX scale — the
 * conversion happens at composite-time in nasa-tlx-score.ts).
 *
 * Pitfall 2 (load-bearing): Performance dimension uses «Идеально ←→ Полная
 * неудача» — low cell = good performance, high = poor performance. The
 * composite formula treats this identically to other dimensions (NO
 * inversion). UI labels signal the meaning to the respondent.
 *
 * Disabled-by-designer dimensions are HIDDEN (not greyed). Skipped dimension
 * answers are omitted from the payload (not zeroed).
 */

import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { ArrowRight, ChevronLeft } from 'lucide-react';
import type { Block } from '@/lib/blocks/types';
import type { NasaTlxAnswer, NasaTlxContent } from '@/lib/blocks/schemas';
import { NASA_TLX_DIMENSION_META } from '@/lib/blocks/defaults';

export interface NasaTlxRunnerProps {
  block: Block;
  questionIndex: number;
  questionTotal: number;
  isLast: boolean;
  isFirst: boolean;
  onSubmit: (answer: Partial<NasaTlxAnswer>) => void;
  onBack?: () => void;
  initialValue?: Partial<NasaTlxAnswer>;
}

type Dim = 'mental' | 'physical' | 'temporal' | 'performance' | 'effort' | 'frustration';
const ALL_DIMS: Dim[] = ['mental', 'physical', 'temporal', 'performance', 'effort', 'frustration'];
const CELLS = 21; // 0..20 inclusive

type FormState = Record<Dim, number | null>;

export function NasaTlxRunner({
  block,
  questionIndex,
  questionTotal,
  isLast,
  isFirst,
  onSubmit,
  onBack,
  initialValue,
}: NasaTlxRunnerProps) {
  const content = block.content as NasaTlxContent;

  const enabledDims = useMemo<Dim[]>(
    () => ALL_DIMS.filter((d) => content.dimensions[d] === true),
    [content.dimensions],
  );

  const form = useForm<FormState>({
    defaultValues: {
      mental: initialValue?.mental ?? null,
      physical: initialValue?.physical ?? null,
      temporal: initialValue?.temporal ?? null,
      performance: initialValue?.performance ?? null,
      effort: initialValue?.effort ?? null,
      frustration: initialValue?.frustration ?? null,
    },
    mode: 'onSubmit',
  });

  useEffect(() => {
    form.reset({
      mental: null,
      physical: null,
      temporal: null,
      performance: null,
      effort: null,
      frustration: null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id]);

  const watched = form.watch();
  const missingRequired = content.required && enabledDims.some((d) => watched[d] === null);
  const ctaDisabled = missingRequired;
  const error = form.formState.errors.mental?.message;

  function handle() {
    if (missingRequired) {
      form.setError('mental', {
        type: 'custom',
        message: 'Оцените каждое измерение, чтобы продолжить.',
      });
      return;
    }
    const payload: Partial<NasaTlxAnswer> = {};
    for (const d of enabledDims) {
      const v = watched[d];
      if (typeof v === 'number') payload[d] = v;
    }
    onSubmit(payload);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handle();
      }}
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
    >
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          minHeight: 0,
          padding: '16px 24px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <span
          style={{
            font: '500 11px var(--font-mono)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-3)',
            marginTop: 4,
          }}
        >
          Вопрос {questionIndex + 1} из {questionTotal}
        </span>
        <h2
          style={{
            font: '500 22px/28px var(--font-sans)',
            color: 'var(--text-1)',
            letterSpacing: '-0.005em',
            margin: '4px 0 4px',
          }}
        >
          {content.title}
        </h2>

        {enabledDims.map((dim) => (
          <DimensionSection
            key={dim}
            dim={dim}
            value={watched[dim]}
            onSelect={(n) => form.setValue(dim, n, { shouldDirty: true })}
          />
        ))}

        {error ? (
          <p
            role="alert"
            style={{
              font: '400 12px/18px var(--font-sans)',
              color: 'var(--color-danger)',
              margin: 0,
            }}
          >
            {error}
          </p>
        ) : null}
      </div>

      <footer
        style={{
          display: 'flex',
          padding: '12px 16px 16px',
          paddingBottom: `calc(16px + env(safe-area-inset-bottom, 0px))`,
          gap: 8,
          justifyContent: 'space-between',
          background: 'var(--bg-page)',
          borderTop: '1px solid var(--border-2)',
        }}
      >
        {!isFirst && onBack ? (
          <button
            type="button"
            onClick={onBack}
            style={{
              height: 48,
              padding: '0 20px',
              background: 'transparent',
              border: 0,
              color: 'var(--text-2)',
              font: '500 14px var(--font-sans)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <ChevronLeft size={14} strokeWidth={1.5} aria-hidden="true" />
            <span>Назад</span>
          </button>
        ) : (
          <span aria-hidden="true" />
        )}
        <button
          type="submit"
          disabled={ctaDisabled}
          style={{
            flex: 1,
            maxWidth: 240,
            height: 48,
            background: ctaDisabled
              ? 'color-mix(in oklab, var(--color-accent) 50%, transparent)'
              : 'var(--color-accent)',
            color: '#fff',
            border: 0,
            borderRadius: 'var(--radius)',
            font: '500 15px var(--font-sans)',
            cursor: ctaDisabled ? 'not-allowed' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            transition: 'filter 120ms cubic-bezier(.2,.7,.3,1)',
          }}
        >
          <span>{isLast ? 'Завершить' : 'Далее'}</span>
          <ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </footer>
    </form>
  );
}

interface DimensionSectionProps {
  dim: Dim;
  value: number | null;
  onSelect: (n: number) => void;
}

function DimensionSection({ dim, value, onSelect }: DimensionSectionProps) {
  const meta = NASA_TLX_DIMENSION_META[dim];
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h3
        style={{
          font: '500 16px/22px var(--font-sans)',
          color: 'var(--text-1)',
          margin: 0,
        }}
      >
        {meta.label}
      </h3>
      <p
        style={{
          font: '400 13px/18px var(--font-sans)',
          color: 'var(--text-2)',
          margin: 0,
        }}
      >
        {meta.helper}
      </p>
      <div
        role="radiogroup"
        aria-label={meta.label}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 3,
          marginTop: 4,
        }}
      >
        {Array.from({ length: CELLS }, (_, i) => i).map((idx) => {
          const selected = value === idx;
          return (
            <button
              key={idx}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${meta.label}: ${idx} из ${CELLS - 1}`}
              onClick={() => onSelect(idx)}
              style={{
                flex: '1 1 22px',
                minWidth: 22,
                height: 44,
                background: selected ? 'var(--color-accent)' : 'var(--bg-card)',
                border: `1px solid ${selected ? 'var(--color-accent)' : 'var(--border-1)'}`,
                borderRadius: 'var(--radius)',
                cursor: 'pointer',
                padding: 0,
                transition:
                  'background 120ms cubic-bezier(.2,.7,.3,1), border-color 120ms cubic-bezier(.2,.7,.3,1)',
              }}
            />
          );
        })}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '4px 4px 0',
          font: '400 12px/16px var(--font-sans)',
          color: 'var(--text-3)',
        }}
      >
        <span>{meta.minLabel}</span>
        <span>{meta.maxLabel}</span>
      </div>
    </section>
  );
}
