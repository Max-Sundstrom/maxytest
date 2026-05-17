/**
 * <BuilderTopbar /> — 2-row top bar for `/studies/$id/edit` (and report).
 *
 * Source: handoff `js/maxitest-builder.jsx` <Topbar /> + index.html `.mx-top*`
 * / `.mx-doctabs` rules (lines 178-208).
 *
 *   Row 1 (56px):
 *     [M-logo 32×32] [crumb: name 14/18 + meta `9 блоков · ✓ сохранено · Xс`]
 *     ⟶ right cluster: [list-view active] [logic-view] [settings] [eye preview]
 *                       [Опубликовать primary pill] [avatar 32×32]
 *
 *   Row 2 (40px):
 *     [Тест tab active] [Привлечь] [Отчёт + sky badge with response count]
 *
 *   Background: `var(--bg-sidebar)` (paper-1 in default skin). Active doctab
 *   lifts via `bg-page` + erases the bar's bottom border under it (the canvas
 *   below is also `bg-page`, so there's no visible seam).
 *
 * Wires to the same mutations as the deleted WorkspaceTopBar — Publish /
 * Move-to-draft / Archive / Restore / inline title edit / preview — so
 * existing useStudy/useUpdateStudyTitle/usePublishStudy contracts hold.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Eye, GitBranch, ListChecks, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { MLogo } from '@/components/shared/MLogo';
import { UserAvatarMenu } from '@/components/shared/UserAvatarMenu';
import { PublishLinkDialog } from '@/components/studies/PublishLinkDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  useArchiveStudy,
  useMoveStudyToDraft,
  usePublishStudy,
  useRestoreStudy,
  useStudy,
  useUpdateStudyTitle,
} from '@/lib/queries/studies';
import { useUiStore } from '@/lib/stores/ui';
import { useBuilderStore } from '@/lib/stores/builder';

type LooseNavigate = (opts: { to: string; params?: Record<string, string> }) => unknown;

export type BuilderTab = 'test' | 'recruit' | 'report';

export interface BuilderTopbarProps {
  studyId: string;
  workspaceId: string | null;
  active: BuilderTab;
  responseCount?: number;
}

export function BuilderTopbar({
  studyId,
  workspaceId,
  active,
  responseCount = 0,
}: BuilderTopbarProps) {
  const studyQuery = useStudy(studyId);
  const updateTitle = useUpdateStudyTitle(studyId);
  const publish = usePublishStudy();
  const moveToDraft = useMoveStudyToDraft();
  const archive = useArchiveStudy();
  const restore = useRestoreStudy();

  const setPreviewOverlayOpen = useUiStore((s) => s.setPreviewOverlayOpen);
  const navigate = useNavigate() as unknown as LooseNavigate;

  const blocks = useBuilderStore((s) => s.blocks);
  const blockCount = blocks.length;

  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishedRunToken, setPublishedRunToken] = useState<string | null>(null);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);

  const study = studyQuery.data;
  const status = (study?.status ?? 'draft') as 'draft' | 'published' | 'archived';

  const handlePublish = () => {
    publish.mutate(
      { studyId, workspaceId },
      {
        onSuccess: (data) => {
          setPublishedRunToken(data.run_token);
          setPublishDialogOpen(true);
        },
      },
    );
  };

  const handleCopyLink = async () => {
    const token = study?.run_token;
    if (!token) {
      toast.error('Сначала опубликуй тест — потом будет ссылка.');
      return;
    }
    const url = `${window.location.origin}/r/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Ссылка скопирована');
    } catch {
      toast.error('Не получилось обратиться к буферу обмена.');
    }
  };

  return (
    <header
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-sidebar)',
      }}
    >
      {/* Row 1 — crumb + chrome (56px) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 56,
          padding: '0 20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          <button
            type="button"
            onClick={() => navigate({ to: '/app' })}
            aria-label="К списку тестов"
            style={{
              background: 'transparent',
              border: 0,
              padding: 0,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <MLogo size={32} />
          </button>
          <Crumb
            studyId={studyId}
            workspaceId={workspaceId}
            title={study?.title ?? ''}
            blockCount={blockCount}
            updateBusy={updateTitle.isPending}
            onTitleSave={(next) => {
              if (next === study?.title) return;
              updateTitle.mutate(
                { title: next },
                {
                  onError: (err: unknown) => {
                    const message =
                      err instanceof Error ? err.message : 'Попробуй ещё раз через секунду.';
                    toast.error('Не получилось переименовать тест', { description: message });
                  },
                },
              );
            }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconBtn aria-label="Список блоков" on>
            <ListChecks size={16} strokeWidth={1.5} />
          </IconBtn>
          <IconBtn
            aria-label="Логика переходов"
            onClick={() => toast.info('Граф логики появится в Phase 4.')}
          >
            <GitBranch size={16} strokeWidth={1.5} />
          </IconBtn>
          <IconBtn
            aria-label="Настройки теста"
            onClick={() => toast.info('Настройки теста — Phase 6.')}
          >
            <Settings size={16} strokeWidth={1.5} />
          </IconBtn>
          <IconBtn aria-label="Превью" onClick={() => setPreviewOverlayOpen(true)}>
            <Eye size={16} strokeWidth={1.5} />
          </IconBtn>
          {/* 12px spacer before the high-emphasis cluster so the Publish pill
              and avatar feel intentional, not crammed against the icon row. */}
          <span aria-hidden="true" style={{ width: 4 }} />
          <PublishCluster
            status={status}
            publishing={publish.isPending}
            restoring={restore.isPending}
            onPublish={handlePublish}
            onCopyLink={handleCopyLink}
            onMoveToDraft={() => moveToDraft.mutate({ studyId, workspaceId })}
            onArchiveAsk={() => setArchiveConfirmOpen(true)}
            onRestore={() => restore.mutate({ studyId, workspaceId })}
          />
          <UserAvatarMenu />
        </div>
      </div>

      {/* Row 2 — document-style tabs (40px high tabs, on the bar) */}
      <div
        style={{
          display: 'flex',
          gap: 2,
          padding: '0 12px',
          alignItems: 'flex-end',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <DocTab
          active={active === 'test'}
          onClick={() => navigate({ to: '/studies/$id/edit', params: { id: studyId } })}
        >
          Тест
        </DocTab>
        <DocTab
          active={active === 'recruit'}
          onClick={() => toast.info('Привлечение респондентов — Phase 6.')}
        >
          Привлечь респондентов
        </DocTab>
        <DocTab
          active={active === 'report'}
          onClick={() => navigate({ to: '/studies/$id/report', params: { id: studyId } })}
          badge={responseCount > 0 ? String(responseCount) : undefined}
        >
          Отчёт
        </DocTab>
      </div>

      <PublishLinkDialog
        open={publishDialogOpen}
        onOpenChange={(open) => {
          setPublishDialogOpen(open);
          if (!open) setPublishedRunToken(null);
        }}
        runToken={publishedRunToken}
      />

      <Dialog open={archiveConfirmOpen} onOpenChange={setArchiveConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Архивировать тест?</DialogTitle>
            <DialogDescription>
              Существующие ответы сохранятся. Респонденты не смогут начинать новые сессии. У вас
              есть 30 дней, чтобы восстановить.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setArchiveConfirmOpen(false)}
              disabled={archive.isPending}
            >
              Отмена
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() =>
                archive.mutate(
                  { studyId, workspaceId },
                  {
                    onSettled: () => setArchiveConfirmOpen(false),
                  },
                )
              }
              disabled={archive.isPending}
              aria-busy={archive.isPending || undefined}
            >
              {archive.isPending ? 'Архивирую…' : 'Архивировать'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}

// ─── Crumb ───────────────────────────────────────────────────────────────

interface CrumbProps {
  studyId: string;
  workspaceId: string | null;
  title: string;
  blockCount: number;
  updateBusy: boolean;
  onTitleSave: (next: string) => void;
}

function Crumb({ title, blockCount, updateBusy, onTitleSave }: CrumbProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(title);
  }, [title]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    if (next.length === 0) {
      setDraft(title);
      setEditing(false);
      return;
    }
    onTitleSave(next);
    setEditing(false);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        minWidth: 0,
        paddingLeft: 4,
      }}
    >
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={draft}
          disabled={updateBusy}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setDraft(title);
              setEditing(false);
            }
          }}
          aria-label="Название теста"
          style={{
            font: '500 14px/18px var(--font-sans)',
            color: 'var(--text-1)',
            background: 'var(--bg-input)',
            border: 0,
            borderRadius: 'var(--radius-sm)',
            padding: '0 4px',
            margin: '0 -4px',
            outline: 'none',
            minWidth: 200,
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          style={{
            font: '500 14px/18px var(--font-sans)',
            color: 'var(--text-1)',
            background: 'transparent',
            border: 0,
            padding: 0,
            cursor: 'text',
            textAlign: 'left',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title || 'Untitled test'}
        </button>
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          font: '400 12px/16px var(--font-sans)',
          color: 'var(--text-3)',
          whiteSpace: 'nowrap',
        }}
      >
        <span>{blockCount} блоков</span>
        <span style={{ opacity: 0.5 }}>·</span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            color: 'var(--color-success)',
          }}
        >
          ✓ сохранено
        </span>
      </div>
    </div>
  );
}

