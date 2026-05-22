/**
 * Visual mapping from block types → handoff chip categories.
 *
 * Source: handoff `js/shared.jsx` BLOCK_META + maxitest-builder.jsx usage.
 * Four visual categories (info / choice / scale / proto) that group block
 * types by chip color. Colors are **deliberately not skinned by accent** —
 * they're a system signal, not brand — per handoff README §"Updates since v1".
 */

import {
  Hand,
  Heart,
  MessageSquare,
  Smartphone,
  ListChecks,
  BarChart3,
  Activity,
  FileCheck,
  User,
  TableProperties,
  ListOrdered,
  ScrollText,
  Timer,
  Target,
  Vote,
  Network,
  Info as InfoIcon,
  CheckSquare,
  Frame,
  type LucideIcon,
} from 'lucide-react';
import type { BlockType } from './types';

export type BlockVisualCategory = 'info' | 'choice' | 'scale' | 'proto';

export interface BlockVisual {
  category: BlockVisualCategory;
  /** Chip background color (handoff BLOCK_META). */
  chipBg: string;
  /** Chip icon color. */
  chipFg: string;
  /** Lucide icon for the chip. */
  icon: LucideIcon;
  /** Generic Lucide icon for the visual category (used in chip-strip list). */
  categoryIcon: LucideIcon;
}

const CATEGORY_COLORS: Record<BlockVisualCategory, { bg: string; fg: string }> = {
  info: { bg: 'var(--paper-2)', fg: 'var(--ink-2)' },
  choice: { bg: '#FED7AA', fg: '#C2410C' },
  scale: { bg: '#FED7AA', fg: '#C2410C' },
  proto: { bg: 'var(--paper-1)', fg: '#1F2328' },
};

const CATEGORY_GENERIC_ICON: Record<BlockVisualCategory, LucideIcon> = {
  info: InfoIcon,
  choice: CheckSquare,
  scale: BarChart3,
  proto: Frame,
};

/**
 * Per-block-type mapping. The chip ICON uses the lucide name that best
 * represents the block's role (Hand for welcome, Heart for thanks, etc.);
 * the chip COLORS come from the visual category.
 */
const PER_TYPE: Record<BlockType, { category: BlockVisualCategory; icon: LucideIcon }> = {
  welcome: { category: 'info', icon: Hand },
  open_question: { category: 'info', icon: MessageSquare },
  thanks: { category: 'info', icon: Heart },
  prototype: { category: 'proto', icon: Smartphone },
  choice: { category: 'choice', icon: ListChecks },
  scale: { category: 'scale', icon: BarChart3 },
  nps: { category: 'scale', icon: Activity },
  agreement: { category: 'choice', icon: FileCheck },
  context: { category: 'info', icon: User },
  matrix: { category: 'choice', icon: TableProperties },
  ranking: { category: 'choice', icon: ListOrdered },
  umux_lite: { category: 'scale', icon: ScrollText },
  seq: { category: 'scale', icon: BarChart3 },
  nasa_tlx: { category: 'scale', icon: Activity },
  five_second: { category: 'proto', icon: Timer },
  first_click: { category: 'proto', icon: Target },
  preference: { category: 'proto', icon: Vote },
  card_sort: { category: 'proto', icon: TableProperties },
  tree_test: { category: 'proto', icon: Network },
};

export function blockVisualOf(type: BlockType): BlockVisual {
  const meta = PER_TYPE[type];
  const colors = CATEGORY_COLORS[meta.category];
  return {
    category: meta.category,
    chipBg: colors.bg,
    chipFg: colors.fg,
    icon: meta.icon,
    categoryIcon: CATEGORY_GENERIC_ICON[meta.category],
  };
}
