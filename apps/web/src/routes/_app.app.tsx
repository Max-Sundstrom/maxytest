/**
 * `/app` — designer's home / studies list.
 *
 * Phase 02.3-01 redesign + Phase 02.3 polish (2026-05-18) added a left
 * sidebar of folders, multi-select on tests, and drag-to-folder UX so
 * the designer can batch-archive (or restore) several tests at once.
 *
 * Visual contract: `.planning/design-system/handoff-v1/js/maxitest-list.jsx`
 *   + `index.html` `.mx-list*` rules. The 2026-05-18 follow-up flipped
 *   the layout from "folders top / tests bottom" to "folders left /
 *   tests right" so we have a stable drop-target column independent of
 *   scroll position.
 *
 * Layout:
 *   - AppTopbar (M-logo + Help + Settings) on bg-page.
 *   - Body grid: 240px sidebar + 1fr main, 32px gap, max-width 1480px.
 *   - Sidebar: section "Папки" with a small vertical stack of FolderCard
 *     entries — Active and Archive. Both are also drop targets.
 *   - Main: section "Тесты" with the per-status header and the list of
 *     TestRow. Multi-select: shift+click extends a range from the
 *     anchor; ⌘/Ctrl-click toggles a single id; plain click opens the
 *     study (legacy behaviour). Esc clears the selection.
 *   - SelectionToolbar pinned to the bottom of the main column when
 *     selection.size > 0 — shows the count + a primary CTA matching the
 *     "natural" bulk action for the current filter (archive when
 *     viewing active, restore when viewing archive).
 *
 * Drag & drop:
 *   - @dnd-kit/core PointerSensor with a 5 px activation distance so
 *     plain clicks never accidentally start a drag.
 *   - Each TestRow is a draggable; each FolderCard is a droppable.
 *   - On drop:
 *       - Dragging an UNSELECTED row → operate on just that row.
 *       - Dragging a SELECTED row → operate on the whole selection
 *         (Promise.all of useArchiveStudy / useRestoreStudy mutations —
 *         decision B from the scope review: parallel singles, not an
 *         atomic batch RPC. Atomic batch can be added later if partial
 *         failures become a real problem; current scale doesn't need it).
 *       - Direction depends on the source filter:
 *           filter='active' + drop on 'archive'  → archive
 *           filter='archived' + drop on 'active' → restore
 *           dropping back on the source folder is a no-op.
 *   - DragOverlay renders a counter chip when dragging > 1 selected
 *     rows; for a single row it renders the row title.
 *
 * Phase-6 deferred:
 *   - Real folders CRUD (the "+ Новая папка" pill stays as a toast
 *     placeholder). When real folders ship, this same DnD framework
 *     accepts more droppable ids without code changes — only the
 *     mutation dispatch grows.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Plus, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AppTopbar } from '@/components/shared/AppTopbar';
import { FolderCard } from '@/components/studies/FolderCard';
import { TestRow } from '@/components/studies/TestRow';
import { useCurrentWorkspace } from '@/lib/queries/workspaces';
import {
  useArchiveStudy,
  useCreateStudy,
  useRestoreStudy,
  useStudies,
  useStudiesArchived,
  type StudyRow,
} from '@/lib/queries/studies';

type LooseNavigate = (opts: { to: string; params?: Record<string, string> }) => unknown;

type ListFilter = 'active' | 'archived';
type FolderTarget = 'active' | 'archive';

/** Stable ids the route uses for the two real droppable folders. New
 *  folders introduced in Phase 6 will reuse this pattern. */
const DROPPABLE_ID_ACTIVE = 'folder-active';
const DROPPABLE_ID_ARCHIVE = 'folder-archive';

