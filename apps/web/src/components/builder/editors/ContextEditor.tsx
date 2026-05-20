/**
 * <ContextEditor> — Plan 04-02 Task 3 / BLK-08 / D-92.
 *
 * Composite block: 3 fixed canonical sub-questions (age / experience /
 * role). Each sub-question has an «Включить» toggle and its own nested
 * settings:
 *   - age:        list of options (id + label) with add / remove
 *   - experience: 5-point scale (locked) + endpoint labels
 *   - role:       single placeholder input
 *
 * Schema (`contextContentSchema`) refines that AT LEAST one sub-question
 * must be enabled — refine error attaches to `age_question` path, the
 * editor surfaces it as an inline message.
 *
 * Shell identical to ChoiceEditor: 700ms autosave + version conflict.
 * Required-toggle defaults to FALSE per D-93; required-semantics for the
 * runner is path b («at-least-one enabled sub-question filled») as
 * spec'd in CONTEXT.md L-2 closure.
 *
 * Note: this editor's «add age option» list is a deliberately *simpler*
 * version of ChoiceEditor's options list — no dnd-kit reorder here, just
 * vertical list + add/remove. Age options are bounded (≤ ~10 in practice),
 * and ordering rarely matters for demographic buckets.
 */

import { useEffect, useRef } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { uuidv7 } from 'uuidv7';
import { nanoid } from 'nanoid';
import { Plus, X } from 'lucide-react';
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
import { contextContentSchema, type ContextContent } from '@/lib/blocks/schemas';
import { useBuilderStore } from '@/lib/stores/builder';
import type { Block } from '@/lib/blocks/types';
import { ToggleRow } from './ChoiceEditor';

export interface ContextEditorProps {
  block: Block;
  disabled?: boolean;
  onSave: (input: { content: ContextContent; version: number; idempotencyKey: string }) => void;
  serverVersion: number;
}

