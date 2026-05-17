/**
 * <TestRow /> — 48px-tall row for a single study in the home list.
 *
 * Source: handoff `js/maxitest-list.jsx` <TestRow /> + `.mx-trow*` CSS
 * (index.html lines 390-403). Grid: `1fr auto auto 28px` for name / block
 * strip / response count or draft tag / kebab.
 *
 * Block-type chip strip: the handoff shows real per-study block types
 * (info, choice, scale, proto, etc.). Phase 1 doesn't fetch block lists in
 * the studies query — fetching N×blocks per row would be wasteful. Until
 * Plan 02.3 polish adds an aggregate `block_types` column to the studies
 * view, the strip shows a deterministic placeholder set seeded by status
 * (welcome+thanks for draft, +scale for published). When the column ships,
 * swap the placeholder for `study.block_types.map(...)`.
 *
 * Kebab menu: shadcn DropdownMenu with Open / View report / Move to draft /
 * Duplicate (disabled, Phase 4 tooltip) / Archive. Wired to the same
 * mutations as the deleted StudyList — no behavioural regression.
 */

import { MoreVertical } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useArchiveStudy, useMoveStudyToDraft, type StudyRow } from '@/lib/queries/studies';
import { BlockChipStrip, placeholderBlockTypesFor } from './BlockChipStrip';

type LooseNavigate = (opts: { to: string; params?: Record<string, string> }) => unknown;

export interface TestRowProps {
  study: StudyRow;
  workspaceId: string | null;
  responseCount?: number;
  active?: boolean;
  onArchiveRequest?: (study: StudyRow) => void;
}

function ruPluralResponses(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'ответ';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 11 || mod100 > 14)) return 'ответа';
  return 'ответов';
}

export function TestRow({
  study,
  workspaceId,
  responseCount = 0,
  active = false,
  onArchiveRequest,
}: TestRowProps) {
  const navigate = useNavigate() as unknown as LooseNavigate;
  const archive = useArchiveStudy();
  const moveToDraft = useMoveStudyToDraft();

  const isDraft = study.status === 'draft';
  const isPublished = study.status === 'published';
  const isArchived = study.status === 'archived';
  const types = placeholderBlockTypesFor(study);

  const handleOpen = () => {
    navigate({ to: '/studies/$id/edit', params: { id: study.id } });
  };

  return (
    <div
      role="row"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto auto 28px',
        gap: 20,
        alignItems: 'center',
        padding: '0 16px',
        height: 48,
        background: 'var(--bg-card)',
        border: `1px solid ${active ? 'var(--color-accent)' : 'var(--border-1)'}`,
        borderRadius: 'var(--radius)',
        boxShadow: active
          ? '0 0 0 2px color-mix(in oklab, var(--color-accent) 20%, transparent)'
          : 'none',
        cursor: 'pointer',
        transition:
          'border-color 120ms cubic-bezier(.2,.7,.3,1), background 120ms cubic-bezier(.2,.7,.3,1)',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.borderColor = 'var(--color-accent)';
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.borderColor = 'var(--border-1)';
      }}
      onClick={handleOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleOpen();
        }
      }}
      tabIndex={0}
      aria-label={`Открыть ${study.title || 'тест без названия'}`}
    >
      <span
        style={{
          font: '500 13.5px/18px var(--font-sans)',
          color: 'var(--text-1)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {study.title || 'Новый тест'}
      </span>

      <BlockChipStrip types={types} />

      <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
        {isDraft ? (
          <span style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>черновик</span>
        ) : isArchived ? (
          <span style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>в архиве</span>
        ) : (
          <span>
            {responseCount} {ruPluralResponses(responseCount)}
          </span>
        )}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Действия для ${study.title || 'теста'}`}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 28,
            height: 28,
            borderRadius: 'var(--radius)',
            background: 'transparent',
            border: 0,
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
            color: 'var(--text-3)',
          }}
        >
          <MoreVertical size={14} strokeWidth={1.5} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onSelect={handleOpen}>Открыть</DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => navigate({ to: '/studies/$id/report', params: { id: study.id } })}
          >
            Открыть отчёт
          </DropdownMenuItem>
          {isPublished && (
            <DropdownMenuItem
              onSelect={() => moveToDraft.mutate({ studyId: study.id, workspaceId })}
              disabled={moveToDraft.isPending}
            >
              Вернуть в черновик
            </DropdownMenuItem>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuItem disabled aria-disabled>
                Дублировать
              </DropdownMenuItem>
            </TooltipTrigger>
            <TooltipContent side="left">Будет в Phase 4</TooltipContent>
          </Tooltip>
          <DropdownMenuSeparator />
          {!isArchived ? (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                onArchiveRequest?.(study);
              }}
              variant="destructive"
            >
              Архивировать
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onSelect={() => archive.mutate({ studyId: study.id, workspaceId })}
              disabled={archive.isPending}
            >
              Восстановить
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
