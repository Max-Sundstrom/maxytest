/**
 * <BlockCatalogPanel> — Plan 01-03 Task 8 / UI-SPEC.md §"<BlockCatalogPanel>".
 *
 * Side panel (Drawer side="right" maxWidth=420) with 4 grouped sections:
 *   Survey · Prototype · Usability · Information architecture
 *
 * 2026-05-17 — migrated from shadcn `<Sheet>` (semi-transparent overlay
 * bled into the underlying Builder content) to our `<Drawer>` component
 * which ships an opaque-ish scrim (40% ink-0 + 2px backdrop-blur) and the
 * full design-system geometry. Same component the GoalScreenDrawer uses;
 * see `apps/web/src/components/ui/drawer.tsx` and memory entry
 * [[project_drawer_pattern_pending]].
 *
 * Phase 1: only `open_question` is enabled. welcome/thanks are auto-added at
 * study creation and are NOT rendered in the catalog (hardcoded exclusion).
 * All other types render disabled with the 'Coming in Phase N' tooltip from
 * BLOCK_REGISTRY.
 *
 * On click of an enabled row: useAddBlock.mutate at position = thanksIndex
 * (i.e., insert before the pinned thanks block). Catalog closes on success.
 */

import { toast } from 'sonner';
import { Drawer, DrawerHeader } from '@/components/ui/drawer';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { BLOCK_CATEGORIES, BLOCK_REGISTRY, type BlockCategory } from '@/lib/blocks/registry';
import type { BlockType } from '@/lib/blocks/types';
import {
  AGREEMENT_DEFAULT,
  CHOICE_DEFAULT,
  CONTEXT_DEFAULT,
  NPS_DEFAULT,
  OPEN_QUESTION_DEFAULT,
  PROTOTYPE_DEFAULT_PARTIAL,
  SCALE_DEFAULT,
} from '@/lib/blocks/defaults';
import { useAddBlock } from '@/lib/queries/blocks';
import { useBuilderStore } from '@/lib/stores/builder';
import { useUiStore } from '@/lib/stores/ui';
import { cn } from '@/lib/utils';

const CATEGORY_LABELS: Record<BlockCategory, string> = {
  survey: 'Survey',
  prototype: 'Prototype',
  usability: 'Usability',
  ia: 'Information architecture',
};

// welcome + thanks are auto-added and never shown in the catalog.
const HIDDEN_TYPES: BlockType[] = ['welcome', 'thanks'];

export interface BlockCatalogPanelProps {
  studyId: string;
  workspaceId: string;
}

