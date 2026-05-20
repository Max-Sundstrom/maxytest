/**
 * <ChoiceEditor> — Plan 04-02 Task 2 / D-94 / BLK-04.
 *
 * Single- / multi-choice block editor. Shell copied 1:1 from
 * OpenQuestionEditor.tsx (RESEARCH.md Pattern 8 + Plan 01-03 conventions):
 *   - useForm + zodResolver(choiceContentSchema)
 *   - 700ms autosave via useDebouncedValue
 *   - version-column conflict via lastSavedRef + onSave({ content, version,
 *     idempotencyKey: uuidv7() })
 *   - updateLocal(block.id, debounced) so the in-memory store stays in
 *     lockstep with the optimistic mutation
 *
 * Form fields (D-94):
 *   - question                     (Input, required, ≤ 280)
 *   - helper                       (Input, optional, ≤ 200)
 *   - mode                         (segmented single / multi)
 *   - options[]                    (sortable list, ≥ 2 / ≤ 20)
 *   - hasOtherOption               (custom switch)
 *   - shuffleOptions               (custom switch)
 *   - required                     (custom switch, default OFF per D-93)
 *   - min_selections / max_selections (number inputs, multi-mode only)
 *
 * All copy in Russian per CLAUDE.md «Общение с пользователем»; colours
 * via CSS vars only (no hardcoded hex). 44px touch floor on drag handles
 * and delete buttons (44px target = 20px icon + 12px padding).
 */

import { useEffect, useMemo, useRef } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { uuidv7 } from 'uuidv7';
import { nanoid } from 'nanoid';
import { GripVertical, Plus, X } from 'lucide-react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToParentElement } from '@dnd-kit/modifiers';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
import { choiceContentSchema, type ChoiceContent } from '@/lib/blocks/schemas';
import { useBuilderStore } from '@/lib/stores/builder';
import type { Block } from '@/lib/blocks/types';

export interface ChoiceEditorProps {
  block: Block;
  disabled?: boolean;
  onSave: (input: { content: ChoiceContent; version: number; idempotencyKey: string }) => void;
  serverVersion: number;
}

