/**
 * <ReportSidebar /> — 288px filter sidebar for the report screen.
 *
 * Source: design-system handoff `js/maxitest-report.jsx` <ReportSidebar /> +
 * index.html `.mx-rside*` rules.
 *
 * Layout (top→bottom, 24/20 padding, 20px gap between groups):
 *   1. Дата — label + 32px select-input "Всё время ▾"
 *   2. Источник респондентов — label + 32px check-rows (Link / Pathway Panel)
 *   3. Тип — label + 32px check-rows (Completed / Incomplete)
 *   4. "Фильтры" — inline icon button (text)
 *   5. Pill segmented tabs (Сводный отчёт / Ответы N)
 *   6. Block-jump list — one row per content block; active block highlighted
 *      with accent border + soft shadow
 *
 * All filter controls are display-only in this commit. Real filtering wiring
 * is Phase 3 territory (REPORT-04 / ANALYTICS-04). The check-rows reflect
 * counts from the response/session totals passed in as props.
 */

import { Check, Settings, Share2 } from 'lucide-react';
import type { Block } from '@/lib/blocks/types';
import { blockVisualOf } from '@/lib/blocks/visual';

export interface ReportSidebarProps {
  blocks: Block[];
  /** Currently-focused block id (highlights its row). */
  activeBlockId: string | null;
  /** Switch focus to a different block by clicking its row. */
  onSelectBlock: (blockId: string) => void;
  completedCount: number;
  incompleteCount: number;
}

export function ReportSidebar({
  blocks,
  activeBlockId,
  onSelectBlock,
  completedCount,
  incompleteCount,
}: ReportSidebarProps) {
  const totalCount = completedCount + incompleteCount;

  // Hide pinned welcome from the block-jump list (it's not analytically
  // interesting and the handoff sidebar lists "blocks 1..N" without welcome).
  const reportableBlocks = blocks.filter((b) => b.type !== 'welcome');

  return (
    <aside
      style={{
        background: 'var(--bg-page)',
        borderRight: '1px solid var(--border-2)',
        padding: '24px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        overflow: 'auto',
        minHeight: 0,
      }}
    >
      <Group label="Дата">
        <SelectInput>Всё время</SelectInput>
      </Group>

      <Group label="Источник респондентов">
        <CheckRow
          checked
          icon={<Share2 size={12} strokeWidth={1.5} />}
          label="Ссылка"
          n={totalCount}
        />
        <CheckRow checked icon={<span style={dotStyle} />} label="Панель Pathway" n={0} muted />
      </Group>

      <Group label="Тип">
        <CheckRow checked label="Завершённые" n={completedCount} />
        <CheckRow label="Неполные" n={incompleteCount} />
      </Group>

      <button
        type="button"
        style={{
          alignSelf: 'flex-start',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          background: 'transparent',
          border: 0,
          borderRadius: 'var(--radius)',
          color: 'var(--text-2)',
          font: '500 13px var(--font-sans)',
          cursor: 'pointer',
          transition: 'background 120ms cubic-bezier(.2,.7,.3,1)',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-chip)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <Settings size={13} strokeWidth={1.5} />
        <span>Фильтры</span>
      </button>

      <div
        style={{
          display: 'flex',
          gap: 2,
          padding: 3,
          background: 'var(--bg-chip)',
          borderRadius: 'var(--radius)',
        }}
      >
        <PillTab active>Сводный отчёт</PillTab>
        <PillTab>Ответы {completedCount}</PillTab>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {reportableBlocks.map((block, i) => {
          const visual = blockVisualOf(block.type);
          const ChipIcon = visual.icon;
          const active = block.id === activeBlockId;
          const blockTitle =
            (block.content as { title?: string; question?: string }).title?.toString().trim() ||
            (block.content as { title?: string; question?: string }).question?.toString().trim() ||
            'Без названия';

          return (
            <button
              key={block.id}
              type="button"
              onClick={() => onSelectBlock(block.id)}
              style={{
                width: '100%',
                height: 32,
                display: 'grid',
                gridTemplateColumns: '20px 1fr',
                gap: 8,
                alignItems: 'center',
                padding: '0 10px',
                background: active ? 'var(--bg-card)' : 'transparent',
                border: `1px solid ${active ? 'var(--color-accent)' : 'transparent'}`,
                borderRadius: 'var(--radius)',
                cursor: 'pointer',
                boxShadow: active ? 'var(--shadow-card)' : 'none',
                font: '400 13px/16px var(--font-sans)',
                color: 'var(--text-1)',
                textAlign: 'left',
                transition: 'background 120ms cubic-bezier(.2,.7,.3,1)',
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.background = 'var(--bg-card)';
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.background = 'transparent';
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 'var(--radius-sm)',
                  background: visual.chipBg,
                  color: visual.chipFg,
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}
              >
                <ChipIcon size={11} strokeWidth={1.5} />
              </span>
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ color: 'var(--text-3)', marginRight: 6 }}>{i + 1}.</span>
                {blockTitle}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span
        style={{
          font: '400 12.5px/16px var(--font-sans)',
          color: 'var(--text-2)',
          letterSpacing: '0.01em',
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

function SelectInput({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        height: 32,
        padding: '0 12px',
        background: 'var(--bg-input)',
        border: '1px solid var(--border-1)',
        borderRadius: 'var(--radius)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        font: '400 13.5px var(--font-sans)',
        color: 'var(--text-1)',
        cursor: 'pointer',
      }}
    >
      <span>{children}</span>
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>
  );
}

function CheckRow({
  checked,
  icon,
  label,
  n,
  muted,
}: {
  checked?: boolean;
  icon?: React.ReactNode;
  label: string;
  n: number;
  muted?: boolean;
}) {
  return (
    <div
      style={{
        height: 32,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 10px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-1)',
        borderRadius: 'var(--radius)',
        font: '400 13.5px var(--font-sans)',
        color: 'var(--text-1)',
        opacity: muted ? 0.7 : 1,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 18,
          height: 18,
          borderRadius: 'var(--radius-sm)',
          border: checked ? '0' : '1.5px solid var(--border-strong)',
          background: checked ? 'var(--color-accent)' : 'transparent',
          display: 'grid',
          placeItems: 'center',
          color: '#fff',
          flexShrink: 0,
        }}
      >
        {checked ? <Check size={11} strokeWidth={3} /> : null}
      </span>
      {icon ? <span style={{ color: 'var(--text-2)', flexShrink: 0 }}>{icon}</span> : null}
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <span
        style={{
          marginLeft: 'auto',
          color: 'var(--text-3)',
          font: '500 12px var(--font-mono)',
        }}
      >
        {n}
      </span>
    </div>
  );
}

function PillTab({ active, children }: { active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      style={{
        flex: 1,
        height: 26,
        padding: '0 10px',
        background: active ? 'var(--bg-card)' : 'transparent',
        border: 0,
        borderRadius: 'var(--radius-sm)',
        font: `${active ? 500 : 400} 12px var(--font-sans)`,
        color: active ? 'var(--text-1)' : 'var(--text-2)',
        cursor: 'pointer',
        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.02)' : 'none',
        transition: 'background 120ms cubic-bezier(.2,.7,.3,1)',
      }}
    >
      {children}
    </button>
  );
}

const dotStyle: React.CSSProperties = {
  width: 12,
  height: 12,
  borderRadius: '50%',
  background: 'var(--color-accent-3)',
  display: 'inline-block',
};
