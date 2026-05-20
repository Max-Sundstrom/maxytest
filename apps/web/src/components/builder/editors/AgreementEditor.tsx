/**
 * <AgreementEditor> — Plan 04-02 Task 3 / BLK-07 / D-95.
 *
 * Editor for legal-text + checkbox-of-consent block. Shell identical to
 * ChoiceEditor (useForm + zodResolver + 700ms autosave). Required toggle
 * defaults to TRUE per D-95 (legal consent block).
 *
 * Form fields:
 *   - question   (Input, ≤ 280)
 *   - legalText  (large Textarea, min-h ~180px, ≤ 5000 chars,
 *                 markdown-light hint: links via [text](url))
 *   - required   (ToggleRow switch — D-95 default TRUE)
 *
 * Counter «N / 5000» под Textarea — респонденты часто будут видеть длинные
 * соглашения; дизайнер должен видеть, сколько символов он уже занял.
 */

import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { uuidv7 } from 'uuidv7';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useDebouncedValue } from '@/lib/utils';
import { agreementContentSchema, type AgreementContent } from '@/lib/blocks/schemas';
import { useBuilderStore } from '@/lib/stores/builder';
import type { Block } from '@/lib/blocks/types';
import { ToggleRow } from './ChoiceEditor';

export interface AgreementEditorProps {
  block: Block;
  disabled?: boolean;
  onSave: (input: { content: AgreementContent; version: number; idempotencyKey: string }) => void;
  serverVersion: number;
}

const LEGAL_MAX = 5000;

export function AgreementEditor({ block, disabled, onSave, serverVersion }: AgreementEditorProps) {
  const updateLocal = useBuilderStore((s) => s.updateBlockContent);

  const form = useForm<AgreementContent>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(agreementContentSchema) as any,
    defaultValues: block.content as AgreementContent,
    mode: 'onChange',
  });

  useEffect(() => {
    const next = block.content as AgreementContent;
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

  const legalLength = (form.watch('legalText') ?? '').length;

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4">
        <FormField
          control={form.control as never}
          name="question"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Заголовок</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  disabled={disabled}
                  placeholder="Согласие с условиями"
                  maxLength={280}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control as never}
          name="legalText"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Текст согласия</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  disabled={disabled}
                  rows={9}
                  style={{ minHeight: 180, font: '400 14px/22px var(--font-sans)' }}
                  placeholder="Например: «Я согласен(-на) с тем, что мои ответы будут использованы…»"
                  maxLength={LEGAL_MAX}
                />
              </FormControl>
              <FormDescription>
                Поддерживается обычный текст с переносами строк. Ссылки можно вставлять в формате
                <span style={{ font: '500 12px var(--font-mono)', margin: '0 4px' }}>
                  [текст](https://…)
                </span>
                — респондент увидит подчёркнутую ссылку.
              </FormDescription>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  font: '400 11px var(--font-mono)',
                  color: legalLength > LEGAL_MAX * 0.95 ? 'var(--color-warn)' : 'var(--text-3)',
                  marginTop: -4,
                }}
                aria-live="polite"
              >
                {legalLength} / {LEGAL_MAX}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <ToggleRow
          label="Обязательное согласие"
          hint="Респондент не сможет перейти дальше, пока не поставит галочку «Я согласен(-на)»."
          checked={!!form.watch('required')}
          disabled={disabled}
          onChange={(v) => form.setValue('required', v, { shouldDirty: true })}
        />
      </form>
    </Form>
  );
}