function AppHomeRoute() {
  const { workspace, isLoading: workspaceLoading, error: workspaceError } = useCurrentWorkspace();
  const studiesQuery = useStudies(workspace?.id);
  const archivedQuery = useStudiesArchived(workspace?.id);
  const createStudy = useCreateStudy(workspace?.id);
  const archiveMutation = useArchiveStudy();
  const restoreMutation = useRestoreStudy();
  const navigate = useNavigate() as unknown as LooseNavigate;

  const [triggerFailed, setTriggerFailed] = useState(false);
  const [filter, setFilter] = useState<ListFilter>('active');
  const [archiveTarget, setArchiveTarget] = useState<StudyRow | null>(null);

  // Multi-select state. selectedIds is the set of currently-selected
  // study ids; anchorId is the last "plain or cmd-click" row, used as
  // the start of a shift-click range.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);

  // Drag state: which row started the drag. Used by DragOverlay to
  // render the ghost.
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  // T-01-02-08: 2s trigger-failure detector for first-sign-in workspace bootstrap.
  useEffect(() => {
    if (workspace || workspaceLoading || workspaceError) return;
    const t = setTimeout(() => setTriggerFailed(true), 2000);
    return () => clearTimeout(t);
  }, [workspace, workspaceLoading, workspaceError]);

  // Clear the selection whenever the filter flips — keeping ids from
  // the OLD list selected would be confusing (they wouldn't be visible)
  // and the "natural action" (archive vs restore) is filter-dependent.
  useEffect(() => {
    setSelectedIds(new Set());
    setAnchorId(null);
  }, [filter]);

  // Esc clears the selection — standard pattern across file managers
  // and design tools. Only fires when a selection exists so we don't
  // intercept Esc for dialogs / drawers.
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedIds(new Set());
        setAnchorId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIds.size]);

  const studies = studiesQuery.studies;
  const archivedStudies = archivedQuery.studies;

  const visibleStudies = useMemo(
    () => (filter === 'active' ? studies : archivedStudies),
    [filter, studies, archivedStudies],
  );

  const handleCreate = () => {
    createStudy.mutate(
      {},
      {
        onSuccess: ({ studyId }) => {
          navigate({ to: '/studies/$id/edit', params: { id: studyId } });
        },
        onError: (err: unknown) => {
          const message = err instanceof Error ? err.message : 'Попробуй ещё раз через секунду.';
          toast.error('Не получилось создать тест', { description: message });
        },
      },
    );
  };

  const handleArchive = () => {
    if (!archiveTarget) return;
    archiveMutation.mutate(
      { studyId: archiveTarget.id, workspaceId: workspace?.id ?? null },
      { onSettled: () => setArchiveTarget(null) },
    );
  };

  // Row click router: shift = range, cmd/ctrl = toggle, plain = open.
  const handleRowClick = useCallback(
    (study: StudyRow, evt: React.MouseEvent<HTMLDivElement>) => {
      if (evt.shiftKey && anchorId) {
        const ids = visibleStudies.map((s) => s.id);
        const fromIdx = ids.indexOf(anchorId);
        const toIdx = ids.indexOf(study.id);
        if (fromIdx === -1 || toIdx === -1) return;
        const [lo, hi] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
        const next = new Set(selectedIds);
        for (let i = lo; i <= hi; i++) {
          const id = ids[i];
          if (id) next.add(id);
        }
        setSelectedIds(next);
        return;
      }
      if (evt.metaKey || evt.ctrlKey) {
        const next = new Set(selectedIds);
        if (next.has(study.id)) {
          next.delete(study.id);
        } else {
          next.add(study.id);
        }
        setSelectedIds(next);
        setAnchorId(study.id);
        return;
      }
      // Plain click — open the study, clear any existing selection so
      // the user doesn't land back here with stale selection state.
      setSelectedIds(new Set());
      setAnchorId(null);
      navigate({ to: '/studies/$id/edit', params: { id: study.id } });
    },
    [anchorId, selectedIds, visibleStudies, navigate],
  );

  const clearSelection = () => {
    setSelectedIds(new Set());
    setAnchorId(null);
  };

  // Bulk archive / restore — parallel singles via Promise.all (decision
  // B in the scope review). Each call goes through the same React Query
  // mutation hooks so cache invalidation / toasts / optimistic UI all
  // stay consistent with single-row actions from the kebab menu.
  const bulkArchive = async (ids: string[]) => {
    if (ids.length === 0) return;
    const wsId = workspace?.id ?? null;
    const results = await Promise.allSettled(
      ids.map((id) => archiveMutation.mutateAsync({ studyId: id, workspaceId: wsId })),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      toast.error(
        failed === ids.length
          ? 'Не получилось архивировать тесты'
          : `Архивировано ${ids.length - failed} из ${ids.length}. Часть запросов упала — попробуй ещё раз.`,
      );
    } else if (ids.length > 1) {
      toast.success(`Архивировано ${ids.length} ${ruPluralTests(ids.length)}`);
    }
    clearSelection();
  };

  const bulkRestore = async (ids: string[]) => {
    if (ids.length === 0) return;
    const wsId = workspace?.id ?? null;
    const results = await Promise.allSettled(
      ids.map((id) => restoreMutation.mutateAsync({ studyId: id, workspaceId: wsId })),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      toast.error(
        failed === ids.length
          ? 'Не получилось восстановить тесты'
          : `Восстановлено ${ids.length - failed} из ${ids.length}. Часть запросов упала.`,
      );
    } else if (ids.length > 1) {
      toast.success(`Восстановлено ${ids.length} ${ruPluralTests(ids.length)}`);
    }
    clearSelection();
  };

  // DnD wiring.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragStart = (evt: DragStartEvent) => {
    setActiveDragId(String(evt.active.id));
  };

  const handleDragEnd = (evt: DragEndEvent) => {
    const draggedId = String(evt.active.id);
    setActiveDragId(null);

    const dropTarget = evt.over?.data.current?.target as FolderTarget | undefined;
    if (!dropTarget) return;

    // If the dragged row is part of the current selection, the user is
    // moving the WHOLE selection. Otherwise it's a singleton drag — we
    // operate on just that row and leave the existing selection alone.
    const movingIds = selectedIds.has(draggedId) ? Array.from(selectedIds) : [draggedId];

    if (filter === 'active' && dropTarget === 'archive') {
      void bulkArchive(movingIds);
    } else if (filter === 'archived' && dropTarget === 'active') {
      void bulkRestore(movingIds);
    }
    // Drop onto the source folder (or any other no-op target) is silent
    // — nothing changes.
  };

  // Workspace error: hard stop, full-page message.
  if (workspaceError) {
    return (
      <RouteShell>
        <CenteredMessage
          title="Что-то пошло не так"
          body="Не получилось загрузить ваш workspace. Попробуйте обновить страницу."
        />
      </RouteShell>
    );
  }

  if (triggerFailed && !workspace) {
    return (
      <RouteShell>
        <CenteredMessage
          title="Не удалось создать workspace"
          body="Авто-создание workspace при первом входе не сработало. Свяжитесь с поддержкой."
        />
      </RouteShell>
    );
  }

  // Loading skeleton — preserved sidebar+main shape so the page doesn't
  // jump on first render once data lands.
  if (workspaceLoading || !workspace || studiesQuery.isLoading) {
    return (
      <RouteShell>
        <Body>
          <Sidebar
            header={
              <SidebarHeader label="Папки" right={<NewFolderPill onClick={notImplemented} />} />
            }
          >
            <SkeletonBlock height={56} />
            <SkeletonBlock height={56} />
          </Sidebar>
          <Main>
            <SectionHeader
              label="Тесты"
              right={<TestsHeaderActions onCreate={handleCreate} pending={createStudy.isPending} />}
            />
            <SkeletonBlock height={48} />
            <SkeletonBlock height={48} />
            <SkeletonBlock height={48} />
          </Main>
        </Body>
      </RouteShell>
    );
  }

  const selectedCount = selectedIds.size;

  return (
    <RouteShell>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <Body>
          <Sidebar
            header={
              <SidebarHeader label="Папки" right={<NewFolderPill onClick={notImplemented} />} />
            }
          >
            <DroppableFolderCard
              dropId={DROPPABLE_ID_ACTIVE}
              target="active"
              dropEnabled={filter === 'archived'}
              isDragging={!!activeDragId}
            >
              <FolderCard
                name="Все тесты"
                count={studies.length}
                color="moss"
                active={filter === 'active'}
                onClick={() => setFilter('active')}
              />
            </DroppableFolderCard>
            <DroppableFolderCard
              dropId={DROPPABLE_ID_ARCHIVE}
              target="archive"
              dropEnabled={filter === 'active'}
              isDragging={!!activeDragId}
            >
              <FolderCard
                name="Архив"
                count={archivedStudies.length}
                color="ink"
                muted
                active={filter === 'archived'}
                onClick={() => setFilter('archived')}
              />
            </DroppableFolderCard>
          </Sidebar>

          <Main>
            <SectionHeader
              label={filter === 'active' ? 'Тесты' : 'Архив'}
              right={
                filter === 'active' ? (
                  <TestsHeaderActions onCreate={handleCreate} pending={createStudy.isPending} />
                ) : null
              }
            />
            {visibleStudies.length === 0 ? (
              <EmptyTestsCallout
                onCreate={handleCreate}
                pending={createStudy.isPending}
                variant={filter === 'archived' ? 'archive-empty' : 'no-tests'}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {visibleStudies.map((s) => (
                  <DraggableTestRow key={s.id} id={s.id}>
                    <TestRow
                      study={s}
                      workspaceId={workspace.id}
                      selected={selectedIds.has(s.id)}
                      onRowClick={handleRowClick}
                      onArchiveRequest={(target) => setArchiveTarget(target)}
                    />
                  </DraggableTestRow>
                ))}
              </div>
            )}
          </Main>
        </Body>

        {/* DragOverlay portals to body and lives outside the layout grid —
            ghost follows the cursor; we tint it moss so it visually parses
            as part of the brand DnD vocabulary. */}
        <DragOverlay dropAnimation={null}>
          {activeDragId ? (
            <DragGhost
              count={selectedIds.has(activeDragId) ? selectedIds.size : 1}
              singleTitle={visibleStudies.find((s) => s.id === activeDragId)?.title}
            />
          ) : null}
        </DragOverlay>

        {/* Selection toolbar: appears only when something is selected.
            Sticky at the bottom of the main column so it stays in reach
            no matter how far the user has scrolled. */}
        {selectedCount > 0 ? (
          <SelectionToolbar
            count={selectedCount}
            mode={filter === 'active' ? 'archive' : 'restore'}
            pending={archiveMutation.isPending || restoreMutation.isPending}
            onArchive={() => void bulkArchive(Array.from(selectedIds))}
            onRestore={() => void bulkRestore(Array.from(selectedIds))}
            onClear={clearSelection}
          />
        ) : null}
      </DndContext>

      {/* Archive confirmation dialog (single-row archive from kebab). */}
      <Dialog
        open={!!archiveTarget}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Архивировать тест?</DialogTitle>
            <DialogDescription>
              Существующие ответы сохранятся. Респонденты не смогут начинать новые сессии. У вас
              есть 30 дней, чтобы восстановить тест.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setArchiveTarget(null)}
              disabled={archiveMutation.isPending}
            >
              Отмена
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleArchive}
              disabled={archiveMutation.isPending}
              aria-busy={archiveMutation.isPending || undefined}
            >
              {archiveMutation.isPending ? 'Архивирую…' : 'Архивировать'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RouteShell>
  );
}

