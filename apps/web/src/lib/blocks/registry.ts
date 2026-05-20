/**
 * Block-type registry — Phase 1 Walking Skeleton (Plan 01-03 Task 1).
 *
 * Drives the catalog panel: every v1 block type has a label / icon / category
 * and an `enabledInPhase` flag. Phase 1 only enables `open_question`
 * (welcome / thanks are auto-added on study create and are NEVER rendered in
 * the catalog).
 *
 * Icon mapping locked in UI-SPEC.md §"Open Questions" 4. Tooltips locked in
 * UI-SPEC.md §"Block catalog disabled tooltip".
 */

import {
  Activity,
  BarChart3,
  FileCheck,
  Hand,
  Heart,
  ListChecks,
  ListOrdered,
  MessageSquare,
  Network,
  ScrollText,
  Smartphone,
  TableProperties,
  Timer,
  Target,
  User,
  Vote,
  type LucideIcon,
} from 'lucide-react';
import type { BlockType } from './types';

export type BlockCategory = 'survey' | 'prototype' | 'usability' | 'ia';

export interface BlockRegistryEntry {
  label: string;
  description: string;
  icon: LucideIcon;
  category: BlockCategory;
  /** Phase in which the block becomes runnable. Phase 1 = enabled now. */
  enabledInPhase: number;
  /**
   * Tooltip shown over a disabled catalog row.
   * `undefined` for `enabledInPhase === 1` rows (no disabled tooltip needed).
   */
  disabledTooltip?: string;
}

export const BLOCK_REGISTRY: Record<BlockType, BlockRegistryEntry> = {
  // -- Phase 1 (active) -----------------------------------------------------
  welcome: {
    label: 'Welcome',
    description: "Introduce the test and set the respondent's expectations.",
    icon: Hand,
    category: 'survey',
    enabledInPhase: 1,
  },
  open_question: {
    label: 'Open question',
    description: 'A free-form text answer with optional min/max length.',
    icon: MessageSquare,
    category: 'survey',
    enabledInPhase: 1,
  },
  thanks: {
    label: 'Thank you',
    description: 'Closing screen shown after the last block.',
    icon: Heart,
    category: 'survey',
    enabledInPhase: 1,
  },

  // -- Phase 4 (survey blocks v1 core) — active as of Plan 04-01 ------------
  choice: {
    label: 'Choice',
    description: 'Single or multiple-choice question.',
    icon: ListChecks,
    category: 'survey',
    enabledInPhase: 4,
    // disabledTooltip removed — Phase 4 active (Plan 04-01 Task 6)
  },
  scale: {
    label: 'Scale',
    description: 'Numeric scale (1–5 / 1–7 / 1–10).',
    icon: BarChart3,
    category: 'survey',
    enabledInPhase: 4,
    // disabledTooltip removed — Phase 4 active (Plan 04-01 Task 6)
  },
  nps: {
    label: 'NPS',
    description: 'Net Promoter Score 0–10 with promoter/detractor split.',
    icon: Activity,
    category: 'survey',
    enabledInPhase: 4,
    // disabledTooltip removed — Phase 4 active (Plan 04-01 Task 6)
  },
  agreement: {
    label: 'Agreement',
    description: '"I agree to…" checkbox before continuing.',
    icon: FileCheck,
    category: 'survey',
    enabledInPhase: 4,
    // disabledTooltip removed — Phase 4 active (Plan 04-01 Task 6)
  },
  context: {
    label: 'Context',
    description: 'Contextual questions about the respondent.',
    icon: User,
    category: 'survey',
    enabledInPhase: 4,
    // disabledTooltip removed — Phase 4 active (Plan 04-01 Task 6)
  },
  matrix: {
    label: 'Matrix',
    description: 'Grid of statements × rating columns.',
    icon: TableProperties,
    category: 'survey',
    enabledInPhase: 4,
    disabledTooltip: 'Coming in Phase 4',
  },
  ranking: {
    label: 'Ranking',
    description: 'Drag-to-rank list of options by preference.',
    icon: ListOrdered,
    category: 'survey',
    enabledInPhase: 4,
    disabledTooltip: 'Coming in Phase 4',
  },
  umux_lite: {
    label: 'UMUX-Lite',
    description: 'Standardised two-question usability score.',
    icon: ScrollText,
    category: 'survey',
    enabledInPhase: 4,
    disabledTooltip: 'Coming in Phase 4',
  },

  // -- Phase 2 (prototype) — active as of Plan 02-05 ------------------------
  prototype: {
    label: 'Figma prototype',
    description: 'Interactive Figma prototype with click tracking.',
    icon: Smartphone,
    category: 'prototype',
    enabledInPhase: 1,
    // disabledTooltip removed — Phase 2 active
  },

  // -- Phase 7 (specialized formats) ----------------------------------------
  five_second: {
    label: 'Five-second test',
    description: 'Show a screen for 5 seconds, then ask what they remember.',
    icon: Timer,
    category: 'usability',
    enabledInPhase: 7,
    disabledTooltip: 'Coming in Phase 7',
  },
  first_click: {
    label: 'First click',
    description: 'Where does the respondent click first to solve a task?',
    icon: Target,
    category: 'usability',
    enabledInPhase: 7,
    disabledTooltip: 'Coming in Phase 7',
  },
  preference: {
    label: 'Preference',
    description: 'Compare designs and pick a favourite.',
    icon: Vote,
    category: 'usability',
    enabledInPhase: 7,
    disabledTooltip: 'Coming in Phase 7',
  },
  card_sort: {
    label: 'Card sort',
    description: 'Open / closed card sorting with dendrogram analysis.',
    icon: TableProperties,
    category: 'ia',
    enabledInPhase: 7,
    disabledTooltip: 'Coming in Phase 7',
  },
  tree_test: {
    label: 'Tree test',
    description: 'Navigation tree testing with success-rate path.',
    icon: Network,
    category: 'ia',
    enabledInPhase: 7,
    disabledTooltip: 'Coming in Phase 7',
  },
};

/** Categories rendered in catalog panel, in display order. */
export const BLOCK_CATEGORIES: { id: BlockCategory; label: string }[] = [
  { id: 'survey', label: 'Survey' },
  { id: 'prototype', label: 'Prototype' },
  { id: 'usability', label: 'Usability' },
  { id: 'ia', label: 'Information architecture' },
];
