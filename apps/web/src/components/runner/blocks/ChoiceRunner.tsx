/**
 * <ChoiceRunner> — Plan 04-02 Task 5 / BLK-04.
 *
 * Mobile-first runner for the choice block (single / multi). Shell copied
 * 1:1 from OpenQuestionRunner (step-tag, h2, helper, sticky split footer,
 * env(safe-area-inset-bottom)). Answer widget swapped to a labelled list
 * of options with 44px touch targets.
 *
 * Key behaviours (D-94):
 *   - Single mode: tap = select, deselect others.
 *   - Multi mode: tap toggles; counter «N выбрано (максимум M)».
 *   - hasOtherOption=true: virtual «Другое» row at end with inline Input
 *     that appears on selection. «Другое» is NOT shuffled — always last.
 *   - shuffleOptions=true: order = deterministicShuffle(options, sessionId).
 *     Stable across re-mounts (Pitfall 9).
 *   - required=true: CTA disabled until selection valid (single = ≥1,
 *     multi = ≥ min_selections). required=false: CTA always enabled,
 *     respondent may skip with no selection.
 *   - 16px label font (Pitfall 14a — iOS Safari auto-zoom prevention).
 *
 * Answer shape matches `choiceAnswerSchema` from @/lib/blocks/schemas
 * (Pitfall 5: writer + reader import the same schema).
 */

import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { ArrowRight, ChevronLeft } from 'lucide-react';
import type { Block } from '@/lib/blocks/types';
import type { ChoiceAnswer, ChoiceContent } from '@/lib/blocks/schemas';
import { deterministicShuffle } from '@/lib/runner/shuffle';

const OTHER_ID = '__other__';

export interface ChoiceRunnerProps {
  block: Block;
  questionIndex: number;
  questionTotal: number;
  isLast: boolean;
  isFirst: boolean;
  /** Live session id (null in preview mode — shuffle falls back to block.id). */
  sessionId: string | null;
  onSubmit: (answer: ChoiceAnswer) => void;
  onBack?: () => void;
  initialValue?: ChoiceAnswer;
}

type FormState = {
  selectedId: string | null;
  selectedIds: string[];
  otherText: string;
};

