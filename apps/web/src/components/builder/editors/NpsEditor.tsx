/**
 * <NpsEditor> — Plan 04-02 Task 3 / BLK-06.
 *
 * NPS block editor — opinionated minimum (0–10 row, fixed labels). Only
 * the question / helper / required toggle are editable. Shell identical
 * to ChoiceEditor + ScaleEditor (useForm + zodResolver + 700ms autosave).
 *
 * Form fields:
 *   - question  (Input, ≤ 280, default Russian NPS prompt from NPS_DEFAULT)
 *   - helper    (Input, optional, ≤ 200)
 *   - required  (ToggleRow switch, default OFF per D-93)
 *
 * Below the editable inputs — a static preview row 0..10 + the fixed
 * Russian endpoint labels «Точно НЕ порекомендую → Точно порекомендую»
 * so the designer sees the runner's exact shape.
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
import { npsContentSchema, type NpsContent } from '@/lib/blocks/schemas';
import { useBuilderStore } from '@/lib/stores/builder';
import type { Block } from '@/lib/blocks/types';
import { ToggleRow } from './ChoiceEditor';

export interface NpsEditorProps {
  block: Block;
  disabled?: boolean;
  onSave: (input: { content: NpsContent; version: number; idempotencyKey: string }) => void;
  serverVersion: number;
}

export function NpsEditor({ block, disabled, onSave, serverVersion }: NpsEditorProps) {
  const updateLocal = useBuilderStore((s) => s.updateBlockContent);

  const form = useForm<NpsContent>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(npsContentSchema) as any,
    defaultValues: block.content as NpsContent,
    mode: 'onChange',
  });

  useEffect(() => {
    const next = block.content as NpsContent;
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
                  placeholder="Насколько вероятно, что вы порекомендуете нас другу или коллеге?"
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

        {/* Static preview row 0..10 with fixed Russian endpoint labels */}
        <div aria-hidden="true">
          <div
            style={{
              display: 'flex',
              gap: 4,
              padding: 8,
              background: 'var(--bg-chip)',
              border: `1px solid var(--border-2)`,
              borderRadius: 'var(--radius)',
              flexWrap: 'wrap',
            }}
          >
            {Array.from({ length: 11 }, (_, i) => i).map((n) => (
              <div
                key={n}
                style={{
                  flex: '1 1 28px',
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
              padding: '6px 4px 0',
              font: '400 11px/14px var(--font-sans)',
              color: 'var(--text-3)',
            }}
          >
            <span>Точно НЕ порекомендую</span>
            <span>Точно порекомендую</span>
          </div>
        </div>

        <ToggleRow
          label="Обязательный ответ"
          hint="Респондент не сможет перейти дальше, пока не выберет оценку от 0 до 10."
          checked={!!form.watch('required')}
          disabled={disabled}
          onChange={(v) => form.setValue('required', v, { shouldDirty: true })}
        />
      </form>
    </Form>
  );
}
