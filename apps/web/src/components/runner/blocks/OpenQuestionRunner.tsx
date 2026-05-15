/**
 * <OpenQuestionRunner> — Plan 01-05 Task 4 / UI-SPEC.md §"Runner block screens"
 *                       + §"Copy Lock" Runner + Pitfall 14 (iOS 16px floor) +
 *                       D-24 tap-targets.
 *
 * Single-textarea respondent input for an `open_question` block. Renders the
 * designer's question text, a textarea with the locked placeholder
 * "Type your answer here…", optional min/max-length validation, and a sticky
 * bottom CTA labeled "Next" (intermediate) or "Finish" (last question before
 * thanks).
 *
 * Key contracts:
 *   - text-base (16px) on the textarea prevents iOS Safari auto-zoom on
 *     focus (Pitfall 14a).
 *   - Sticky CTA footer honours `env(safe-area-inset-bottom)` so the button
 *     stays above the iOS home-indicator strip (Pitfall 14e).
 *   - Validation error copy is LOCKED to UI-SPEC §"Copy Lock" Runner.
 *   - On submit we call `onSubmit({ text })`; the parent (RunnerShell)
 *     handles persistence + advance.
 */

import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import type { Block } from '@/lib/blocks/types';
import type { OpenQuestionContent } from '@/lib/blocks/schemas';

export interface OpenQuestionRunnerProps {
  block: Block;
  /** Last question block before thanks → CTA reads "Finish" instead of "Next". */
  isLast: boolean;
  onSubmit: (answer: { text: string }) => void;
  /** Pre-fill on resume. */
  initialValue?: string;
}

/**
 * Build a per-block runtime Zod schema honoring the designer's min/max-length
 * settings. We rebuild on every render of a NEW block because the
 * thresholds are part of the block content and change per block.
 *
 * Copy lock (UI-SPEC §Copy Lock Runner):
 *   - "Add a few words before continuing." (empty required)
 *   - "Add at least {N} characters." (below min when min > 1)
 *   - "Keep it under {N} characters. ({M} too many)" (above max)
 *
 * Zod 4 note: .refine()'s 2nd argument is a static config object (not a
 * function). We use .superRefine() to compute the per-input message for the
 * "too many" case where M = inputLength - max.
 */
function buildAnswerSchema(content: OpenQuestionContent) {
  const min = content.min_length ?? 0;
  const max = content.max_length ?? 5000;

  return z.object({
    text: z
      .string()
      .min(1, 'Add a few words before continuing.')
      .superRefine((v, ctx) => {
        if (v.length < min && min > 1) {
          ctx.addIssue({
            code: 'custom',
            message: `Add at least ${min} characters.`,
            path: [],
          });
        }
        if (v.length > max) {
          ctx.addIssue({
            code: 'custom',
            message: `Keep it under ${max} characters. (${v.length - max} too many)`,
            path: [],
          });
        }
      }),
  });
}

type AnswerForm = { text: string };

export function OpenQuestionRunner({
  block,
  isLast,
  onSubmit,
  initialValue = '',
}: OpenQuestionRunnerProps) {
  const content = block.content as OpenQuestionContent;
  const schema = useMemo(() => buildAnswerSchema(content), [content]);

  const form = useForm<AnswerForm>({
    resolver: zodResolver(schema),
    defaultValues: { text: initialValue },
    mode: 'onSubmit',
  });

  // Reset when the block id changes (navigating between question blocks
  // re-uses the same component instance under React reconciliation).
  useEffect(() => {
    form.reset({ text: initialValue });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id]);

  function handle(values: AnswerForm) {
    onSubmit({ text: values.text });
  }

  return (
    <Form {...form}>
      <form
        className="flex flex-1 flex-col"
        onSubmit={form.handleSubmit(handle)}
      >
        <div className="flex-1">
          <h1 className="mb-4 text-h1 font-semibold text-foreground">
            {content.question}
          </h1>
          {content.helper && (
            <p className="mb-4 text-body text-muted-foreground">
              {content.helper}
            </p>
          )}
          <FormField
            control={form.control as never}
            name="text"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Textarea
                    {...field}
                    autoFocus
                    rows={6}
                    placeholder="Type your answer here…"
                    className="min-h-32 text-base"
                    aria-label="Your answer"
                  />
                </FormControl>
                <FormMessage className="text-caption text-destructive" />
              </FormItem>
            )}
          />
        </div>
        <div
          className="sticky bottom-0 mt-6 -mx-4 sm:-mx-6 border-t border-border bg-background/95 px-4 py-4 backdrop-blur-sm sm:px-6"
          style={{
            paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))',
          }}
        >
          <Button
            type="submit"
            variant="default"
            size="lg"
            className="min-h-touch w-full"
          >
            {isLast ? 'Finish' : 'Next'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
