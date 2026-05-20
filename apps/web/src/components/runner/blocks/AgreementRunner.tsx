/**
 * <AgreementRunner> — Plan 04-02 Task 6 / BLK-07 / D-95.
 *
 * Mobile-first runner for the legal-consent block. Renders the
 * designer's `legalText` in a scrollable region (white-space: pre-wrap),
 * with markdown-light link parsing: `[text](https://…)` → <a>. Below the
 * text, a single checkbox row («Я согласен(-на)»). CTA disabled until
 * the checkbox is ticked.
 *
 * Submit payload: `{ agreed: true }` per agreementAnswerSchema. D-95
 * defaults required=true at the schema level — submitting without
 * tapping the checkbox is impossible (CTA gated).
 *
 * Threat T-04-02-04 (Repudiation): the checkbox MUST be tapped
 * actively — never auto-accepted from any source other than direct
 * user gesture.
 */

import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { ArrowRight, ChevronLeft } from 'lucide-react';
import type { Block } from '@/lib/blocks/types';
import type { AgreementAnswer, AgreementContent } from '@/lib/blocks/schemas';

export interface AgreementRunnerProps {
  block: Block;
  questionIndex: number;
  questionTotal: number;
  isLast: boolean;
  isFirst: boolean;
  onSubmit: (answer: AgreementAnswer) => void;
  onBack?: () => void;
  initialValue?: AgreementAnswer;
}

type FormState = { agreed: boolean };

/**
 * Tiny markdown-light parser — splits the text on `[label](url)` patterns
 * and emits an `<a>` for each match. The pattern is intentionally narrow
 * (no nested brackets, no formatting inside link label) — anything more
 * elaborate should ship as a full markdown renderer in a later phase.
 *
 * `url` is rendered as-is — designers writing the legalText are trusted
 * (this block is designer-authored content, not respondent-authored).
 * For respondent-authored free text in choice «Другое», we never render
 * back; the data flows only to analytics, which display as inert string.
 */
function renderLegalText(text: string): React.ReactNode[] {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  return parts.map((p, i) => {
    const m = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(p);
    if (m) {
      return (
        <a
          key={i}
          href={m[2]}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}
        >
          {m[1]}
        </a>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

export function AgreementRunner({
  block,
  questionIndex,
  questionTotal,
  isLast,
  isFirst,
  onSubmit,
  onBack,
  initialValue,
}: AgreementRunnerProps) {
  const content = block.content as AgreementContent;

  const form = useForm<FormState>({
    defaultValues: { agreed: initialValue?.agreed ?? false },
    mode: 'onSubmit',
  });

  useEffect(() => {
    form.reset({ agreed: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id]);

  const agreed = form.watch('agreed');
  const ctaDisabled = content.required && !agreed;

  const legalNodes = useMemo(() => renderLegalText(content.legalText), [content.legalText]);

  function handle() {
    if (!agreed) {
      // Schema requires literal true → if optional (D-95 says default
      // true but we still honor required=false toggle), we still gate.
      if (content.required) {
        form.setError('agreed', {
          type: 'custom',
          message: 'Нужно согласие, чтобы продолжить.',
        });
        return;
      }
      // required=false + not agreed = treat as skip → caller decides what
      // to persist; we emit no `agreed` key.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onSubmit({} as any);
      return;
    }
    onSubmit({ agreed: true });
  }

  const error = form.formState.errors.agreed?.message;

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
          gap: 12,
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

        {/* Scrollable legal text region — overflow auto inside the
            flex-1 parent so very long agreements remain scrollable on
            mobile without pushing the CTA out of view. */}
        <div
          style={{
            background: 'var(--bg-chip)',
            border: `1px solid var(--border-1)`,
            borderRadius: 'var(--radius)',
            padding: '14px 16px',
            font: '400 14px/22px var(--font-sans)',
            color: 'var(--text-1)',
            whiteSpace: 'pre-wrap',
          }}
        >
          {legalNodes}
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            minHeight: 44,
            padding: '8px 14px',
            background: agreed
              ? 'color-mix(in oklab, var(--color-accent) 10%, var(--bg-card))'
              : 'var(--bg-card)',
            border: `1px solid ${agreed ? 'var(--color-accent)' : 'var(--border-1)'}`,
            borderRadius: 'var(--radius)',
            cursor: 'pointer',
            transition:
              'background 120ms cubic-bezier(.2,.7,.3,1), border-color 120ms cubic-bezier(.2,.7,.3,1)',
          }}
        >
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => form.setValue('agreed', e.target.checked, { shouldDirty: true })}
            style={{
              flexShrink: 0,
              width: 22,
              height: 22,
              accentColor: 'var(--color-accent)',
            }}
            aria-label="Я согласен с условиями"
          />
          <span style={{ font: '400 16px/22px var(--font-sans)', color: 'var(--text-1)' }}>
            Я согласен(-на) с условиями
          </span>
        </label>

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
