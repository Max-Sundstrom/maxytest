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
  /**
   * Multi-select state. When true the row renders the moss-tinted
   * "checked" look; the caller manages the selection Set in route state
   * (Phase 02.3 follow-up — drag-to-folder UX).
   */
  selected?: boolean;
  /**
   * Optional override for the row's click handler. The route passes this
   * to differentiate plain-click (navigate to /edit) from shift- and
   * cmd/ctrl-click (mutate the selection set). When omitted, the row
   * falls back to its default navigate-to-edit behaviour.
   */
  onRowClick?: (study: StudyRow, evt: React.MouseEvent<HTMLDivElement>) => void;
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
  selected = false,
  onRowClick,
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

  // Effective border colour priority: selected wins over active wins over
  // default. Selected also adds a moss-tinted background so a sea of
  // selected rows visually parses as "a group" instead of just darker
  // borders.
  const borderColor = selected || active ? 'var(--color-accent)' : 'var(--border-1)';
  const ringShadow = selected
    ? '0 0 0 2px color-mix(in oklab, var(--color-accent) 28%, transparent)'
    : active
      ? '0 0 0 2px color-mix(in oklab, var(--color-accent) 20%, transparent)'
      : 'none';
  const background = selected
    ? 'color-mix(in oklab, var(--color-accent) 8%, var(--bg-card))'
    : 'var(--bg-card)';

  return (
    <div
      role="row"
      aria-selected={selected || undefined}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto auto 28px',
        gap: 20,
        alignItems: 'center',
        padding: '0 16px',
        height: 48,
        background,
        border: `1px solid ${borderColor}`,
        borderRadius: 'var(--radius)',
        boxShadow: ringShadow,
        cursor: 'pointer',
        transition:
          'border-color 120ms cubic-bezier(.2,.7,.3,1), background 120ms cubic-bezier(.2,.7,.3,1)',
        // Block native browser text-selection on shift+click — without this
        // the OS draws a highlight ribbon across the row's text on every
        // shift-click, which is jarring and competes with our own selected
        // styling.
        userSelect: 'none',
      }}
      onMouseEnter={(e) => {
        if (!active && !selected) e.currentTarget.style.borderColor = 'var(--color-accent)';
      }}
      onMouseLeave={(e) => {
        if (!active && !selected) e.currentTarget.style.borderColor = 'var(--border-1)';
      }}
      onClick={(evt) => {
        if (onRowClick) {
          onRowClick(study, evt);
          return;
        }
        handleOpen();
      }}
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
