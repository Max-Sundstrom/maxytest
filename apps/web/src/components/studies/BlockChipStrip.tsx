/**
 * <BlockChipStrip /> — 4px-gap row of 20×20 block-type chips.
 *
 * Source: handoff `js/maxitest-list.jsx` <TestRow /> .mx-trow-strip block
 * (index.html lines 395-397).
 *
 * Block colors are deliberately NOT skinned by accent — choice/scale stay
 * peach `#FED7AA` bg / burnt-orange `#C2410C` icon across all skins so the
 * iconography reads as a system signal, not brand. Info uses paper-2 + ink-2,
 * proto uses paper-1 + near-black. Per handoff `js/shared.jsx` BLOCK_META.
 *
 * Placeholder data: see {@link placeholderBlockTypesFor}. When Plan 02.3
 * polish ships the `block_types` aggregate on studies queries, drop the
 * helper and pass real types in.
 */

import { Info, CheckSquare, BarChart3, Frame } from 'lucide-react';
import type { StudyRow } from '@/lib/queries/studies';

export type BlockChipType = 'info' | 'choice' | 'scale' | 'proto';

interface BlockChipMeta {
  bg: string;
  color: string;
  Icon: typeof Info;
}

const META: Record<BlockChipType, BlockChipMeta> = {
  info: { bg: 'var(--paper-2)', color: 'var(--ink-2)', Icon: Info },
  choice: { bg: '#FED7AA', color: '#C2410C', Icon: CheckSquare },
  scale: { bg: '#FED7AA', color: '#C2410C', Icon: BarChart3 },
  proto: { bg: 'var(--paper-1)', color: '#1F2328', Icon: Frame },
};

export interface BlockChipStripProps {
  types: BlockChipType[];
}

export function BlockChipStrip({ types }: BlockChipStripProps) {
  return (
    <span style={{ display: 'flex', gap: 4 }} aria-label={`${types.length} блоков`}>
      {types.map((t, i) => {
        const m = META[t];
        return (
          <span
            key={i}
            aria-hidden="true"
            style={{
              width: 20,
              height: 20,
              borderRadius: 'var(--radius-sm)',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
              background: m.bg,
              color: m.color,
            }}
          >
            <m.Icon size={11} strokeWidth={1.5} />
          </span>
        );
      })}
    </span>
  );
}

/**
 * Placeholder strip until `studies` query exposes per-row block_types.
 *
 * Phase 1's `create_study` RPC seeds welcome (info) + open_question (info) +
 * thanks (info), so a fresh study is effectively all-info. Once the designer
 * publishes, we assume at least one scale/choice/proto block was added —
 * extend the strip accordingly so it reads as more than a wall of info chips.
 */
export function placeholderBlockTypesFor(study: StudyRow): BlockChipType[] {
  if (study.status === 'draft') return ['info', 'info', 'info'];
  if (study.status === 'archived') return ['info', 'choice', 'info'];
  return ['info', 'choice', 'proto', 'scale', 'info'];
}