export function ChoiceEditor({ block, disabled, onSave, serverVersion }: ChoiceEditorProps) {
  const updateLocal = useBuilderStore((s) => s.updateBlockContent);

  const form = useForm<ChoiceContent>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(choiceContentSchema) as any,
    defaultValues: block.content as ChoiceContent,
    mode: 'onChange',
  });

  useEffect(() => {
    const next = block.content as ChoiceContent;
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

  const { fields, append, remove, move } = useFieldArray({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    control: form.control as any,
    name: 'options',
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = fields.findIndex((f) => f.id === active.id);
    const to = fields.findIndex((f) => f.id === over.id);
    if (from === -1 || to === -1) return;
    move(from, to);
  }

  const mode = form.watch('mode');
  const optionsCount = fields.length;
  const sortableIds = useMemo(() => fields.map((f) => f.id), [fields]);

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
                  placeholder="Какой вариант вам ближе?"
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

        {/* Mode selector */}
        <FormField
          control={form.control as never}
          name="mode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Режим выбора</FormLabel>
              <FormControl>
                <div
                  role="radiogroup"
                  aria-label="Режим выбора"
                  style={{
                    display: 'inline-flex',
                    background: 'var(--bg-chip)',
                    borderRadius: 'var(--radius)',
                    padding: 2,
                    gap: 2,
                  }}
                >
                  {(
                    [
                      { value: 'single', label: 'Один вариант' },
                      { value: 'multi', label: 'Несколько вариантов' },
                    ] as const
                  ).map((opt) => {
                    const active = field.value === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={disabled}
                        onClick={() => field.onChange(opt.value)}
                        style={{
                          height: 30,
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
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Options list */}
        <div>
          <div
            style={{
              font: '500 13px var(--font-sans)',
              color: 'var(--text-1)',
              marginBottom: 8,
            }}
          >
            Варианты ответа
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToParentElement]}
          >
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              <ul
                style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 0, margin: 0 }}
              >
                {fields.map((f, index) => (
                  <OptionRow
                    key={f.id}
                    id={f.id}
                    disabled={!!disabled}
                    register={form.register(`options.${index}.label` as const)}
                    onRemove={optionsCount > 2 ? () => remove(index) : undefined}
                    error={form.formState.errors.options?.[index]?.label?.message}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
          {form.formState.errors.options?.root?.message ||
          form.formState.errors.options?.message ? (
            <p
              role="alert"
              style={{
                font: '400 12px/16px var(--font-sans)',
                color: 'var(--color-danger)',
                margin: '6px 0 0',
              }}
            >
              {form.formState.errors.options?.root?.message ??
                form.formState.errors.options?.message}
            </p>
          ) : null}
          <button
            type="button"
            disabled={disabled || optionsCount >= 20}
            onClick={() => append({ id: `opt-${nanoid(6)}`, label: '' })}
            style={{
              marginTop: 10,
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
              cursor: disabled || optionsCount >= 20 ? 'not-allowed' : 'pointer',
              transition: 'background 120ms cubic-bezier(.2,.7,.3,1)',
              opacity: optionsCount >= 20 ? 0.5 : 1,
            }}
          >
            <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
            <span>Добавить вариант</span>
          </button>
        </div>

        {/* Toggles */}
        <ToggleRow
          label="Добавить «Другое»"
          hint="Респондент сможет выбрать «Другое» и ввести свой вариант текстом."
          checked={!!form.watch('hasOtherOption')}
          disabled={disabled}
          onChange={(v) => form.setValue('hasOtherOption', v, { shouldDirty: true })}
        />
        <ToggleRow
          label="Перемешать варианты"
          hint="Каждый респондент увидит варианты в случайном порядке (для одного человека порядок не меняется)."
          checked={!!form.watch('shuffleOptions')}
          disabled={disabled}
          onChange={(v) => form.setValue('shuffleOptions', v, { shouldDirty: true })}
        />
        <ToggleRow
          label="Обязательный ответ"
          hint="Респондент не сможет перейти дальше, пока не выберет вариант."
          checked={!!form.watch('required')}
          disabled={disabled}
          onChange={(v) => form.setValue('required', v, { shouldDirty: true })}
        />

        {/* Multi-mode min/max selectors */}
        {mode === 'multi' ? (
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control as never}
              name="min_selections"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Минимум выборов</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      value={field.value ?? ''}
                      onChange={(e) =>
                        field.onChange(e.target.value === '' ? undefined : Number(e.target.value))
                      }
                      disabled={disabled}
                      placeholder="0"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control as never}
              name="max_selections"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Максимум выборов</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      value={field.value ?? ''}
                      onChange={(e) =>
                        field.onChange(e.target.value === '' ? undefined : Number(e.target.value))
                      }
                      disabled={disabled}
                      placeholder="без ограничения"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        ) : null}
      </form>
    </Form>
  );
}

/* -------------------------------------------------------------------------- */
/*  OptionRow — single sortable option with drag handle + delete button       */
/* -------------------------------------------------------------------------- */

interface OptionRowProps {
  id: string;
  disabled: boolean;
  register: ReturnType<ReturnType<typeof useForm<ChoiceContent>>['register']>;
  onRemove?: () => void;
  error?: string;
}

function OptionRow({ id, disabled, register, onRemove, error }: OptionRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: 'var(--bg-card)',
    border: `1px solid ${error ? 'var(--color-danger)' : 'var(--border-1)'}`,
    borderRadius: 'var(--radius)',
    padding: '0 6px 0 0',
  };
  return (
    <li ref={setNodeRef} style={style}>
      <button
        type="button"
        aria-label="Перетащить вариант"
        disabled={disabled}
        {...attributes}
        {...listeners}
        style={{
          width: 32,
          height: 44,
          display: 'grid',
          placeItems: 'center',
          background: 'transparent',
          color: 'var(--text-3)',
          border: 0,
          cursor: disabled ? 'not-allowed' : 'grab',
        }}
      >
        <GripVertical size={16} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <Input
        {...register}
        disabled={disabled}
        placeholder="Подпись варианта"
        maxLength={120}
        style={{ flex: 1, border: 0, background: 'transparent' }}
      />
      {onRemove ? (
        <button
          type="button"
          aria-label="Удалить вариант"
          disabled={disabled}
          onClick={onRemove}
          style={{
            width: 32,
            height: 44,
            display: 'grid',
            placeItems: 'center',
            background: 'transparent',
            color: 'var(--text-3)',
            border: 0,
            borderRadius: 'var(--radius)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition:
              'background 120ms cubic-bezier(.2,.7,.3,1), color 120ms cubic-bezier(.2,.7,.3,1)',
          }}
          onMouseEnter={(e) => {
            if (!disabled) {
              e.currentTarget.style.background = 'var(--bg-chip)';
              e.currentTarget.style.color = 'var(--color-danger)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--text-3)';
          }}
        >
          <X size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
      ) : (
        <span aria-hidden="true" style={{ width: 32 }} />
      )}
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*  ToggleRow — Russian-language switch with helper hint (custom, no shadcn)  */
/* -------------------------------------------------------------------------- */

export interface ToggleRowProps {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}

export function ToggleRow({ label, hint, checked, disabled, onChange }: ToggleRowProps) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '8px 0',
        cursor: disabled ? 'not-allowed' : 'pointer',
        userSelect: 'none',
      }}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        style={{
          flexShrink: 0,
          width: 36,
          height: 20,
          marginTop: 2,
          background: checked ? 'var(--color-accent)' : 'var(--bg-chip)',
          border: `1px solid ${checked ? 'var(--color-accent)' : 'var(--border-1)'}`,
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
            left: checked ? 17 : 1,
            width: 16,
            height: 16,
            background: '#fff',
            borderRadius: '50%',
            boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
            transition: 'left 120ms cubic-bezier(.2,.7,.3,1)',
          }}
        />
      </button>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-1)' }}>
          {label}
        </span>
        {hint ? (
          <span style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-2)' }}>
            {hint}
          </span>
        ) : null}
      </div>
    </label>
  );
}
