/**
 * <PrototypeEditor> — Plan 02-06 Task 1 / CONTEXT D-08 inline thumbnail grid.
 *
 * Inline editor for the `prototype` block. Lives inside `<BlockCard>` so it
 * inherits the dirty / saving / saved / conflict / error state machine from
 * Phase 1's per-card `useUpdateBlock` mutation.
 *
 * Two visible states:
 *   1. EMPTY (no `prototype_version_id`):
 *      Renders a single CTA "Import Figma prototype" that opens
 *      <FigmaImportDialog>. On `onComplete(pvId)`, the editor stamps
 *      `prototype_version_id` into form state and auto-selects the first
 *      frame as `starting_frame_id` once `useFrames` data arrives.
 *   2. POPULATED:
 *      - Task instruction textarea (≤280 chars, mirrors open_question).
 *      - Snapshot indicator ("Snapshot from X / Source last modified Y")
 *        with a "Re-import" CTA when the Figma source is newer than the
 *        snapshot (PROTO-05 immutability — re-import is an explicit user
 *        action, not automatic).
 *      - Thumbnail grid (D-08 §2-3): each frame card shows a PNG render
 *        (lazy-loaded via SIGNED URL — B-04 — bucket is PRIVATE), name,
 *        a green ring + Start icon when it IS the starting frame, a
 *        numbered badge (1, 2, 3) when it sits in the success path, and
 *        a blue checkmark when it's a finish frame. Hover/tap reveals
 *        toggle buttons.
 *      - Success-path reorder (D-08 §4): sortable dnd-kit list below the
 *        grid using the same touch-friendly PointerSensor config as
 *        BuilderSidebar.
 *
 * Autosave:
 *   - 700ms debounce via `useDebouncedValue` (matches OpenQuestionEditor).
 *   - Only fires when `prototypeContentSchema.safeParse(debounced).success` —
 *     incomplete content (no prototype_version_id, no starting_frame_id,
 *     empty task_instruction) is held back so the DB row never carries
 *     an invalid state (T-02-06-01).
 *   - Each save passes a fresh `uuidv7()` idempotency key so server-side
 *     dedupe still works on retries (D-13).
 *
 * Signed URLs (B-04):
 *   The `prototype-renders` bucket is PRIVATE. Frame thumbnails cannot
 *   use raw storage URLs; the editor batches ONE `createSignedUrls` call
 *   per `prototype_version_id` (memoized via useEffect dep on pvId +
 *   frames.length) and stores the resulting `{path: signedUrl}` map in
 *   component state. URLs are valid for 86 400 s (24 h); leaked URLs
 *   become inert after that window.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { uuidv7 } from 'uuidv7';
import { CheckCircle2, Flag, Play, X } from 'lucide-react';
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
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { cn, formatRelativeTime, useDebouncedValue } from '@/lib/utils';
import { useBuilderStore } from '@/lib/stores/builder';
import {
  prototypeContentSchema,
  type BlockContent,
  type PrototypeContent,
} from '@/lib/blocks/schemas';
import type { Block } from '@/lib/blocks/types';
import { useFrames, usePrototypeVersion, type Frame } from '@/lib/queries/prototypes';
import { FigmaImportDialog } from '@/components/studies/FigmaImportDialog';
import { supabase } from '@/lib/supabase/auth';

export interface PrototypeEditorProps {
  block: Block;
  disabled?: boolean;
  onSave: (input: { content: BlockContent; version: number; idempotencyKey: string }) => void;
  serverVersion: number;
}

/**
 * In-progress form shape — `prototype_version_id` may be undefined until the
 * designer imports. Use `Partial<PrototypeContent>` everywhere the form state
 * is read so consumers don't pretend a field exists before it does.
 */
type DraftContent = Partial<PrototypeContent> & { type?: 'prototype' };

const STORAGE_BUCKET = 'prototype-renders';
const SIGNED_URL_TTL_SECONDS = 86_400;
const TASK_INSTRUCTION_MAX = 280;

