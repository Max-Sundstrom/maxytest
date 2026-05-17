/**
 * <OpenQuestionRunner> — design-system v1 rewrite (2026-05-17).
 *
 * Source: design-system handoff `js/maxitest-runner.jsx` <RunnerScreenScale />
 * pattern adapted for free-form text input (handoff doesn't ship an
 * open_question artboard; we lift the same step-tag + h2 + content + split
 * footer shell and swap in a textarea).
 *
 * Layout:
 *   - mono "Вопрос N из M" step-tag
 *   - 22/28 weight-500 h2 — designer's `question`
 *   - 13.5/18 lede-sm — designer's `helper` (optional)
 *   - 16px-base textarea (Pitfall 14a — prevents iOS Safari auto-zoom)
 *   - Sticky split footer: 48px back button (disabled on first question) + 48px moss CTA
 *
 * Validation preserves Phase 1 contract: empty / min-length / max-length
 * messages from the original locked copy, translated to Russian.
 *
 * env(safe-area-inset-bottom) on footer padding keeps CTA above iOS home
 * indicator strip.
 */

import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, ChevronLeft } from 'lucide-react';
import type { Block } from '@/lib/blocks/types';
import type { OpenQuestionContent } from '@/lib/blocks/schemas';

export interface OpenQuestionRunnerProps {
  block: Block;
  /** 0-based question index (welcome-corrected). */
  questionIndex: number;
  /** Total questions in the test (blocks minus welcome and thanks). */
  questionTotal: number;
  /** Last question block before thanks → CTA reads "Завершить" instead of "Далее". */
  isLast: boolean;
  /** First question (no Back button). */
  isFirst: boolean;
  onSubmit: (answer: { text: string }) => void;
  onBack?: () => void;
  /** Pre-fill on resume. */
  initialValue?: string;
}

function buildAnswerSchema(content: OpenQuestionContent) {
  const min = content.min_length ?? 0;
  const max = content.max_length ?? 5000;

  return z.object({
    text: z
      .string()
      .min(1, 'Напиши хотя бы несколько слов, прежде чем продолжить.')
      .superRefine((v, ctx) => {
        if (v.length < min && min > 1) {
          ctx.addIssue({
            code: 'custom',
            message: `Минимум ${min} символов.`,
            path: [],
          });
        }
        if (v.length > max) {
          ctx.addIssue({
            code: 'custom',
            message: `Уложись в ${max} символов. (Лишних: ${v.length - max})`,
            path: [],
          });
        }
      }),
  });
}

type AnswerForm = { text: string };

export function OpenQuestionRunner({
  block,
  questionIndex,
  questionTotal,
  isLast,
  isFirst,
  onSubmit,
  onBack,
  initialValue = '',
}: OpenQuestionRunnerProps) {
  const content = block.content as OpenQuestionContent;
  const schema = useMemo(() => buildAnswerSchema(content), [content]);

  const form = useForm<AnswerForm>({
    resolver: zodResolver(schema),
    defaultValues: { text: initialValue },
    mode: 'onSubmit',
  });

  useEffect(() => {
    form.reset({ text: initialValue });
  }, [block.id]);

  function handle(values: AnswerForm) {
    onSubmit({ text: values.text });
  }

  const error = form.formState.errors.text?.message;

  return (
    <form
      onSubmit={form.handleSubmit(handle)}
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

        <textarea
          autoFocus
          rows={6}
          placeholder="Введите ответ…"
          aria-label="Ваш ответ"
          aria-invalid={!!error}
          {...form.register('text')}
          style={{
            // 16px base font on textarea blocks iOS Safari auto-zoom on focus
            // (Pitfall 14a from Phase 1).
            font: '400 16px/22px var(--font-sans)',
            padding: '12px 14px',
            background: 'var(--bg-input)',
            border: `1px solid ${error ? 'var(--color-danger)' : 'var(--border-1)'}`,
            borderRadius: 'var(--radius)',
            color: 'var(--text-1)',
            minHeight: 132,
            resize: 'vertical',
            outline: 'none',
            transition:
              'border-color 120ms cubic-bezier(.2,.7,.3,1), background 120ms cubic-bezier(.2,.7,.3,1)',
            width: '100%',
            boxSizing: 'border-box',
          }}
          onFocus={(e) => {
            if (!error) {
              e.currentTarget.style.borderColor = 'var(--color-accent)';
              e.currentTarget.style.background = 'var(--bg-input-strong)';
            }
          }}
          onBlur={(e) => {
            if (!error) {
              e.currentTarget.style.borderColor = 'var(--border-1)';
              e.currentTarget.style.background = 'var(--bg-input)';
            }
          }}
        />
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
          style={{
            flex: 1,
            maxWidth: 240,
            height: 48,
            background: 'var(--color-accent)',
            color: '#fff',
            border: 0,
            borderRadius: 'var(--radius)',
            font: '500 15px var(--font-sans)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            transition: 'filter 120ms cubic-bezier(.2,.7,.3,1)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.05)')}
          onMouseLeave={(e) => (e.currentTarget.style.filter = 'none')}
        >
          <span>{isLast ? 'Завершить' : 'Далее'}</span>
          <ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </footer>
    </form>
  );
}
