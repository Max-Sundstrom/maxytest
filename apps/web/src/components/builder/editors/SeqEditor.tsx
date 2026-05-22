/**
 * <SeqEditor> — Quick task 260522-jwn / SEQ (Single Ease Question).
 *
 * Designer-facing editor for the SEQ block. Shell + autosave identical to
 * <ScaleEditor>: useForm + zodResolver(seqContentSchema), 700ms debounced
 * autosave with version-column conflict + uuidv7 idempotency.
 *
 * Form fields:
 *   - question         (Input, ≤ 280, default «В целом эта задача была…»)
 *   - helper           (Input, optional, ≤ 200)
 *   - required         (ToggleRow switch, default OFF)
 *
 * Endpoint labels («Очень сложной» / «Очень простой») are LOCKED in
 * defaults.ts — preview row below the form shows them so designer sees
 * exactly what the runner will render.
 */

import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { uuidv7 } from 'uuidv7';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useDebouncedValue } from '@/lib/utils';
import { seqContentSchema, type SeqContent } from '@/lib/blocks/schemas';
import {
  SEQ_DEFAULT,
  SEQ_ENDPOINT_MAX_DEFAULT,
  SEQ_ENDPOINT_MIN_DEFAULT,
} from '@/lib/blocks/defaults';
import { useBuilderStore } from '@/lib/stores/builder';
import type { Block } from '@/lib/blocks/types';
import { ToggleRow } from './ChoiceEditor';

export interface SeqEditorProps {
  block: Block;
  disabled?: boolean;
  onSave: (input: { content: SeqContent; version: number; idempotencyKey: string }) => void;
  serverVersion: number;
}

const POINTS = 7;

export function SeqEditor({ block, disabled, onSave, serverVersion }: SeqEditorProps) {
  const updateLocal = useBuilderStore((s) => s.updateBlockContent);

  const form = useForm<SeqContent>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(seqContentSchema) as any,
    defaultValues: block.content as SeqContent,
    mode: 'onChange',
  });

  useEffect(() => {
    const next = block.content as SeqContent;
    if (JSON.stringify(form.getValues()) !== JSON.stringify(next)) {
      form.reset(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id, block.version, block.content]);

  const watched = form.watch();
  const debounced = useDebouncedValue(watched, 700);
  const lastSavedRef = useRef<string>(JSON.stringify(block.content));

  useEffect(() => {
    if (!form.formState.isDirty || !form.formState.isValid || disabled) return;
    const serialised = JSON.stringify(debounced);
    if (serialised === lastSavedRef.current) return;

    onSave({ content: debounced, version: serverVersion, idempotencyKey: uuidv7() });
    lastSavedRef.current = serialised;
    updateLocal(block.id, debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, disabled, serverVersion]);

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4">
        <FormField
          control={form.control as never}
          name="question"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Вопрос</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  disabled={disabled}
                  placeholder={SEQ_DEFAULT.question}
                  maxLength={280}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control as never}
          name="helper"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Подсказка (необязательно)</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={field.value ?? ''}
                  disabled={disabled}
                  placeholder="Короткое пояснение для респондента"
                  maxLength={200}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Preview row — what the runner shows */}
        <div
          aria-hidden="true"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: 8,
            background: 'var(--bg-chip)',
            border: `1px solid var(--border-2)`,
            borderRadius: 'var(--radius)',
          }}
        >
          <div style={{ display: 'flex', gap: 4 }}>
            {Array.from({ length: POINTS }, (_, i) => i + 1).map((n) => (
              <div
                key={n}
                style={{
                  flex: 1,
                  minWidth: 28,
                  height: 32,
                  display: 'grid',
                  placeItems: 'center',
                  background: 'var(--bg-card)',
                  border: `1px solid var(--border-1)`,
                  borderRadius: 'var(--radius)',
                  font: '500 12px var(--font-mono)',
                  color: 'var(--text-2)',
                }}
              >
                {n}
              </div>
            ))}
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              font: '400 11px/16px var(--font-sans)',
              color: 'var(--text-3)',
            }}
          >
            <span>{SEQ_ENDPOINT_MIN_DEFAULT}</span>
            <span>{SEQ_ENDPOINT_MAX_DEFAULT}</span>
          </div>
        </div>

        <ToggleRow
          label="Обязательный ответ"
          hint="Респондент не сможет перейти дальше, пока не выберет оценку."
          checked={!!form.watch('required')}
          disabled={disabled}
          onChange={(v) => form.setValue('required', v, { shouldDirty: true })}
        />
      </form>
    </Form>
  );
}