export function ChoiceRunner({
  block,
  questionIndex,
  questionTotal,
  isLast,
  isFirst,
  sessionId,
  onSubmit,
  onBack,
  initialValue,
}: ChoiceRunnerProps) {
  const content = block.content as ChoiceContent;
  const isMulti = content.mode === 'multi';
  const seed = sessionId ?? `preview:${block.id}`;

  // Build the *displayed* option list (regular options possibly shuffled +
  // virtual «Другое» at the end if hasOtherOption is set). useMemo keyed by
  // content + seed so the order is stable across re-renders.
  const options = useMemo(() => {
    const base = content.shuffleOptions
      ? deterministicShuffle(content.options, seed)
      : content.options;
    if (content.hasOtherOption) {
      return [...base, { id: OTHER_ID, label: 'Другое' }];
    }
    return base;
  }, [content.options, content.shuffleOptions, content.hasOtherOption, seed]);

  const form = useForm<FormState>({
    defaultValues: {
      selectedId: initialValue?.selectedId ?? null,
      selectedIds: initialValue?.selectedIds ?? [],
      otherText: initialValue?.otherText ?? '',
    },
    mode: 'onSubmit',
  });

  // Reset when the block instance changes (sidebar switch, runner step
  // advance with the same component remounted).
  useEffect(() => {
    form.reset({
      selectedId: null,
      selectedIds: [],
      otherText: '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id]);

  const selectedId = form.watch('selectedId');
  const selectedIds = form.watch('selectedIds');
  const otherText = form.watch('otherText');

  function toggleSingle(id: string) {
    form.setValue('selectedId', selectedId === id ? null : id, { shouldDirty: true });
  }
  function toggleMulti(id: string) {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    form.setValue('selectedIds', next, { shouldDirty: true });
  }

  // Validation
  const min = content.min_selections ?? 0;
  const maxRaw = content.max_selections;
  const maxEff = maxRaw ?? options.length;
  const otherSelected = isMulti ? selectedIds.includes(OTHER_ID) : selectedId === OTHER_ID;
  const otherTextOk = !otherSelected || otherText.trim().length > 0;
  const selectionOk = isMulti
    ? selectedIds.length >= Math.max(content.required ? 1 : 0, min) && selectedIds.length <= maxEff
    : content.required
      ? !!selectedId
      : true;
  const ctaDisabled = (content.required && !selectionOk) || (otherSelected && !otherTextOk);

  // Compose error message (only surfaced when respondent taps CTA in
  // an invalid state — we keep onSubmit-mode validation per shell pattern).
  function buildError(): string | null {
    if (otherSelected && !otherTextOk) return 'Введите свой вариант в поле «Другое».';
    if (isMulti) {
      if (content.required && selectedIds.length === 0) return 'Выберите хотя бы один вариант.';
      if (selectedIds.length < min) return `Выберите минимум ${min}.`;
      if (maxRaw !== undefined && selectedIds.length > maxRaw)
        return `Можно выбрать не больше ${maxRaw}.`;
    } else if (content.required && !selectedId) {
      return 'Выберите вариант, чтобы продолжить.';
    }
    return null;
  }

  function handle() {
    const err = buildError();
    if (err) {
      // React-hook-form has no schema attached; set a manual error so the
      // shell's aria-live region surfaces it.
      form.setError('selectedId', { type: 'custom', message: err });
      return;
    }
    if (isMulti) {
      const visible = selectedIds.filter((id) => id !== OTHER_ID);
      const payload: ChoiceAnswer = {
        selectedIds: otherSelected ? [...visible, OTHER_ID] : visible,
      };
      if (otherSelected) payload.otherText = otherText.trim();
      onSubmit(payload);
    } else {
      const payload: ChoiceAnswer = { selectedId: selectedId ?? undefined };
      if (selectedId === OTHER_ID) payload.otherText = otherText.trim();
      onSubmit(payload);
    }
  }

  const error = form.formState.errors.selectedId?.message;
  const showCounter = isMulti;
  const counterText = showCounter
    ? maxRaw !== undefined
      ? `${selectedIds.length} выбрано · максимум ${maxRaw}`
      : `${selectedIds.length} выбрано`
    : null;

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

        <ul
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: 0,
            margin: '6px 0 0',
          }}
        >
          {options.map((opt) => {
            const selected = isMulti ? selectedIds.includes(opt.id) : selectedId === opt.id;
            return (
              <li key={opt.id} style={{ listStyle: 'none' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    minHeight: 44,
                    padding: '10px 14px',
                    background: selected
                      ? 'color-mix(in oklab, var(--color-accent) 10%, var(--bg-card))'
                      : 'var(--bg-card)',
                    border: `1px solid ${selected ? 'var(--color-accent)' : 'var(--border-1)'}`,
                    borderRadius: 'var(--radius)',
                    cursor: 'pointer',
                    transition:
                      'background 120ms cubic-bezier(.2,.7,.3,1), border-color 120ms cubic-bezier(.2,.7,.3,1)',
                  }}
                >
                  <input
                    type={isMulti ? 'checkbox' : 'radio'}
                    checked={selected}
                    onChange={() => (isMulti ? toggleMulti(opt.id) : toggleSingle(opt.id))}
                    style={{
                      flexShrink: 0,
                      width: 20,
                      height: 20,
                      accentColor: 'var(--color-accent)',
                    }}
                    aria-label={opt.label}
                  />
                  <span
                    style={{
                      flex: 1,
                      font: '400 16px/22px var(--font-sans)',
                      color: 'var(--text-1)',
                    }}
                  >
                    {opt.label}
                  </span>
                </label>
                {opt.id === OTHER_ID && otherSelected ? (
                  <input
                    type="text"
                    aria-label="Введите свой вариант"
                    placeholder="Свой вариант"
                    value={otherText}
                    onChange={(e) =>
                      form.setValue('otherText', e.target.value, { shouldDirty: true })
                    }
                    style={{
                      marginTop: 8,
                      width: '100%',
                      font: '400 16px/22px var(--font-sans)',
                      padding: '10px 14px',
                      background: 'var(--bg-input)',
                      border: `1px solid var(--border-1)`,
                      borderRadius: 'var(--radius)',
                      color: 'var(--text-1)',
                      boxSizing: 'border-box',
                    }}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>

        {showCounter ? (
          <p
            aria-live="polite"
            style={{
              font: '400 12px/16px var(--font-mono)',
              color: 'var(--text-3)',
              margin: '4px 4px 0',
            }}
          >
            {counterText}
          </p>
        ) : null}

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
