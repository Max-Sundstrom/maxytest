/**
 * <UmuxLiteRunner> — Quick task 260522-jwn / UMUX-Lite.
 *
 * Mobile-first runner: two stacked 7-cell rows (one per item), shared
 * endpoint labels («Совершенно не согласен(-на) ←→ Полностью согласен(-на)»)
 * locked in defaults.
 *
 * Skip-submit pattern: if respondent doesn't rate an item, that key is
 * omitted from payload. Composite-score helper (umux-lite-score.ts) skips
 * rows where item1 OR item2 is missing — see Pitfall 1.
 */

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { ArrowRight, ChevronLeft } from 'lucide-react';
import type { Block } from '@/lib/blocks/types';
import type { UmuxLiteAnswer, UmuxLiteContent } from '@/lib/blocks/schemas';
import { UMUX_LITE_ENDPOINT_MAX, UMUX_LITE_ENDPOINT_MIN } from '@/lib/blocks/defaults';

export interface UmuxLiteRunnerProps {
  block: Block;
  questionIndex: number;
  questionTotal: number;
  isLast: boolean;
  isFirst: boolean;
  onSubmit: (answer: Partial<UmuxLiteAnswer>) => void;
  onBack?: () => void;
  initialValue?: Partial<UmuxLiteAnswer>;
}

type FormState = { item1: number | null; item2: number | null };

const POINTS = 7;

export function UmuxLiteRunner({
  block,
  questionIndex,
  questionTotal,
  isLast,
  isFirst,
  onSubmit,
  onBack,
  initialValue,
}: UmuxLiteRunnerProps) {
  const content = block.content as UmuxLiteContent;

  const form = useForm<FormState>({
    defaultValues: {
      item1: initialValue?.item1 ?? null,
      item2: initialValue?.item2 ?? null,
    },
    mode: 'onSubmit',
  });

  useEffect(() => {
    form.reset({ item1: null, item2: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id]);

  const watched = form.watch();
  const ctaDisabled = content.required && (watched.item1 === null || watched.item2 === null);
  const error = form.formState.errors.item1?.message;

  function handle() {
    if (ctaDisabled) {
      form.setError('item1', {
        type: 'custom',
        message: 'Оцените оба пункта, чтобы продолжить.',
      });
      return;
    }
    const payload: Partial<UmuxLiteAnswer> = {};
    if (watched.item1 !== null) payload.item1 = watched.item1;
    if (watched.item2 !== null) payload.item2 = watched.item2;
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
          Оценка удобства
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

        {/* Item 1 */}
        <ItemRow
          label={content.item1_label}
          fieldName="item1"
          value={watched.item1}
          onSelect={(n) => form.setValue('item1', n, { shouldDirty: true })}
        />

        <div style={{ height: 8 }} />

        {/* Item 2 */}
        <ItemRow
          label={content.item2_label}
          fieldName="item2"
          value={watched.item2}
          onSelect={(n) => form.setValue('item2', n, { shouldDirty: true })}
        />

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

interface ItemRowProps {
  label: string;
  fieldName: 'item1' | 'item2';
  value: number | null;
  onSelect: (n: number) => void;
}

function ItemRow({ label, fieldName, value, onSelect }: ItemRowProps) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h3
        style={{
          font: '500 16px/22px var(--font-sans)',
          color: 'var(--text-1)',
          margin: 0,
        }}
      >
        {label}
      </h3>
      <div
        role="radiogroup"
        aria-label={label}
        data-field={fieldName}
        style={{ display: 'flex', gap: 6 }}
      >
        {Array.from({ length: POINTS }, (_, i) => i + 1).map((n) => {
          const selected = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(n)}
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
          padding: '4px 4px 0',
          font: '400 12px/16px var(--font-sans)',
          color: 'var(--text-3)',
        }}
      >
        <span>{UMUX_LITE_ENDPOINT_MIN}</span>
        <span>{UMUX_LITE_ENDPOINT_MAX}</span>
      </div>
    </section>
  );
}
