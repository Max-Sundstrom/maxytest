/**
 * <NasaTlxEditor> — Quick task 260522-jwn / NASA-TLX (Raw).
 *
 * Designer can edit `title`, toggle each of 6 dimensions (mental / physical /
 * temporal / performance / effort / frustration) on/off, and toggle required.
 * Per-dimension labels + helpers are LOCKED in defaults (NASA_TLX_DIMENSION_META).
 *
 * The schema `.refine` rejects all-dimensions-disabled at editor save —
 * surface that error inline («Включите хотя бы одно измерение»).
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
import { nasaTlxContentSchema, type NasaTlxContent } from '@/lib/blocks/schemas';
import { NASA_TLX_DEFAULT, NASA_TLX_DIMENSION_META } from '@/lib/blocks/defaults';
import { useBuilderStore } from '@/lib/stores/builder';
import type { Block } from '@/lib/blocks/types';
import { ToggleRow } from './ChoiceEditor';

export interface NasaTlxEditorProps {
  block: Block;
  disabled?: boolean;
  onSave: (input: { content: NasaTlxContent; version: number; idempotencyKey: string }) => void;
  serverVersion: number;
}

type Dim = 'mental' | 'physical' | 'temporal' | 'performance' | 'effort' | 'frustration';
const ALL_DIMS: Dim[] = ['mental', 'physical', 'temporal', 'performance', 'effort', 'frustration'];

export function NasaTlxEditor({ block, disabled, onSave, serverVersion }: NasaTlxEditorProps) {
  const updateLocal = useBuilderStore((s) => s.updateBlockContent);

  const form = useForm<NasaTlxContent>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(nasaTlxContentSchema) as any,
    defaultValues: block.content as NasaTlxContent,
    mode: 'onChange',
  });

  useEffect(() => {
    const next = block.content as NasaTlxContent;
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

  const dimensions = watched.dimensions ?? NASA_TLX_DEFAULT.dimensions;
  const enabledCount = ALL_DIMS.filter((d) => dimensions[d]).length;
  const dimensionsError =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (form.formState.errors as any)?.dimensions?.message ?? null;

  function setDimension(dim: Dim, next: boolean) {
    form.setValue(
      'dimensions',
      { ...dimensions, [dim]: next },
      { shouldDirty: true, shouldValidate: true },
    );
  }

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4">
        <FormField
          control={form.control as never}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Заголовок блока</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  disabled={disabled}
                  placeholder={NASA_TLX_DEFAULT.title}
                  maxLength={120}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div
            style={{
              font: '500 13px var(--font-sans)',
              color: 'var(--text-1)',
            }}
          >
            Измерения нагрузки
          </div>
          <div
            style={{
              font: '400 12px var(--font-sans)',
              color: 'var(--text-3)',
            }}
          >
            Выключите те измерения, которые не подходят для вашего теста.
          </div>
        </div>

        {ALL_DIMS.map((dim) => {
          const meta = NASA_TLX_DIMENSION_META[dim];
          return (
            <ToggleRow
              key={dim}
              label={meta.label}
              hint={meta.helper}
              checked={!!dimensions[dim]}
              disabled={disabled}
              onChange={(v) => setDimension(dim, v)}
            />
          );
        })}

        {dimensionsError ? (
          <p
            role="alert"
            style={{
              font: '400 12px/18px var(--font-sans)',
              color: 'var(--color-danger)',
              margin: 0,
            }}
          >
            {String(dimensionsError)}
          </p>
        ) : null}

        {/* Compact preview — chip list of enabled dimensions */}
        <div
          aria-hidden="true"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 4,
            padding: 8,
            background: 'var(--bg-chip)',
            border: `1px solid var(--border-2)`,
            borderRadius: 'var(--radius)',
          }}
        >
          {enabledCount === 0 ? (
            <span
              style={{
                font: '400 12px var(--font-sans)',
                color: 'var(--text-3)',
              }}
            >
              Включите хотя бы одно измерение, чтобы респондент мог ответить.
            </span>
          ) : (
            ALL_DIMS.filter((d) => dimensions[d]).map((d) => (
              <span
                key={d}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: 24,
                  padding: '0 8px',
                  background: 'var(--bg-card)',
                  border: `1px solid var(--border-1)`,
                  borderRadius: 'var(--radius)',
                  font: '500 11px var(--font-sans)',
                  color: 'var(--text-2)',
                }}
              >
                {NASA_TLX_DIMENSION_META[d].label}
              </span>
            ))
          )}
        </div>

        <ToggleRow
          label="Обязательный ответ"
          hint="Респондент не сможет перейти дальше, пока не оценит каждое включённое измерение."
          checked={!!form.watch('required')}
          disabled={disabled}
          onChange={(v) => form.setValue('required', v, { shouldDirty: true })}
        />
      </form>
    </Form>
  );
}
