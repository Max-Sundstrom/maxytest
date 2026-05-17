/**
 * <GoalScreensField /> — "Goal screens" form field inside the prototype block.
 *
 * Source: design-system handoff `js/maxitest-goalscreen.jsx` <GoalScreenBefore />
 * + ADDENDUM-v3 §2.01 "Drawer entry".
 *
 * Two affordances both open the same <GoalScreenDrawer />:
 *   - Dashed "+" button with a *pulsing* accent ring (`gs-add-hl`). Pulse is a
 *     box-shadow keyframe fading 30% accent → transparent every 1.8s.
 *   - A CTA-pill below the goals row carrying the previously-decorative hint.
 *     Background `color-mix(--color-accent 10% --bg-page)`, 1px accent-30%
 *     border, a small pulse dot left, the hint text, and a right chevron.
 *     Hover steps the bg mix up to 16%.
 *
 * The goals row shows mini-thumbnails (24×32) of every committed goal frame
 * with the frame name underneath, plus a trash overlay on hover that removes
 * the frame from `finish_frame_ids`.
 *
 * `signedUrls` is the same shared map PrototypeEditor maintains for the
 * thumbnail grid — passed down so we don't fire a second
 * createSignedUrls roundtrip just for the goal-screens row.
 */

import { useState } from 'react';
import { ArrowRight, Plus, X } from 'lucide-react';
import { GoalScreenDrawer } from './GoalScreenDrawer';
import type { Frame } from '@/lib/queries/prototypes';

export interface GoalScreensFieldProps {
  prototypeVersionId: string | undefined;
  frames: Frame[];
  /** Currently-committed goal frame ids (block.content.finish_frame_ids). */
  goalIds: string[];
  /** Replace the entire `finish_frame_ids` array — caller propagates to RHF. */
  onGoalsChange: (next: string[]) => void;
  /** Signed thumbnail URLs keyed by storage path (PrototypeEditor's batch). */
  signedUrls: Record<string, string>;
  disabled?: boolean;
}

export function GoalScreensField({
  prototypeVersionId,
  frames,
  goalIds,
  onGoalsChange,
  signedUrls,
  disabled,
}: GoalScreensFieldProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const goalFrames = goalIds
    .map((id) => frames.find((f) => f.frame_id === id))
    .filter((f): f is Frame => !!f);

  const handleCommit = (frameId: string, action: 'add' | 'remove') => {
    if (action === 'remove') {
      onGoalsChange(goalIds.filter((id) => id !== frameId));
    } else if (!goalIds.includes(frameId)) {
      onGoalsChange([...goalIds, frameId]);
    }
  };

  const handleRemove = (frameId: string) => {
    onGoalsChange(goalIds.filter((id) => id !== frameId));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label
        style={{
          font: '400 12.5px/16px var(--font-sans)',
          color: 'var(--text-2)',
          letterSpacing: '0.01em',
        }}
      >
        Экраны цели
      </label>

      {/* Goals row: committed frames + dashed plus */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
        {goalFrames.map((f, i) => {
          const url = f.render_path_1x ? signedUrls[f.render_path_1x] : undefined;
          return (
            <GoalChip
              key={f.frame_id}
              index={i + 1}
              name={f.name ?? `Frame ${i + 1}`}
              url={url}
              onRemove={() => handleRemove(f.frame_id)}
              disabled={disabled}
            />
          );
        })}

        <PulsingAddButton
          onClick={() => setDrawerOpen(true)}
          disabled={disabled || !prototypeVersionId}
        />
      </div>

      <HintCTA onClick={() => setDrawerOpen(true)} disabled={disabled || !prototypeVersionId} />

      <GoalScreenDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        prototypeVersionId={prototypeVersionId}
        goalIds={goalIds}
        onCommit={handleCommit}
      />

      {/* Pulse keyframes for the affordance + dot. Scoped inline so we avoid
          a global stylesheet edit for one component. */}
      <style>{`
        @keyframes goal-pulse-ring {
          0%   { box-shadow: 0 0 0 0 color-mix(in oklab, var(--color-accent) 30%, transparent); }
          70%  { box-shadow: 0 0 0 8px color-mix(in oklab, var(--color-accent) 0%, transparent); }
          100% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--color-accent) 0%, transparent); }
        }
        @keyframes goal-pulse-dot {
          0%, 100% { transform: scale(1);   opacity: 1; }
          50%      { transform: scale(1.6); opacity: 0.5; }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes goal-pulse-ring { from, to { box-shadow: none; } }
          @keyframes goal-pulse-dot  { from, to { transform: scale(1); opacity: 1; } }
        }
      `}</style>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────

function GoalChip({
  index,
  name,
  url,
  onRemove,
  disabled,
}: {
  index: number;
  name: string;
  url: string | undefined;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 6,
        width: 96,
      }}
    >
      <div
        style={{
          width: 96,
          height: 80,
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-1)',
          background: url ? '#FFFFFF' : 'var(--paper-2)',
          backgroundImage: url ? `url(${url})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'top center',
          overflow: 'hidden',
        }}
      />
      {!disabled && hovered ? (
        <button
          type="button"
          aria-label={`Убрать ${name} из экранов цели`}
          onClick={onRemove}
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.6)',
            color: '#FFFFFF',
            border: 0,
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
          }}
        >
          <X size={12} strokeWidth={2} />
        </button>
      ) : null}
      <div
        style={{
          font: '400 12px/16px var(--font-sans)',
          color: 'var(--text-1)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          width: '100%',
        }}
      >
        {index}. {name}
      </div>
    </div>
  );
}

function PulsingAddButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Добавить экран цели"
      style={{
        width: 96,
        height: 80,
        background: 'transparent',
        border: '1.5px dashed var(--color-accent)',
        borderRadius: 'var(--radius-sm)',
        color: 'var(--color-accent)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        display: 'grid',
        placeItems: 'center',
        animation: disabled ? undefined : 'goal-pulse-ring 1.8s ease-out infinite',
        transition: 'border-color 120ms cubic-bezier(.2,.7,.3,1)',
      }}
    >
      <Plus size={18} strokeWidth={2} />
    </button>
  );
}

function HintCTA({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        marginTop: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '10px 14px',
        background: hovered
          ? 'color-mix(in oklab, var(--color-accent) 16%, var(--bg-page))'
          : 'color-mix(in oklab, var(--color-accent) 10%, var(--bg-page))',
        border: '1px solid color-mix(in oklab, var(--color-accent) 30%, transparent)',
        borderRadius: 'var(--radius)',
        font: '400 12.5px/18px var(--font-sans)',
        color: 'var(--text-1)',
        textAlign: 'left',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 120ms cubic-bezier(.2,.7,.3,1)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: 'var(--color-accent)',
          flexShrink: 0,
          animation: disabled ? undefined : 'goal-pulse-dot 1.6s ease-in-out infinite',
        }}
      />
      <span style={{ flex: 1 }}>
        Когда респондент достигает одного из этих экранов в вашем прототипе, задание считается
        успешно выполненным
      </span>
      <ArrowRight
        size={13}
        strokeWidth={1.5}
        aria-hidden="true"
        style={{ color: 'var(--color-accent)', flexShrink: 0 }}
      />
    </button>
  );
}