// ─── Layout sub-components ────────────────────────────────────────────────

function RouteShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-page)' }}>
      <AppTopbar
        onHelp={() => toast.info('Документация скоро будет.')}
        onSettings={() => toast.info('Настройки будут в Phase 6.')}
      />
      {children}
    </div>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        padding: '32px 80px 80px',
        maxWidth: 1480,
        width: '100%',
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: '240px 1fr',
        gap: 32,
        alignItems: 'flex-start',
      }}
    >
      {children}
    </main>
  );
}

function Sidebar({ header, children }: { header: React.ReactNode; children: React.ReactNode }) {
  return (
    <aside
      style={{
        position: 'sticky',
        top: 32,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      {header}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </aside>
  );
}

function Main({ children }: { children: React.ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
      {children}
    </section>
  );
}

function SidebarHeader({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <h3
        style={{
          font: '400 14px var(--font-sans)',
          color: 'var(--text-3)',
          margin: 0,
        }}
      >
        {label}
      </h3>
      {right}
    </header>
  );
}

function SectionHeader({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <h3
        style={{
          font: '400 14px var(--font-sans)',
          color: 'var(--text-3)',
          margin: 0,
        }}
      >
        {label}
      </h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{right}</div>
    </header>
  );
}

// ─── Droppable / Draggable wrappers ───────────────────────────────────────

function DroppableFolderCard({
  dropId,
  target,
  dropEnabled,
  isDragging,
  children,
}: {
  dropId: string;
  target: FolderTarget;
  dropEnabled: boolean;
  isDragging: boolean;
  children: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: dropId,
    data: { type: 'folder', target },
    // Folders that would no-op on drop (e.g. dropping an active test on
    // "Все тесты") still render but report disabled so the DragOverlay
    // doesn't tease a green ring.
    disabled: !dropEnabled,
  });
  const showHint = isDragging && dropEnabled;
  return (
    <div
      ref={setNodeRef}
      style={{
        position: 'relative',
        borderRadius: 'var(--radius)',
        outline: showHint
          ? `2px dashed ${isOver ? 'var(--color-accent)' : 'color-mix(in oklab, var(--color-accent) 50%, transparent)'}`
          : 'none',
        outlineOffset: 4,
        transition: 'outline-color 120ms cubic-bezier(.2,.7,.3,1)',
        background: isOver
          ? 'color-mix(in oklab, var(--color-accent) 6%, transparent)'
          : 'transparent',
      }}
    >
      {children}
    </div>
  );
}

function DraggableTestRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        opacity: isDragging ? 0.4 : 1,
        transition: 'opacity 120ms cubic-bezier(.2,.7,.3,1)',
      }}
    >
      {children}
    </div>
  );
}