// ─── DocTab ──────────────────────────────────────────────────────────────

interface DocTabProps {
  active?: boolean;
  badge?: string;
  onClick?: () => void;
  children: React.ReactNode;
}

function DocTab({ active, badge, onClick, children }: DocTabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 40,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 18px',
        background: active ? 'var(--bg-page)' : 'transparent',
        border: 0,
        borderRadius: 'var(--radius) var(--radius) 0 0',
        color: active ? 'var(--text-1)' : 'var(--text-2)',
        font: `${active ? 500 : 400} 13px var(--font-sans)`,
        cursor: 'pointer',
        position: 'relative',
        transition:
          'background 120ms cubic-bezier(.2,.7,.3,1), color 120ms cubic-bezier(.2,.7,.3,1)',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'color-mix(in oklab, var(--bg-page) 50%, transparent)';
          e.currentTarget.style.color = 'var(--text-1)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--text-2)';
        }
      }}
    >
      <span>{children}</span>
      {badge ? (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 16,
            minWidth: 16,
            padding: '0 5px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-accent-3)',
            color: '#fff',
            font: '500 10px var(--font-mono)',
          }}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

// ─── IconBtn ─────────────────────────────────────────────────────────────

interface IconBtnProps {
  on?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  'aria-label': string;
}

function IconBtn({ on, children, onClick, ...props }: IconBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 32,
        height: 32,
        display: 'grid',
        placeItems: 'center',
        background: on ? 'var(--bg-chip)' : 'transparent',
        border: 0,
        borderRadius: 'var(--radius)',
        color: on ? 'var(--text-1)' : 'var(--text-2)',
        cursor: 'pointer',
        transition: 'background 120ms cubic-bezier(.2,.7,.3,1)',
      }}
      onMouseEnter={(e) => {
        if (!on) {
          e.currentTarget.style.background = 'var(--bg-chip)';
          e.currentTarget.style.color = 'var(--text-1)';
        }
      }}
      onMouseLeave={(e) => {
        if (!on) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--text-2)';
        }
      }}
      {...props}
    >
      {children}
    </button>
  );
}