export function BlockCatalogPanel({ studyId, workspaceId }: BlockCatalogPanelProps) {
  const open = useUiStore((s) => s.catalogPanelOpen);
  const setOpen = useUiStore((s) => s.setCatalogPanelOpen);
  const forcedPosition = useUiStore((s) => s.catalogInsertPosition);
  const blocks = useBuilderStore((s) => s.blocks);
  const addMutation = useAddBlock(studyId, workspaceId);

  // Insert position resolution:
  //   1. If an inline `+` between blocks set `catalogInsertPosition`, honour
  //      that exact slot (clamped to [1, thanksIdx] so welcome stays first
  //      and thanks stays last).
  //   2. Otherwise default to "before thanks" — the historical behaviour of
  //      the bottom `+ Добавить блок` button.
  const thanksIdx = blocks.findIndex((b) => b.type === 'thanks');
  const defaultPosition = thanksIdx >= 0 ? thanksIdx : blocks.length;
  const insertPosition = (() => {
    if (forcedPosition === null) return defaultPosition;
    const minAllowed = 1; // never insert before welcome (position 0)
    const maxAllowed = defaultPosition; // never insert at/after thanks
    return Math.min(Math.max(forcedPosition, minAllowed), maxAllowed);
  })();

  const handleAdd = (type: BlockType) => {
    if (addMutation.isPending) {
      // [02.1-03] D-03 — double-click guard. The CatalogRow's disabled prop
      // already prevents most double-clicks, but a fast double-tap on touch
      // devices or a focused-row Enter-Enter sequence can still fire two
      // handleAdd calls before React commits the disabled state. The
      // mutation seam is the authoritative gate.
      return;
    }
    let payload: Parameters<typeof addMutation.mutate>[0] | null = null;
    if (type === 'open_question') {
      payload = { position: insertPosition, type: 'open_question', content: OPEN_QUESTION_DEFAULT };
    } else if (type === 'prototype') {
      // PROTOTYPE_DEFAULT_PARTIAL omits prototype_version_id and starting_frame_id
      // by design — the PrototypeEditor's Figma import flow stamps them once the
      // first import completes. Cast bypasses the TS exhaustiveness check at the
      // catalog seam; the server-side INSERT still passes `prototypeContentSchema`
      // validation once those fields are populated.
      payload = {
        position: insertPosition,
        type: 'prototype',
        content: PROTOTYPE_DEFAULT_PARTIAL as Parameters<typeof addMutation.mutate>[0]['content'],
      };
    } else if (type === 'choice') {
      payload = { position: insertPosition, type: 'choice', content: CHOICE_DEFAULT };
    } else if (type === 'scale') {
      payload = { position: insertPosition, type: 'scale', content: SCALE_DEFAULT };
    } else if (type === 'nps') {
      payload = { position: insertPosition, type: 'nps', content: NPS_DEFAULT };
    } else if (type === 'agreement') {
      payload = { position: insertPosition, type: 'agreement', content: AGREEMENT_DEFAULT };
    } else if (type === 'context') {
      payload = { position: insertPosition, type: 'context', content: CONTEXT_DEFAULT };
    }
    if (!payload) return;

    addMutation.mutate(payload, {
      onSuccess: () => setOpen(false),
      onError: (err: unknown) => {
        const message = err instanceof Error ? err.message : 'Try again in a moment.';
        toast.error("Couldn't add the block", { description: message });
      },
    });
  };

  return (
    <Drawer open={open} onOpenChange={setOpen} side="right" ariaLabel="Add block" maxWidth={420}>
      <DrawerHeader title="Add block" onClose={() => setOpen(false)} />
      {/* flex-1 + min-h-0 — classic Flexbox+overflow combo so the ScrollArea
          fills the remaining drawer height and scrolls long category lists
          instead of pushing the drawer past its 100dvh boundary. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <ScrollArea className="h-full">
          <div className="flex flex-col gap-6 px-4 py-6">
            {BLOCK_CATEGORIES.map((category) => {
              const rows = (Object.keys(BLOCK_REGISTRY) as BlockType[])
                .filter((type) => !HIDDEN_TYPES.includes(type))
                .filter((type) => BLOCK_REGISTRY[type].category === category.id);
              if (rows.length === 0) return null;
              return (
                <section key={category.id} aria-labelledby={`catalog-${category.id}`}>
                  <h3
                    id={`catalog-${category.id}`}
                    className="mb-2 text-caption font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    {CATEGORY_LABELS[category.id]}
                  </h3>
                  <ul className="flex flex-col gap-1">
                    {rows.map((type) => (
                      <CatalogRow
                        key={type}
                        type={type}
                        onAdd={handleAdd}
                        isPending={
                          addMutation.isPending &&
                          (type === 'open_question' ||
                            type === 'prototype' ||
                            type === 'choice' ||
                            type === 'scale' ||
                            type === 'nps' ||
                            type === 'agreement' ||
                            type === 'context')
                        }
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </Drawer>
  );
}

interface CatalogRowProps {
  type: BlockType;
  onAdd: (type: BlockType) => void;
  isPending: boolean;
}

function CatalogRow({ type, onAdd, isPending }: CatalogRowProps) {
  const entry = BLOCK_REGISTRY[type];
  const Icon = entry.icon;
  // A row is enabled when its registry entry no longer carries a
  // `disabledTooltip` — Plans 02-05 / 04-01 strip the tooltip the moment
  // a block becomes runnable. The previous `enabledInPhase === 1` check
  // froze the catalog at Phase 1 and silently hid every later block.
  const enabled = entry.disabledTooltip === undefined;

  const row = (
    <button
      type="button"
      disabled={!enabled || isPending}
      onClick={() => onAdd(type)}
      className={cn(
        'flex min-h-touch w-full items-start gap-3 rounded-md p-3 text-left transition-colors duration-100',
        enabled ? 'hover:bg-slate-100 focus-visible:bg-slate-100' : 'cursor-not-allowed opacity-50',
      )}
      aria-disabled={!enabled}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-5 text-foreground" />
      <div className="flex-1">
        <div className="text-body font-medium text-foreground">
          {entry.label}
          {isPending && <span className="ml-2 text-caption text-muted-foreground">Adding…</span>}
        </div>
        <div className="text-small text-muted-foreground">{entry.description}</div>
      </div>
    </button>
  );

  if (!enabled && entry.disabledTooltip) {
    return (
      <li>
        <Tooltip>
          <TooltipTrigger asChild>{row}</TooltipTrigger>
          <TooltipContent side="left">{entry.disabledTooltip}</TooltipContent>
        </Tooltip>
      </li>
    );
  }

  return <li>{row}</li>;
}
