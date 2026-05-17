/**
 * `/app` — designer's home / studies list.
 *
 * Phase 02.3-01 redesign — full handoff-aligned rewrite. Old StudyList /
 * EmptyTestsState / ArchivedTabPanel components deleted.
 *
 * Visual contract: `.planning/design-system/handoff-v1/js/maxitest-list.jsx`
 *   + `index.html` `.mx-list*` rules.
 * Layout:
 *   - AppTopbar (M-logo + Help + Settings) on bg-page.
 *   - Body: centered max-width 1480px, padding 32px 80px 80px, two sections
 *     stacked with 40px gap.
 *   - Folders section: dashed "+ Новая папка" pill in header right; 4-column
 *     grid of FolderCard. Phase 1 has no real folders table — the Archive
 *     folder is the only one rendered; clicking it toggles the tests-list
 *     filter to show archived studies (replaces the old shadcn Tabs panel).
 *     New-folder pill is a placeholder for Phase 6+ folders CRUD.
 *   - Tests section: section header with "Начать с шаблона" text-button + 36px
 *     circular "+" primary button. 8px-gap list of <TestRow /> rows.
 *
 * Functional fidelity preserved from the old layout:
 *   - Workspace bootstrap gate (2s timeout → "setup failed" surface).
 *   - useCreateStudy → navigate to /studies/$id/edit on success.
 *   - useArchiveStudy (via TestRow kebab → confirm Dialog) preserves D-29
 *     30-day retention semantics.
 *   - useMoveStudyToDraft (kebab on published rows).
 */

import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
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
  useStudies,
  useStudiesArchived,
  type StudyRow,
} from '@/lib/queries/studies';

type LooseNavigate = (opts: { to: string; params?: Record<string, string> }) => unknown;

type ListFilter = 'active' | 'archived';

function AppHomeRoute() {
  const { workspace, isLoading: workspaceLoading, error: workspaceError } = useCurrentWorkspace();
  const studiesQuery = useStudies(workspace?.id);
  const archivedQuery = useStudiesArchived(workspace?.id);
  const createStudy = useCreateStudy(workspace?.id);
  const archiveMutation = useArchiveStudy();
  const navigate = useNavigate() as unknown as LooseNavigate;

  const [triggerFailed, setTriggerFailed] = useState(false);
  const [filter, setFilter] = useState<ListFilter>('active');
  const [archiveTarget, setArchiveTarget] = useState<StudyRow | null>(null);

  // T-01-02-08: 2s trigger-failure detector for first-sign-in workspace bootstrap.
  useEffect(() => {
    if (workspace || workspaceLoading || workspaceError) return;
    const t = setTimeout(() => setTriggerFailed(true), 2000);
    return () => clearTimeout(t);
  }, [workspace, workspaceLoading, workspaceError]);

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

  // Loading skeleton.
  if (workspaceLoading || !workspace || studiesQuery.isLoading) {
    return (
      <RouteShell>
        <Body>
          <Section label="Папки" right={<NewFolderPill onClick={notImplemented} />}>
            <FolderGrid>
              <SkeletonBlock height={56} />
              <SkeletonBlock height={56} />
              <SkeletonBlock height={56} />
              <SkeletonBlock height={56} />
            </FolderGrid>
          </Section>
          <Section
            label="Тесты"
            right={<TestsHeaderActions onCreate={handleCreate} pending={createStudy.isPending} />}
          >
            <SkeletonBlock height={48} />
            <SkeletonBlock height={48} />
            <SkeletonBlock height={48} />
          </Section>
        </Body>
      </RouteShell>
    );
  }

  return (
    <RouteShell>
      <Body>
        <Section label="Папки" right={<NewFolderPill onClick={notImplemented} />}>
          <FolderGrid>
            <FolderCard
              name="Все тесты"
              count={studies.length}
              color="moss"
              active={filter === 'active'}
              onClick={() => setFilter('active')}
            />
            <FolderCard
              name="Архив"
              count={archivedStudies.length}
              color="ink"
              muted
              active={filter === 'archived'}
              onClick={() => setFilter('archived')}
            />
          </FolderGrid>
        </Section>

        <Section
          label={filter === 'active' ? 'Тесты' : 'Архив'}
          right={
            filter === 'active' ? (
              <TestsHeaderActions onCreate={handleCreate} pending={createStudy.isPending} />
            ) : null
          }
        >
          {visibleStudies.length === 0 ? (
            <EmptyTestsCallout
              onCreate={handleCreate}
              pending={createStudy.isPending}
              variant={filter === 'archived' ? 'archive-empty' : 'no-tests'}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {visibleStudies.map((s, i) => (
                <TestRow
                  key={s.id}
                  study={s}
                  workspaceId={workspace.id}
                  active={i === 0 && filter === 'active' && s.status !== 'archived'}
                  onArchiveRequest={(target) => setArchiveTarget(target)}
                />
              ))}
            </div>
          )}
        </Section>
      </Body>

      {/* Archive confirmation dialog — preserved from old StudyList. */}
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

// ─── Layout sub-components — keep the route file readable ─────────────────

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
        display: 'flex',
        flexDirection: 'column',
        gap: 40,
      }}
    >
      {children}
    </main>
  );
}

function Section({
  label,
  right,
  children,
}: {
  label: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
      {children}
    </section>
  );
}

function FolderGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: 8,
      }}
    >
      {children}
    </div>
  );
}

function NewFolderPill({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 28,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 10px',
        background: 'transparent',
        border: '1px dashed var(--border-strong)',
        borderRadius: 'var(--radius)',
        color: 'var(--text-2)',
        fontSize: 12.5,
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
      <Plus size={11} strokeWidth={1.5} />
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
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          background: 'transparent',
          border: 0,
          padding: '8px 12px',
          borderRadius: 'var(--radius)',
          color: 'var(--text-1)',
          fontSize: 14,
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
          width: 36,
          height: 36,
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
        <Plus size={18} strokeWidth={2} />
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

export const Route = createFileRoute('/_app/app')({
  component: AppHomeRoute,
});