// ─── Publish cluster (status-keyed) ──────────────────────────────────────

interface PublishClusterProps {
  status: 'draft' | 'published' | 'archived';
  publishing: boolean;
  restoring: boolean;
  onPublish: () => void;
  onCopyLink: () => void;
  onMoveToDraft: () => void;
  onArchiveAsk: () => void;
  onRestore: () => void;
}

function PublishCluster({
  status,
  publishing,
  restoring,
  onPublish,
  onCopyLink,
  onMoveToDraft,
  onArchiveAsk,
  onRestore,
}: PublishClusterProps) {
  if (status === 'draft') {
    return (
      <button
        type="button"
        onClick={onPublish}
        disabled={publishing}
        aria-busy={publishing || undefined}
        style={publishPillStyle}
      >
        {publishing ? 'Публикую…' : 'Опубликовать'}
      </button>
    );
  }
  if (status === 'published') {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger style={publishPillStyle}>Опубликовано ▾</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuItem onSelect={onCopyLink}>Скопировать ссылку</DropdownMenuItem>
          <DropdownMenuItem onSelect={onMoveToDraft}>Вернуть в черновик</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              onArchiveAsk();
            }}
            variant="destructive"
          >
            Архивировать
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
  return (
    <button
      type="button"
      onClick={onRestore}
      disabled={restoring}
      aria-busy={restoring || undefined}
      style={publishPillStyle}
    >
      {restoring ? 'Восстанавливаю…' : 'Восстановить'}
    </button>
  );
}

const publishPillStyle: React.CSSProperties = {
  height: 32,
  background: 'var(--color-accent)',
  color: '#fff',
  border: 0,
  padding: '0 16px',
  borderRadius: 'var(--radius)',
  font: '500 13.5px var(--font-sans)',
  cursor: 'pointer',
  // marginLeft removed — gap:8 in the parent flex row owns the spacing now;
  // the prior +8 stacked on top of the gap and made the icon→publish gap
  // visually inconsistent with publish→avatar.
  display: 'inline-flex',
  alignItems: 'center',
  transition: 'filter 120ms cubic-bezier(.2,.7,.3,1)',
};