// ─── Drag overlay + selection toolbar ─────────────────────────────────────

function DragGhost({ count, singleTitle }: { count: number; singleTitle?: string | null }) {
  if (count <= 1) {
    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          height: 36,
          padding: '0 14px',
          background: 'var(--bg-card)',
          color: 'var(--text-1)',
          border: '1px solid var(--color-accent)',
          borderRadius: 'var(--radius)',
          boxShadow: '0 12px 24px rgba(0,0,0,0.18)',
          font: '500 13px var(--font-sans)',
          maxWidth: 360,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          cursor: 'grabbing',
        }}
      >
        {singleTitle || 'Тест'}
      </div>
    );
  }
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        height: 36,
        padding: '0 14px',
        background: 'var(--color-accent)',
        color: '#FFFFFF',
        borderRadius: 'var(--radius)',
        boxShadow: '0 12px 24px rgba(0,0,0,0.22)',
        font: '500 13px var(--font-sans)',
        cursor: 'grabbing',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 22,
          height: 22,
          background: 'rgba(255,255,255,0.18)',
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          font: '600 12px var(--font-mono)',
        }}
      >
        {count}
      </span>
      <span>
        {count} {ruPluralTests(count)}
      </span>
    </div>
  );
}

function SelectionToolbar({
  count,
  mode,
  pending,
  onArchive,
  onRestore,
  onClear,
}: {
  count: number;
  mode: 'archive' | 'restore';
  pending: boolean;
  onArchive: () => void;
  onRestore: () => void;
  onClear: () => void;
}) {
  return (
    <div
      role="region"
      aria-label="Действия с выбранными тестами"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 24,
        transform: 'translateX(-50%)',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '0 12px 0 16px',
        height: 48,
        background: 'var(--bg-card)',
        border: '1px solid var(--border-1)',
        borderRadius: 'var(--radius)',
        boxShadow: '0 16px 36px rgba(0,0,0,0.18)',
        font: '500 13.5px var(--font-sans)',
        color: 'var(--text-1)',
      }}
    >
      <span style={{ color: 'var(--text-2)' }}>
        Выбрано{' '}
        <span style={{ color: 'var(--text-1)', font: '500 13.5px var(--font-mono)' }}>{count}</span>{' '}
        {ruPluralTests(count)}
      </span>
      {mode === 'archive' ? (
        <button
          type="button"
          onClick={onArchive}
          disabled={pending}
          aria-busy={pending || undefined}
          style={{
            height: 32,
            padding: '0 14px',
            background: 'var(--color-accent)',
            color: '#FFFFFF',
            border: 0,
            borderRadius: 'var(--radius)',
            cursor: pending ? 'wait' : 'pointer',
            opacity: pending ? 0.6 : 1,
            font: '500 13px var(--font-sans)',
          }}
        >
          {pending ? 'Архивирую…' : 'Архивировать'}
        </button>
      ) : (
        <button
          type="button"
          onClick={onRestore}
          disabled={pending}
          aria-busy={pending || undefined}
          style={{
            height: 32,
            padding: '0 14px',
            background: 'var(--color-accent)',
            color: '#FFFFFF',
            border: 0,
            borderRadius: 'var(--radius)',
            cursor: pending ? 'wait' : 'pointer',
            opacity: pending ? 0.6 : 1,
            font: '500 13px var(--font-sans)',
          }}
        >
          {pending ? 'Восстанавливаю…' : 'Восстановить'}
        </button>
      )}
      <button
        type="button"
        onClick={onClear}
        aria-label="Сбросить выбор"
        style={{
          width: 32,
          height: 32,
          background: 'transparent',
          border: 0,
          borderRadius: 'var(--radius)',
          color: 'var(--text-2)',
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
        }}
      >
        <X size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}

