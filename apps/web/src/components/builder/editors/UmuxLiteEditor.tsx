/**
 * <UmuxLiteEditor> — Quick task 260522-jwn / UMUX-Lite.
 *
 * Designer can edit item1_label, item2_label, helper, required. Endpoint
 * labels («Совершенно не согласен(-на) ←→ Полностью согласен(-на)») are
 * LOCKED in defaults.ts.
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
import { umuxLiteContentSchema, type UmuxLiteContent } from '@/lib/blocks/schemas';
import {
  UMUX_LITE_DEFAULT,
  UMUX_LITE_ENDPOINT_MAX,
  UMUX_LITE_ENDPOINT_MIN,
} from '@/lib/blocks/defaults';
import { useBuilderStore } from '@/lib/stores/builder';
import type { Block } from '@/lib/blocks/types';
import { ToggleRow } from './ChoiceEditor';

export interface UmuxLiteEditorProps {
  block: Block;
  disabled?: boolean;
  onSave: (input: { content: UmuxLiteContent; version: number; idempotencyKey: string }) => void;
  serverVersion: number;
}

const POINTS = 7;

export function UmuxLiteEditor({ block, disabled, onSave, serverVersion }: UmuxLiteEditorProps) {
  const updateLocal = useBuilderStore((s) => s.updateBlockContent);

  const form = useForm<UmuxLiteContent>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(umuxLiteContentSchema) as any,
    defaultValues: block.content as UmuxLiteContent,
    mode: 'onChange',
  });

  useEffect(() => {
    const next = block.content as UmuxLiteContent;
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

  const item1Label = form.watch('item1_label') || UMUX_LITE_DEFAULT.item1_label;
  const item2Label = form.watch('item2_label') || UMUX_LITE_DEFAULT.item2_label;

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4">
        <FormField
          control={form.control as never}
          name="item1_label"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Пункт 1 (capability)</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  disabled={disabled}
                  placeholder={UMUX_LITE_DEFAULT.item1_label}
                  maxLength={280}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control as never}
          name="item2_label"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Пункт 2 (ease)</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  disabled={disabled}
                  placeholder={UMUX_LITE_DEFAULT.item2_label}
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
                  placeholder="Например: Оцените, насколько вы согласны с каждым утверждением."
                  maxLength={200}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Preview — two stacked rows */}
        <div
          aria-hidden="true"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            padding: 8,
            background: 'var(--bg-chip)',
            border: `1px solid var(--border-2)`,
            borderRadius: 'var(--radius)',
          }}
        >
          <PreviewRow label={item1Label} />
          <PreviewRow label={item2Label} />
        </div>

        <ToggleRow
          label="Обязательный ответ"
          hint="Респондент не сможет перейти дальше, пока не оценит оба пункта."
          checked={!!form.watch('required')}
          disabled={disabled}
          onChange={(v) => form.setValue('required', v, { shouldDirty: true })}
        />
      </form>
    </Form>
  );
}

function PreviewRow({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div
        style={{
          font: '500 12px var(--font-sans)',
          color: 'var(--text-2)',
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {Array.from({ length: POINTS }, (_, i) => i + 1).map((n) => (
          <div
            key={n}
            style={{
              flex: 1,
              minWidth: 24,
              height: 28,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--bg-card)',
              border: `1px solid var(--border-1)`,
              borderRadius: 'var(--radius)',
              font: '500 11px var(--font-mono)',
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
        <span>{UMUX_LITE_ENDPOINT_MIN}</span>
        <span>{UMUX_LITE_ENDPOINT_MAX}</span>
      </div>
    </div>
  );
}
