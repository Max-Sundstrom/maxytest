/**
 * <ScaleEditor> — Plan 04-02 Task 3 / BLK-05.
 *
 * 5- / 7- / 10-point numeric scale editor. Shell identical to ChoiceEditor:
 *   - useForm + zodResolver(scaleContentSchema)
 *   - 700ms autosave with version-column conflict + uuidv7 idempotency
 *   - updateLocal sync for the in-memory store
 *
 * Form fields:
 *   - question                (Input, ≤ 280)
 *   - helper                  (Input, optional, ≤ 200)
 *   - points                  (segmented 5 / 7 / 10)
 *   - endpointMinLabel        (Input, optional, ≤ 40)
 *   - endpointMaxLabel        (Input, optional, ≤ 40)
 *   - required                (ToggleRow switch, default OFF per D-93)
 *
 * Below the points selector — a static N-cell preview row so designer
 * sees the scale shape immediately. Russian copy throughout.
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
import { scaleContentSchema, type ScaleContent } from '@/lib/blocks/schemas';
import { useBuilderStore } from '@/lib/stores/builder';
import type { Block } from '@/lib/blocks/types';
import { ToggleRow } from './ChoiceEditor';

export interface ScaleEditorProps {
  block: Block;
  disabled?: boolean;
  onSave: (input: { content: ScaleContent; version: number; idempotencyKey: string }) => void;
  serverVersion: number;
}

export function ScaleEditor({ block, disabled, onSave, serverVersion }: ScaleEditorProps) {
  const updateLocal = useBuilderStore((s) => s.updateBlockContent);

  const form = useForm<ScaleContent>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(scaleContentSchema) as any,
    defaultValues: block.content as ScaleContent,
    mode: 'onChange',
  });

  useEffect(() => {
    const next = block.content as ScaleContent;
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

  const points = form.watch('points');

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
                  placeholder="Оцените от 1 до 5"
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

        {/* Points selector */}
        <FormField
          control={form.control as never}
          name="points"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Количество точек шкалы</FormLabel>
              <FormControl>
                <div
                  role="radiogroup"
                  aria-label="Количество точек шкалы"
                  style={{
                    display: 'inline-flex',
                    background: 'var(--bg-chip)',
                    borderRadius: 'var(--radius)',
                    padding: 2,
                    gap: 2,
                  }}
                >
                  {([5, 7, 10] as const).map((value) => {
                    const active = field.value === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={disabled}
                        onClick={() => field.onChange(value)}
                        style={{
                          height: 30,
                          minWidth: 44,
                          padding: '0 12px',
                          background: active ? 'var(--bg-card)' : 'transparent',
                          color: active ? 'var(--text-1)' : 'var(--text-2)',
                          border: 0,
                          borderRadius: 'calc(var(--radius) - 2px)',
                          font: '500 13px var(--font-sans)',
                          cursor: disabled ? 'not-allowed' : 'pointer',
                          boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                          transition:
                            'background 120ms cubic-bezier(.2,.7,.3,1), color 120ms cubic-bezier(.2,.7,.3,1)',
                        }}
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Preview row */}
        <div
          aria-hidden="true"
          style={{
            display: 'flex',
            gap: 4,
            padding: 8,
            background: 'var(--bg-chip)',
            border: `1px solid var(--border-2)`,
            borderRadius: 'var(--radius)',
          }}
        >
          {Array.from({ length: points ?? 5 }, (_, i) => i + 1).map((n) => (
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

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control as never}
            name="endpointMinLabel"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Подпись слева</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    value={field.value ?? ''}
                    disabled={disabled}
                    placeholder="Совсем нет"
                    maxLength={40}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control as never}
            name="endpointMaxLabel"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Подпись справа</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    value={field.value ?? ''}
                    disabled={disabled}
                    placeholder="Полностью да"
                    maxLength={40}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <ToggleRow
          label="Обязательный ответ"
          hint="Респондент не сможет перейти дальше, пока не выберет точку шкалы."
          checked={!!form.watch('required')}
          disabled={disabled}
          onChange={(v) => form.setValue('required', v, { shouldDirty: true })}
        />
      </form>
    </Form>
  );
}