export function ContextEditor({ block, disabled, onSave, serverVersion }: ContextEditorProps) {
  const updateLocal = useBuilderStore((s) => s.updateBlockContent);

  const form = useForm<ContextContent>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(contextContentSchema) as any,
    defaultValues: block.content as ContextContent,
    mode: 'onChange',
  });

  useEffect(() => {
    const next = block.content as ContextContent;
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

  // useFieldArray for age options (only valid when age_question.enabled)
  const {
    fields: ageFields,
    append: appendAge,
    remove: removeAge,
  } = useFieldArray({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    control: form.control as any,
    name: 'age_question.options',
  });

  const ageEnabled = !!form.watch('age_question.enabled');
  const expEnabled = !!form.watch('experience_question.enabled');
  const roleEnabled = !!form.watch('role_question.enabled');
  const refineError =
    form.formState.errors.age_question?.message ??
    (form.formState.errors as { root?: { message?: string } }).root?.message;

  return (
    <Form {...form}>
      <form className="flex flex-col gap-5">
        <FormField
          control={form.control as never}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Заголовок секции</FormLabel>
              <FormControl>
                <Input {...field} disabled={disabled} placeholder="О вас" maxLength={120} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* ---- Age section ------------------------------------------------ */}
        <Section
          title="Возраст"
          hint="Выбор из заранее заданных диапазонов."
          enabled={ageEnabled}
          disabled={disabled}
          onToggle={(v) =>
            form.setValue('age_question.enabled', v, { shouldDirty: true, shouldValidate: true })
          }
        >
          {ageEnabled ? (
            <>
              <div style={{ font: '500 12px var(--font-sans)', color: 'var(--text-2)' }}>
                Варианты ответа
              </div>
              <ul
                style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 0, margin: 0 }}
              >
                {ageFields.map((f, index) => (
                  <li
                    key={f.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      background: 'var(--bg-card)',
                      border: `1px solid var(--border-1)`,
                      borderRadius: 'var(--radius)',
                    }}
                  >
                    <Input
                      {...form.register(`age_question.options.${index}.label` as const)}
                      disabled={disabled}
                      placeholder="Например, 18–24"
                      maxLength={120}
                      style={{ border: 0, background: 'transparent', flex: 1 }}
                    />
                    {ageFields.length > 2 ? (
                      <button
                        type="button"
                        aria-label="Удалить вариант"
                        disabled={disabled}
                        onClick={() => removeAge(index)}
                        style={{
                          width: 32,
                          height: 44,
                          display: 'grid',
                          placeItems: 'center',
                          background: 'transparent',
                          color: 'var(--text-3)',
                          border: 0,
                          cursor: disabled ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <X size={14} strokeWidth={1.5} aria-hidden="true" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={disabled}
                onClick={() => appendAge({ id: `age-${nanoid(6)}`, label: '' })}
                style={{
                  marginTop: 8,
                  height: 32,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '0 12px',
                  background: 'transparent',
                  color: 'var(--color-accent)',
                  border: `1px dashed var(--border-1)`,
                  borderRadius: 'var(--radius)',
                  font: '500 13px var(--font-sans)',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  alignSelf: 'flex-start',
                }}
              >
                <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
                <span>Добавить вариант</span>
              </button>
            </>
          ) : null}
        </Section>

        {/* ---- Experience section ---------------------------------------- */}
        <Section
          title="Опыт"
          hint="5-балльная шкала «Новичок → Эксперт»."
          enabled={expEnabled}
          disabled={disabled}
          onToggle={(v) =>
            form.setValue('experience_question.enabled', v, {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
        >
          {expEnabled ? (
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control as never}
                name="experience_question.endpointMinLabel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Подпись слева</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ''}
                        disabled={disabled}
                        placeholder="Новичок"
                        maxLength={40}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control as never}
                name="experience_question.endpointMaxLabel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Подпись справа</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ''}
                        disabled={disabled}
                        placeholder="Эксперт"
                        maxLength={40}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          ) : null}
        </Section>

        {/* ---- Role section --------------------------------------------- */}
        <Section
          title="Должность / роль"
          hint="Свободный текст — что респондент сейчас делает в работе."
          enabled={roleEnabled}
          disabled={disabled}
          onToggle={(v) =>
            form.setValue('role_question.enabled', v, {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
        >
          {roleEnabled ? (
            <FormField
              control={form.control as never}
              name="role_question.placeholder"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Текст-подсказка в поле ввода</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ''}
                      disabled={disabled}
                      placeholder="UX-дизайнер, продакт-менеджер, разработчик…"
                      maxLength={120}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}
        </Section>

        {refineError ? (
          <p
            role="alert"
            style={{
              font: '400 12px/16px var(--font-sans)',
              color: 'var(--color-danger)',
              margin: 0,
            }}
          >
            {refineError}
          </p>
        ) : null}

        <ToggleRow
          label="Обязательный ответ"
          hint="При включении CTA-кнопка станет активной, как только респондент заполнит хотя бы один из включённых подвопросов."
          checked={!!form.watch('required')}
          disabled={disabled}
          onChange={(v) => form.setValue('required', v, { shouldDirty: true })}
        />
      </form>
    </Form>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section — collapsible-by-toggle wrapper for a single sub-question         */
/* -------------------------------------------------------------------------- */

interface SectionProps {
  title: string;
  hint: string;
  enabled: boolean;
  disabled?: boolean;
  onToggle: (next: boolean) => void;
  children: React.ReactNode;
}

function Section({ title, hint, enabled, disabled, onToggle, children }: SectionProps) {
  return (
    <section
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${enabled ? 'var(--border-1)' : 'var(--border-2)'}`,
        borderRadius: 'var(--radius)',
        padding: '14px 16px',
        opacity: enabled ? 1 : 0.85,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: enabled ? 12 : 0,
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ font: '500 14px/20px var(--font-sans)', color: 'var(--text-1)' }}>
            {title}
          </div>
          <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-2)' }}>
            {hint}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`Включить «${title}»`}
          disabled={disabled}
          onClick={() => onToggle(!enabled)}
          style={{
            flexShrink: 0,
            width: 36,
            height: 20,
            marginTop: 2,
            background: enabled ? 'var(--color-accent)' : 'var(--bg-chip)',
            border: `1px solid ${enabled ? 'var(--color-accent)' : 'var(--border-1)'}`,
            borderRadius: 999,
            position: 'relative',
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition:
              'background 120ms cubic-bezier(.2,.7,.3,1), border-color 120ms cubic-bezier(.2,.7,.3,1)',
            padding: 0,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 1,
              left: enabled ? 17 : 1,
              width: 16,
              height: 16,
              background: '#fff',
              borderRadius: '50%',
              boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
              transition: 'left 120ms cubic-bezier(.2,.7,.3,1)',
            }}
          />
        </button>
      </div>
      {enabled ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
      ) : null}
    </section>
  );
}