export function PrototypeEditor({ block, disabled, onSave, serverVersion }: PrototypeEditorProps) {
  const updateLocal = useBuilderStore((s) => s.updateBlockContent);

  // Use `.partial()` at the resolver so the form is "valid enough" to render
  // in the empty state. The save effect re-validates against the FULL schema
  // before firing — see `safeParse(debounced).success` guard below.
  const form = useForm<DraftContent>({
    resolver: zodResolver(prototypeContentSchema.partial()),
    defaultValues: block.content as DraftContent,
    mode: 'onChange',
  });

  // Reset the form when a different block instance lands (sidebar switch) or
  // when the server bumped the version (post-conflict resolution).
  useEffect(() => {
    const next = block.content as DraftContent;
    if (JSON.stringify(form.getValues()) !== JSON.stringify(next)) {
      form.reset(next);
    }
  }, [block.id, block.version, block.content]);

  const watched = form.watch();
  const debounced = useDebouncedValue(watched, 700);
  const lastSavedRef = useRef<string>(JSON.stringify(block.content));

  // Autosave: ONLY fires when the debounced value satisfies the FULL
  // prototype schema. Partial states (no import yet, no starting frame) are
  // held back so the DB row never goes invalid (T-02-06-01).
  useEffect(() => {
    if (disabled) return;
    const parsed = prototypeContentSchema.safeParse(debounced);
    // [02.1-02] PROBE SITE 4 — autosave effect entry. Logs the debounced
    // candidate, parse result, and concurrency-relevant version fields so we
    // can correlate this fire against PROBE 1/2 (Re-import setValue snapshots)
    // and PROBE 5 (actual onSave payload). The `as any` cast is intentional
    // and temporary — `debounced` is `DraftContent` so individual fields are
    // `unknown | undefined`; Task 3 cleans this up if needed.
    console.log('[02.1-02] autosave effect fired', {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      debouncedPvId: (debounced as any)?.prototype_version_id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      debouncedStartFrame: (debounced as any)?.starting_frame_id,
      parseSuccess: parsed.success,
      lastSavedRef: lastSavedRef.current.slice(0, 80),
      serverVersion,
      blockVersion: block.version,
    });
    if (!parsed.success) return;
    const serialised = JSON.stringify(parsed.data);
    if (serialised === lastSavedRef.current) return;

    // [02.1-02] PROBE SITE 5 — autosave onSave payload. Logs IMMEDIATELY
    // before onSave so we capture the exact payload + version handed to the
    // mutation. Idempotency key value is never logged (D-13 trace hygiene).
    console.log('[02.1-02] autosave onSave payload', {
      contentPvId: parsed.data.prototype_version_id,
      contentStartFrame: parsed.data.starting_frame_id,
      version: serverVersion,
      idempotencyKey: 'present — uuidv7 generated inline; never log value',
    });
    onSave({
      content: parsed.data,
      version: serverVersion,
      idempotencyKey: uuidv7(),
    });
    lastSavedRef.current = serialised;
    updateLocal(block.id, parsed.data);
  }, [debounced, disabled, serverVersion]);

  // -------------------------------------------------------------------------
  // Data hooks
  // -------------------------------------------------------------------------

  const pvId = form.watch('prototype_version_id') ?? null;
  const { data: pv } = usePrototypeVersion(pvId);
  const { data: frames = [] } = useFrames(pvId);
  const startingFrame = form.watch('starting_frame_id');
  const successPath: string[] = useMemo(
    () => (form.watch('success_path') as string[] | undefined) ?? [],
    [form.watch('success_path')],
  );
  const finishFrames: string[] = useMemo(
    () => (form.watch('finish_frame_ids') as string[] | undefined) ?? [],
    [form.watch('finish_frame_ids')],
  );

  // -------------------------------------------------------------------------
  // Signed URLs (B-04) — batched per prototype_version_id, stored in state.
  // -------------------------------------------------------------------------

  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!pvId || frames.length === 0) {
      setSignedUrls({});
      return;
    }
    const paths = Array.from(
      new Set(frames.flatMap((f) => [f.render_path_1x, f.render_path_2x]).filter(Boolean)),
    );
    if (paths.length === 0) return;

    let aborted = false;
    void supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)
      .then(({ data, error }) => {
        if (aborted || error || !data) return;
        const map: Record<string, string> = {};
        for (const row of data) {
          if (row.path && row.signedUrl) {
            map[row.path] = row.signedUrl;
          }
        }
        setSignedUrls(map);
      });

    return () => {
      aborted = true;
    };
  }, [pvId, frames.length]);

  function srcForPath(path: string | undefined | null): string | undefined {
    if (!path) return undefined;
    return signedUrls[path];
  }

  // -------------------------------------------------------------------------
  // Auto-select first frame once frames arrive (after a fresh import).
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (pvId && frames.length > 0 && !startingFrame) {
      form.setValue('starting_frame_id', frames[0]!.frame_id, { shouldDirty: true });
    }
  }, [pvId, frames.length, startingFrame]);

  // -------------------------------------------------------------------------
  // Dialog state — controlled here so "Re-import" can re-open even in
  // populated state. Always render the dialog at the end of the component
  // tree so the same instance handles both "first import" and "re-import".
  // -------------------------------------------------------------------------

  const [importOpen, setImportOpen] = useState(false);

  // -------------------------------------------------------------------------
  // Per-card action toggles
  // -------------------------------------------------------------------------

  const handleSetStart = (frameId: string) => {
    form.setValue('starting_frame_id', frameId, { shouldDirty: true });
  };

  const handleToggleSuccessPath = (frameId: string) => {
    const next = successPath.includes(frameId)
      ? successPath.filter((id) => id !== frameId)
      : [...successPath, frameId];
    form.setValue('success_path', next, { shouldDirty: true });
  };

  const handleToggleFinish = (frameId: string) => {
    const next = finishFrames.includes(frameId)
      ? finishFrames.filter((id) => id !== frameId)
      : [...finishFrames, frameId];
    form.setValue('finish_frame_ids', next, { shouldDirty: true });
  };

  // -------------------------------------------------------------------------
  // dnd-kit success-path reorder (D-08 step 4)
  // -------------------------------------------------------------------------

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleSuccessPathDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = successPath.indexOf(String(active.id));
    const to = successPath.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(successPath, from, to);
    form.setValue('success_path', next, { shouldDirty: true });
  };

  // -------------------------------------------------------------------------
  // EMPTY STATE — no prototype imported yet
  // -------------------------------------------------------------------------

  if (!pvId) {
    return (
      <Form {...form}>
        <div className="flex flex-col items-center gap-4 rounded-lg border-2 border-dashed border-border p-8">
          <p className="text-sm text-muted-foreground">
            Import a Figma prototype to enable click tracking.
          </p>
          <Button type="button" onClick={() => setImportOpen(true)} disabled={disabled}>
            Import Figma prototype
          </Button>
        </div>
        <FigmaImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          studyId={block.study_id}
          onComplete={(newPvId) => {
            // [02.1-02] PROBE SITE 3 — first-import onComplete entry.
            // Included for comparison: the first-import path is known good;
            // diverging behaviour vs. PROBE 1 on the populated state path is
            // a signal that the bug is specific to Re-import wiring.
            console.log('[02.1-02] first-import onComplete entry', {
              newPvId,
              currentPvId: form.getValues('prototype_version_id'),
              currentStartingFrame: form.getValues('starting_frame_id'),
              blockVersion: block.version,
              serverVersion,
              formDirty: form.formState.isDirty,
              formDirtyFields: Object.keys(form.formState.dirtyFields),
            });
            form.setValue('prototype_version_id', newPvId, { shouldDirty: true });
            // starting_frame_id auto-selected once frames load via the
            // useEffect above.
          }}
        />
      </Form>
    );
  }

  // -------------------------------------------------------------------------
  // POPULATED STATE
  // -------------------------------------------------------------------------

  const snapshotDate = pv?.snapshot_taken_at ? new Date(pv.snapshot_taken_at) : null;
  const sourceDate = pv?.figma_source_last_modified
    ? new Date(pv.figma_source_last_modified)
    : null;
  const updateAvailable =
    snapshotDate && sourceDate ? sourceDate.getTime() > snapshotDate.getTime() : false;

  return (
    <Form {...form}>
      <form className="flex flex-col gap-6">
        {/* Task instruction */}
        <FormField
          control={form.control as never}
          name="task_instruction"
          render={({ field }) => {
            const length = (field.value ?? '').length;
            return (
              <FormItem>
                <FormLabel htmlFor="prototype-task-instruction">Task instruction</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    id="prototype-task-instruction"
                    value={field.value ?? ''}
                    disabled={disabled}
                    rows={3}
                    maxLength={TASK_INSTRUCTION_MAX}
                    placeholder="What should the respondent try to do? E.g., 'Find how to change your password.'"
                  />
                </FormControl>
                <FormDescription className="flex justify-between">
                  <span>Up to {TASK_INSTRUCTION_MAX} characters.</span>
                  <span aria-live="polite" className="tabular-nums">
                    {length}/{TASK_INSTRUCTION_MAX}
                  </span>
                </FormDescription>
                <FormMessage />
              </FormItem>
            );
          }}
        />

        {/* Snapshot indicator + re-import */}
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <div className="flex flex-col gap-0.5">
            <span>
              Snapshot from{' '}
              <strong className="font-medium text-foreground">
                {snapshotDate ? formatRelativeTime(snapshotDate) : 'unknown'}
              </strong>
            </span>
            <span>
              Source last modified{' '}
              <strong className="font-medium text-foreground">
                {sourceDate ? formatRelativeTime(sourceDate) : 'unknown'}
              </strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            {updateAvailable && (
              <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-900">
                Update available
              </span>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setImportOpen(true)}
              disabled={disabled}
            >
              Re-import
            </Button>
          </div>
        </div>

        {/* Thumbnail grid (D-08 §2-3) */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-medium text-foreground">Frames</h4>
            <span className="text-xs text-muted-foreground">{frames.length} total</span>
          </div>
          <div
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
            role="list"
            aria-label="Prototype frames"
          >
            {frames.map((frame) => {
              const isStart = frame.frame_id === startingFrame;
              const successIdx = successPath.indexOf(frame.frame_id);
              const inSuccess = successIdx >= 0;
              const isFinish = finishFrames.includes(frame.frame_id);
              const thumbUrl = srcForPath(frame.render_path_1x);
              return (
                <div
                  key={frame.id}
                  role="listitem"
                  className={cn(
                    'group relative flex flex-col gap-1 rounded-md border border-border bg-card p-2 transition-all',
                    isStart && 'ring-2 ring-emerald-500 ring-offset-1',
                  )}
                >
                  {/* Thumbnail or skeleton */}
                  <div className="relative aspect-[3/4] w-full overflow-hidden rounded bg-muted">
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt={frame.name}
                        loading="lazy"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div
                        aria-hidden="true"
                        className="h-full w-full animate-pulse bg-muted-foreground/10"
                      />
                    )}

                    {/* Start indicator (green ring + Play icon) */}
                    {isStart && (
                      <span
                        aria-label="Starting frame"
                        className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-medium text-white"
                      >
                        <Play className="size-3" aria-hidden="true" />
                        Start
                      </span>
                    )}

                    {/* Success-path numbered badge */}
                    {inSuccess && (
                      <span
                        aria-label={`Step ${successIdx + 1} in success path`}
                        className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500 text-[10px] font-semibold text-white"
                      >
                        {successIdx + 1}
                      </span>
                    )}

                    {/* Finish-frame checkmark */}
                    {isFinish && (
                      <span
                        aria-label="Finish frame"
                        className="absolute bottom-1 right-1 inline-flex items-center gap-1 rounded-full bg-blue-500 px-1.5 py-0.5 text-[10px] font-medium text-white"
                      >
                        <CheckCircle2 className="size-3" aria-hidden="true" />
                        Finish
                      </span>
                    )}
                  </div>

                  {/* Name label */}
                  <span className="truncate text-xs font-medium text-foreground" title={frame.name}>
                    {frame.name}
                  </span>

                  {/* Hover/focus actions */}
                  <div className="flex flex-wrap gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    {!isStart && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-6 px-1.5 text-[10px]"
                        onClick={() => handleSetStart(frame.frame_id)}
                        disabled={disabled}
                      >
                        Set as start
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-6 px-1.5 text-[10px]"
                      onClick={() => handleToggleSuccessPath(frame.frame_id)}
                      disabled={disabled}
                    >
                      {inSuccess ? 'Remove from path' : 'Add to success path'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-6 px-1.5 text-[10px]"
                      onClick={() => handleToggleFinish(frame.frame_id)}
                      disabled={disabled}
                    >
                      {isFinish ? (
                        <>Unmark finish</>
                      ) : (
                        <>
                          <Flag className="mr-1 size-3" aria-hidden="true" />
                          Mark as finish
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Success-path reorder list (D-08 §4) */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-medium text-foreground">Success path</h4>
            <span className="text-xs text-muted-foreground">
              {successPath.length} step{successPath.length === 1 ? '' : 's'}
            </span>
          </div>
          {successPath.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No success path yet — click &ldquo;Add to success path&rdquo; on any frame to build
              one.
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToParentElement]}
              onDragEnd={handleSuccessPathDragEnd}
            >
              <SortableContext items={successPath} strategy={horizontalListSortingStrategy}>
                <ul className="flex flex-wrap gap-2">
                  {successPath.map((frameId, index) => {
                    const frame = frames.find((f) => f.frame_id === frameId);
                    if (!frame) return null;
                    return (
                      <SuccessPathItem
                        key={frameId}
                        frame={frame}
                        index={index}
                        disabled={!!disabled}
                        thumbUrl={srcForPath(frame.render_path_1x)}
                        onRemove={() => handleToggleSuccessPath(frameId)}
                      />
                    );
                  })}
                </ul>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </form>

      {/* Dialog always rendered so "Re-import" works in populated state too */}
      <FigmaImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        studyId={block.study_id}
        onComplete={(newPvId) => {
          // [02.1-02] PROBE SITE 1 — re-import onComplete entry. Snapshots
          // the full state at the moment FigmaImportDialog hands us a fresh
          // pvId. Pair with PROBE 2 (post-setValue) to detect H3 dirty-merge
          // and with PROBE 4 (autosave effect) to detect H2 debounce-race.
          console.log('[02.1-02] reimport onComplete entry', {
            newPvId,
            currentPvId: form.getValues('prototype_version_id'),
            currentStartingFrame: form.getValues('starting_frame_id'),
            blockVersion: block.version,
            serverVersion,
            formDirty: form.formState.isDirty,
            formDirtyFields: Object.keys(form.formState.dirtyFields),
          });
          // Re-import: stamp the new pvId. Clear starting frame so the
          // auto-select effect re-runs with the new frame catalog
          // (D-06 remap — frame ids may differ between snapshots).
          form.setValue('prototype_version_id', newPvId, { shouldDirty: true });
          form.setValue('starting_frame_id', '', { shouldDirty: true });
          form.setValue('success_path', [], { shouldDirty: true });
          form.setValue('finish_frame_ids', [], { shouldDirty: true });
          // [02.1-02] PROBE SITE 2 — re-import post-setValue. Captures the
          // form snapshot AFTER all four setValue calls so we can confirm
          // RHF actually merged the new pvId into watched/dirtied state.
          console.log('[02.1-02] reimport onComplete post-setValue', {
            newFormValues: form.getValues(),
            formDirty: form.formState.isDirty,
            formDirtyFields: Object.keys(form.formState.dirtyFields),
          });
        }}
      />
    </Form>
  );
}

// ---------------------------------------------------------------------------
// <SuccessPathItem> — single sortable card inside the success-path dnd list.
// ---------------------------------------------------------------------------

interface SuccessPathItemProps {
  frame: Frame;
  index: number;
  disabled: boolean;
  thumbUrl: string | undefined;
  onRemove: () => void;
}

function SuccessPathItem({ frame, index, disabled, thumbUrl, onRemove }: SuccessPathItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: frame.frame_id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1"
      aria-label={`Step ${index + 1}: ${frame.name}`}
    >
      <button
        type="button"
        className="flex cursor-grab items-center gap-2 touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Drag to reorder step ${index + 1}`}
        {...attributes}
        {...listeners}
      >
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500 text-[10px] font-semibold text-white">
          {index + 1}
        </span>
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={frame.name}
            className="h-10 w-[50px] rounded object-cover"
            loading="lazy"
          />
        ) : (
          <span
            aria-hidden="true"
            className="block h-10 w-[50px] animate-pulse rounded bg-muted-foreground/10"
          />
        )}
        <span className="max-w-[120px] truncate text-xs font-medium text-foreground">
          {frame.name}
        </span>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={onRemove}
        aria-label={`Remove ${frame.name} from success path`}
        disabled={disabled}
      >
        <X className="size-3" aria-hidden="true" />
      </Button>
    </li>
  );
}
