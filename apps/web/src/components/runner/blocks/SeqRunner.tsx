/**
 * <SeqRunner> — Quick task 260522-jwn / SEQ (Single Ease Question).
 *
 * Mobile-first runner for the SEQ block. 7-point scale, endpoint labels
 * LOCKED in defaults («Очень сложной ←→ Очень простой») — designer can
 * only edit the question + helper text + required toggle.
 *
 * Shell + interaction model copied verbatim from <ScaleRunner>; only the
 * Content/Answer generic types + the hard-coded points=7 + the locked
 * endpoints differ. See PLAN.md Task 3.
 */

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { ArrowRight, ChevronLeft } from 'lucide-react';
import type { Block } from '@/lib/blocks/types';
import type { SeqAnswer, SeqContent } from '@/lib/blocks/schemas';
import { SEQ_ENDPOINT_MAX_DEFAULT, SEQ_ENDPOINT_MIN_DEFAULT } from '@/lib/blocks/defaults';

export interface SeqRunnerProps {
  block: Block;
  questionIndex: number;
  questionTotal: number;
  isLast: boolean;
  isFirst: boolean;
  onSubmit: (answer: Partial<SeqAnswer>) => void;
  onBack?: () => void;
  initialValue?: Partial<SeqAnswer>;
}

type FormState = { value: number | null };

const POINTS = 7;

export function SeqRunner({
  block,
  questionIndex,
  questionTotal,
  isLast,
  isFirst,
  onSubmit,
  onBack,
  initialValue,
}: SeqRunnerProps) {
  const content = block.content as SeqContent;

  const form = useForm<FormState>({
    defaultValues: { value: initialValue?.value ?? null },
    mode: 'onSubmit',
  });

  useEffect(() => {
    form.reset({ value: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id]);

  const value = form.watch('value');
  const ctaDisabled = content.required && value === null;
  const error = form.formState.errors.value?.message;

  function handle() {
    if (content.required && value === null) {
      form.setError('value', {
        type: 'custom',
        message: 'Выберите оценку от 1 до 7, чтобы продолжить.',
      });
      return;
    }
    if (value === null) {
      onSubmit({});
    } else {
      onSubmit({ value });
    }
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
          gap: 8,
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
          {content.question}
        </h2>
        {content.helper ? (
          <p
            style={{
              font: '400 13.5px/18px var(--font-sans)',
              color: 'var(--text-2)',
              margin: '0 0 8px',
            }}
          >
            {content.helper}
          </p>
        ) : null}

        <div
          role="radiogroup"
          aria-label={content.question}
          style={{ display: 'flex', gap: 6, marginTop: 12 }}
        >
          {Array.from({ length: POINTS }, (_, i) => i + 1).map((n) => {
            const selected = value === n;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => form.setValue('value', n, { shouldDirty: true })}
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: 56,
                  display: 'grid',
                  placeItems: 'center',
                  background: selected ? 'var(--color-accent)' : 'var(--bg-card)',
                  color: selected ? '#fff' : 'var(--text-1)',
                  border: `1px solid ${selected ? 'var(--color-accent)' : 'var(--border-1)'}`,
                  borderRadius: 'var(--radius)',
                  font: '500 16px var(--font-mono)',
                  cursor: 'pointer',
                  transition:
                    'background 120ms cubic-bezier(.2,.7,.3,1), border-color 120ms cubic-bezier(.2,.7,.3,1), color 120ms cubic-bezier(.2,.7,.3,1)',
                }}
              >
                {n}
              </button>
            );
          })}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '8px 4px 0',
            font: '400 12px/16px var(--font-sans)',
            color: 'var(--text-3)',
          }}
        >
          <span>{SEQ_ENDPOINT_MIN_DEFAULT}</span>
          <span>{SEQ_ENDPOINT_MAX_DEFAULT}</span>
        </div>

        {error ? (
          <p
            role="alert"
            style={{
              font: '400 12px/18px var(--font-sans)',
              color: 'var(--color-danger)',
              margin: '8px 0 0',
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