// ─── Existing sub-components (mostly unchanged) ───────────────────────────

function NewFolderPill({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 32,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 12px',
        background: 'transparent',
        border: '1px dashed var(--border-strong)',
        borderRadius: 'var(--radius)',
        color: 'var(--text-2)',
        fontSize: 13,
        cursor: 'pointer',
        transition:
          'border-color 120ms cubic-bezier(.2,.7,.3,1), color 120ms cubic-bezier(.2,.7,.3,1)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-accent)';
        e.currentTarget.style.color = 'var(--color-accent)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-strong)';
        e.currentTarget.style.color = 'var(--text-2)';
      }}
    >
      <Plus size={12} strokeWidth={1.5} />
      <span>Новая папка</span>
    </button>
  );
}

function TestsHeaderActions({ onCreate, pending }: { onCreate: () => void; pending?: boolean }) {
  return (
    <>
      <button
        type="button"
        onClick={() => toast.info('Шаблоны будут в Phase 6.')}
        style={{
          height: 32,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          background: 'transparent',
          border: 0,
          padding: '0 10px',
          borderRadius: 'var(--radius)',
          color: 'var(--text-1)',
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        <Sparkles size={14} strokeWidth={1.5} />
        <span>Начать с шаблона</span>
      </button>
      <button
        type="button"
        onClick={onCreate}
        disabled={pending}
        aria-busy={pending || undefined}
        aria-label="Создать тест"
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: 'var(--color-accent)',
          color: '#fff',
          border: 0,
          display: 'grid',
          placeItems: 'center',
          cursor: pending ? 'wait' : 'pointer',
          opacity: pending ? 0.6 : 1,
        }}
      >
        <Plus size={16} strokeWidth={2} />
      </button>
    </>
  );
}

