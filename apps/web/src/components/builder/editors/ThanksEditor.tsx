/**
 * <ThanksEditor> — Plan 01-03 Task 7 / RESEARCH.md Pattern 8.
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
import { Textarea } from '@/components/ui/textarea';
import { useDebouncedValue } from '@/lib/utils';
import { thanksContentSchema, type ThanksContent } from '@/lib/blocks/schemas';
import { useBuilderStore } from '@/lib/stores/builder';
import type { Block } from '@/lib/blocks/types';

export interface ThanksEditorProps {
  block: Block;
  disabled?: boolean;
  onSave: (input: { content: ThanksContent; version: number; idempotencyKey: string }) => void;
  serverVersion: number;
}

export function ThanksEditor({ block, disabled, onSave, serverVersion }: ThanksEditorProps) {
  const updateLocal = useBuilderStore((s) => s.updateBlockContent);
  const form = useForm<ThanksContent>({
    resolver: zodResolver(thanksContentSchema),
    defaultValues: block.content as ThanksContent,
    mode: 'onChange',
  });

  useEffect(() => {
    const next = block.content as ThanksContent;
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
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input {...field} disabled={disabled} placeholder="Thank you!" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control as never}
          name="body"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Body</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  disabled={disabled}
                  rows={3}
                  placeholder="We appreciate you taking the time."
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}
