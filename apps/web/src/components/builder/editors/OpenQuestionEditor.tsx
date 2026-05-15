/**
 * <OpenQuestionEditor> — Plan 01-03 Task 7 / RESEARCH.md Pattern 8.
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
import { openQuestionContentSchema, type OpenQuestionContent } from '@/lib/blocks/schemas';
import { useBuilderStore } from '@/lib/stores/builder';
import type { Block } from '@/lib/blocks/types';

export interface OpenQuestionEditorProps {
  block: Block;
  disabled?: boolean;
  onSave: (input: {
    content: OpenQuestionContent;
    version: number;
    idempotencyKey: string;
  }) => void;
  serverVersion: number;
}

export function OpenQuestionEditor({
  block,
  disabled,
  onSave,
  serverVersion,
}: OpenQuestionEditorProps) {
  const updateLocal = useBuilderStore((s) => s.updateBlockContent);
  const form = useForm<OpenQuestionContent>({
    resolver: zodResolver(openQuestionContentSchema),
    defaultValues: block.content as OpenQuestionContent,
    mode: 'onChange',
  });

  useEffect(() => {
    const next = block.content as OpenQuestionContent;
    if (JSON.stringify(form.getValues()) !== JSON.stringify(next)) {
      form.reset(next);
    }
  }, [block.id, block.version, block.content]);

  const watched = form.watch();
  const debounced = useDebouncedValue(watched, 700);
  const lastSavedRef = useRef<string>(JSON.stringify(block.content));

  useEffect(() => {
    if (!form.formState.isDirty || !form.formState.isValid || disabled) return;
    const serialised = JSON.stringify(debounced);
    if (serialised === lastSavedRef.current) return;

    onSave({
      content: debounced,
      version: serverVersion,
      idempotencyKey: uuidv7(),
    });
    lastSavedRef.current = serialised;
    updateLocal(block.id, debounced);
  }, [debounced, disabled, serverVersion]);

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4">
        <FormField
          control={form.control as never}
          name="question"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Your question</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  disabled={disabled}
                  rows={3}
                  placeholder="What did you find confusing about this design?"
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
              <FormLabel>Helper (optional)</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={field.value ?? ''}
                  disabled={disabled}
                  placeholder="A short hint for the respondent"
                />
              </FormControl>
              <FormDescription>
                Optional. Set a min/max length for the answer below.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control as never}
            name="min_length"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Min length</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    value={field.value ?? ''}
                    onChange={(e) =>
                      field.onChange(e.target.value === '' ? undefined : Number(e.target.value))
                    }
                    disabled={disabled}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control as never}
            name="max_length"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Max length</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    max={5000}
                    value={field.value ?? ''}
                    onChange={(e) =>
                      field.onChange(e.target.value === '' ? undefined : Number(e.target.value))
                    }
                    disabled={disabled}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </form>
    </Form>
  );
}
