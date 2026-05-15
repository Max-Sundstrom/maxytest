/**
 * <WelcomeEditor> — Plan 01-03 Task 7 / RESEARCH.md Pattern 8.
 *
 * react-hook-form + Zod inline editor with 700ms-debounced autosave (D-13).
 * On successful save also calls `useBuilderStore.updateBlockContent` so the
 * edit is captured by the zundo history.
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
import { welcomeContentSchema, type WelcomeContent } from '@/lib/blocks/schemas';
import { useBuilderStore } from '@/lib/stores/builder';
import type { Block } from '@/lib/blocks/types';

export interface WelcomeEditorProps {
  block: Block;
  disabled?: boolean;
  onSave: (input: { content: WelcomeContent; version: number; idempotencyKey: string }) => void;
  /** Latest server version for the conditional UPDATE. */
  serverVersion: number;
}

export function WelcomeEditor({ block, disabled, onSave, serverVersion }: WelcomeEditorProps) {
  const updateLocal = useBuilderStore((s) => s.updateBlockContent);
  const form = useForm<WelcomeContent>({
    resolver: zodResolver(welcomeContentSchema),
    defaultValues: block.content as WelcomeContent,
    mode: 'onChange',
  });

  // Reset the form when the upstream block content changes (conflict resolve
  // / cross-tab refetch / undo). Compare by JSON to avoid a render loop.
  useEffect(() => {
    const next = block.content as WelcomeContent;
    if (JSON.stringify(form.getValues()) !== JSON.stringify(next)) {
      form.reset(next);
    }
  }, [block.id, block.version, block.content]);

  const watched = form.watch();
  const debounced = useDebouncedValue(watched, 700);
  const lastSavedRef = useRef<string>(JSON.stringify(block.content));

  useEffect(() => {
    const isDirty = form.formState.isDirty;
    const isValid = form.formState.isValid;
    if (!isDirty || !isValid || disabled) return;
    const serialised = JSON.stringify(debounced);
    if (serialised === lastSavedRef.current) return;

    onSave({
      content: debounced,
      version: serverVersion,
      idempotencyKey: uuidv7(),
    });
    lastSavedRef.current = serialised;
    // Mirror to undo history.
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
                <Input {...field} disabled={disabled} placeholder="Help us understand <product>" />
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
                  placeholder="Takes about 3 minutes…"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control as never}
          name="cta_label"
          render={({ field }) => (
            <FormItem>
              <FormLabel>CTA label</FormLabel>
              <FormControl>
                <Input {...field} disabled={disabled} placeholder="Start" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}
