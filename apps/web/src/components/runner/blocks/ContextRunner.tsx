/**
 * <ContextRunner> — Plan 04-02 Task 6 / BLK-08 / L-2 closure (path b).
 *
 * Mobile-first runner for the composite context block. Sequentially
 * renders ONLY the enabled sub-questions (age / experience / role) in
 * a single scrollable view (no paginated UI — each sub-question is its
 * own labelled section).
 *
 * **Required-semantics (L-2 closure, path b — minimum friction):**
 *
 *   - `content.required === false` (D-93 default) → CTA always enabled.
 *     Respondent may skip the entire block; `onSubmit({})` is fine and
 *     each field on `contextAnswerSchema` is optional. Empty answers do
 *     not appear in the payload.
 *
 *   - `content.required === true` → CTA disabled until AT LEAST ONE
 *     enabled sub-question has a non-empty answer. Designer's promise:
 *     «получу хотя бы что-то про respondent», never «получу все три».
 *     If a stricter contract is wanted, Phase 8 may add per-sub-question
 *     required toggles.
 *
 * Widget pattern reuse:
 *   - age:        labelled radio-style option list (same as ChoiceRunner
 *                 single mode, no shuffle — demographic ordering matters)
 *   - experience: 5-cell row, same visual as ScaleRunner (56px tall)
 *   - role:       16px-base text input (Pitfall 14a)
 */

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { ArrowRight, ChevronLeft } from 'lucide-react';
import type { Block } from '@/lib/blocks/types';
import type { ContextAnswer, ContextContent } from '@/lib/blocks/schemas';

export interface ContextRunnerProps {
  block: Block;
  questionIndex: number;
  questionTotal: number;
  isLast: boolean;
  isFirst: boolean;
  onSubmit: (answer: ContextAnswer) => void;
  onBack?: () => void;
  initialValue?: ContextAnswer;
}

type FormState = {
  age: string;
  experience: number | null;
  role: string;
};

export function ContextRunner({
  block,
  questionIndex,
  questionTotal,
  isLast,
  isFirst,
  onSubmit,
  onBack,
  initialValue,
}: ContextRunnerProps) {
  const content = block.content as ContextContent;
  const ageEnabled = content.age_question?.enabled === true;
  const expEnabled = content.experience_question?.enabled === true;
  const roleEnabled = content.role_question?.enabled === true;
  const expPoints = content.experience_question?.points ?? 5;

  const form = useForm<FormState>({
    defaultValues: {
      age: initialValue?.age ?? '',
      experience: initialValue?.experience ?? null,
      role: initialValue?.role ?? '',
    },
    mode: 'onSubmit',
  });

  useEffect(() => {
    form.reset({ age: '', experience: null, role: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id]);

  const watched = form.watch();
  const hasAnswer = {
    age: typeof watched.age === 'string' && watched.age.length > 0,
    experience: typeof watched.experience === 'number',
    role: typeof watched.role === 'string' && watched.role.trim().length > 0,
  };
  // L-2 path b: at-least-one across the UNION of enabled sub-questions.
  const atLeastOneEnabledFilled =
    (ageEnabled && hasAnswer.age) ||
    (expEnabled && hasAnswer.experience) ||
    (roleEnabled && hasAnswer.role);

  const ctaDisabled = content.required === true && !atLeastOneEnabledFilled;

  function handle() {
    if (ctaDisabled) {
      form.setError('role', {
        type: 'custom',
        message: 'Ответьте хотя бы на один вопрос ниже, чтобы продолжить.',
      });
      return;
    }
    const payload: ContextAnswer = {};
    if (ageEnabled && hasAnswer.age) payload.age = watched.age;
    if (expEnabled && hasAnswer.experience) payload.experience = watched.experience!;
    if (roleEnabled && hasAnswer.role) payload.role = watched.role.trim();
    onSubmit(payload);
  }

  const errorMsg = form.formState.errors.role?.message;

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

        {ageEnabled && content.age_question ? (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h3
              style={{
                font: '500 14px/20px var(--font-sans)',
                color: 'var(--text-1)',
                margin: 0,
              }}
            >
              Возраст
            </h3>
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 0, margin: 0 }}>
              {content.age_question.options.map((opt) => {
                const selected = watched.age === opt.id;
                return (
                  <li key={opt.id} style={{ listStyle: 'none' }}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        minHeight: 44,
                        padding: '8px 14px',
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
                        type="radio"
                        name="age"
                        checked={selected}
                        onChange={() =>
                          form.setValue('age', selected ? '' : opt.id, { shouldDirty: true })
                        }
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
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {expEnabled && content.experience_question ? (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h3
              style={{
                font: '500 14px/20px var(--font-sans)',
                color: 'var(--text-1)',
                margin: 0,
              }}
            >
              Опыт
            </h3>
            <div
              role="radiogroup"
              aria-label="Опыт"
              style={{ display: 'flex', gap: 6, marginTop: 4 }}
            >
              {Array.from({ length: expPoints }, (_, i) => i + 1).map((n) => {
                const selected = watched.experience === n;
                return (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => form.setValue('experience', n, { shouldDirty: true })}
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
              <span>{content.experience_question.endpointMinLabel}</span>
              <span>{content.experience_question.endpointMaxLabel}</span>
            </div>
          </section>
        ) : null}

        {roleEnabled && content.role_question ? (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h3
              style={{
                font: '500 14px/20px var(--font-sans)',
                color: 'var(--text-1)',
                margin: 0,
              }}
            >
              Должность / роль
            </h3>
            <input
              type="text"
              aria-label="Ваша должность или роль"
              placeholder={content.role_question.placeholder}
              {...form.register('role', { maxLength: 120 })}
              style={{
                font: '400 16px/22px var(--font-sans)',
                padding: '12px 14px',
                background: 'var(--bg-input)',
                border: `1px solid var(--border-1)`,
                borderRadius: 'var(--radius)',
                color: 'var(--text-1)',
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box',
              }}
            />
          </section>
        ) : null}

        {errorMsg ? (
          <p
            role="alert"
            style={{
              font: '400 12px/18px var(--font-sans)',
              color: 'var(--color-danger)',
              margin: 0,
            }}
          >
            {errorMsg}
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
          aria-disabled={ctaDisabled}
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