function EmptyTestsCallout({
  onCreate,
  pending,
  variant,
}: {
  onCreate: () => void;
  pending?: boolean;
  variant: 'no-tests' | 'archive-empty';
}) {
  const isArchive = variant === 'archive-empty';
  return (
    <div
      style={{
        padding: '48px 24px',
        textAlign: 'center',
        background: 'var(--bg-card)',
        border: '1px dashed var(--border-strong)',
        borderRadius: 'var(--radius)',
      }}
    >
      <h2 style={{ font: '500 17px/24px var(--font-sans)', color: 'var(--text-1)', margin: 0 }}>
        {isArchive ? 'Архив пуст' : 'Тестов пока нет'}
      </h2>
      <p
        style={{
          font: '400 13.5px/20px var(--font-sans)',
          color: 'var(--text-2)',
          margin: '6px 0 20px',
        }}
      >
        {isArchive
          ? 'Здесь будут тесты, которые ты заархивируешь.'
          : 'Создай первый тест из шаблона welcome → open_question → thanks за минуту.'}
      </p>
      {!isArchive && (
        <Button onClick={onCreate} disabled={pending} aria-busy={pending || undefined}>
          {pending ? 'Создаю…' : 'Создать первый тест'}
        </Button>
      )}
    </div>
  );
}

function CenteredMessage({ title, body }: { title: string; body: string }) {
  return (
    <main
      style={{
        padding: 32,
        maxWidth: 480,
        margin: '0 auto',
        textAlign: 'center',
        marginTop: 64,
      }}
    >
      <h1
        style={{
          font: '500 32px/38px var(--font-sans)',
          color: 'var(--text-1)',
          margin: '0 0 8px',
        }}
      >
        {title}
      </h1>
      <p style={{ font: '400 14px/20px var(--font-sans)', color: 'var(--text-2)' }}>{body}</p>
    </main>
  );
}

function SkeletonBlock({ height }: { height: number }) {
  return (
    <div
      style={{
        height,
        background: 'var(--bg-input)',
        borderRadius: 'var(--radius)',
        opacity: 0.6,
      }}
    />
  );
}

function notImplemented() {
  toast.info('Папки появятся в Phase 6 — пока тесты живут в одном пуле.');
}

// ─── Tiny utility (kept local so the route file stays portable). ──────────

function ruPluralTests(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'тест';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 11 || mod100 > 14)) return 'теста';
  return 'тестов';
}

export const Route = createFileRoute('/_app/app')({
  component: AppHomeRoute,
});
