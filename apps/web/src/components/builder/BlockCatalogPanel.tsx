/**
 * <BlockCatalogPanel> — Plan 01-03 Task 8 / UI-SPEC.md §"<BlockCatalogPanel>".
 *
 * shadcn <Sheet side="right" w-[360px]> with 4 grouped sections:
 *   Survey · Prototype · Usability · Information architecture
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  BLOCK_CATEGORIES,
  BLOCK_REGISTRY,
  type BlockCategory,
} from '@/lib/blocks/registry';
import type { BlockType } from '@/lib/blocks/types';
import { OPEN_QUESTION_DEFAULT } from '@/lib/blocks/defaults';
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

export function BlockCatalogPanel({
  studyId,
  workspaceId,
}: BlockCatalogPanelProps) {
  const open = useUiStore((s) => s.catalogPanelOpen);
  const setOpen = useUiStore((s) => s.setCatalogPanelOpen);
  const blocks = useBuilderStore((s) => s.blocks);
  const addMutation = useAddBlock(studyId, workspaceId);

  // Insert position = before thanks. thanks is always the last block.
  const thanksIdx = blocks.findIndex((b) => b.type === 'thanks');
  const insertPosition = thanksIdx >= 0 ? thanksIdx : blocks.length;

  const handleAdd = (type: BlockType) => {
    if (type !== 'open_question') return; // Defensive — disabled rows can't trigger.

    addMutation.mutate(
      {
        position: insertPosition,
        type: 'open_question',
        content: OPEN_QUESTION_DEFAULT,
      },
      {
        onSuccess: () => {
          setOpen(false);
        },
        onError: (err: unknown) => {
          const message =
            err instanceof Error ? err.message : 'Try again in a moment.';
          toast.error("Couldn't add the block", { description: message });
        },
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        className="w-[360px] max-w-[90vw] border-l border-border bg-surface p-0 sm:max-w-[360px]"
      >
        <SheetHeader className="h-14 border-b border-border px-6 py-0">
          <SheetTitle className="flex h-14 items-center text-h2 font-semibold">
            Add block
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-56px)]">
          <div className="flex flex-col gap-6 px-4 py-6">
            {BLOCK_CATEGORIES.map((category) => {
              const rows = (Object.keys(BLOCK_REGISTRY) as BlockType[])
                .filter((type) => !HIDDEN_TYPES.includes(type))
                .filter((type) => BLOCK_REGISTRY[type].category === category.id);
              if (rows.length === 0) return null;
              return (
                <section
                  key={category.id}
                  aria-labelledby={`catalog-${category.id}`}
                >
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
                          type === 'open_question'
                        }
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
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
  const enabled = entry.enabledInPhase === 1;

  const row = (
    <button
      type="button"
      disabled={!enabled || isPending}
      onClick={() => onAdd(type)}
      className={cn(
        'flex min-h-touch w-full items-start gap-3 rounded-md p-3 text-left transition-colors duration-100',
        enabled
          ? 'hover:bg-slate-100 focus-visible:bg-slate-100'
          : 'cursor-not-allowed opacity-50',
      )}
      aria-disabled={!enabled}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-5 text-foreground" />
      <div className="flex-1">
        <div className="text-body font-medium text-foreground">
          {entry.label}
          {isPending && (
            <span className="ml-2 text-caption text-muted-foreground">
              Adding…
            </span>
          )}
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
