/**
 * <GoalScreenDrawer /> — frame picker for the "Goal screens" field of the
 * prototype block.
 *
 * Source: design-system handoff `js/maxitest-goalscreen.jsx` <GoalScreenDrawer />
 * + ADDENDUM-v3 §2 "Goal screen drawer".
 *
 * Layout (top→bottom inside <Drawer side="right" maxWidth={1040}>):
 *   1. <DrawerHeader title="Выберите экран цели" meta="3 / 12 · screen" />
 *   2. Frame stage (flex-1):
 *      - centered frame PNG (signed URL from prototype-renders bucket), fit
 *        per `fitMode` ('width' | 'both')
 *      - prev/next 40×40 round nav buttons absolutely positioned at edges
 *      - bottom-right segmented "По ширине / По ширине и высоте"
 *   3. <DrawerFooter>:
 *      - left: commit CTA — flips between
 *          "Выбрать этот экран в качестве экрана цели" (add) /
 *          "Убрать из экранов цели" (remove, warn color) depending on whether
 *          the current frame is already in goalIds
 *      - right: 12-thumb strip with the current frame ring + green pip on
 *        already-goal frames
 *
 * Wires to real data:
 *   - `useFrames(prototypeVersionId)` — list of all imported frames
 *   - `goalIds: string[]` — passed in from caller (the prototype block's
 *     `finish_frame_ids`)
 *   - `onCommit(frameId, action)` — caller toggles the frame in the array
 *     and calls onClose
 *
 * Keyboard:
 *   - ← / → cycle frames (when focus is inside the drawer)
 *   - Esc closes (Radix Dialog default)
 *   - Clicking a thumbnail jumps to that frame
 *
 * Fit mode is a viewer preference, stored in localStorage `goal_drawer_fit`
 * per handoff §"Interactions". Does NOT persist on the block.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { Drawer, DrawerFooter, DrawerHeader } from '@/components/ui/drawer';
import { useFrames, type Frame } from '@/lib/queries/prototypes';
import { supabase } from '@/lib/supabase/auth';

const STORAGE_BUCKET = 'prototype-renders';
const SIGNED_URL_TTL_SECONDS = 86_400;
const FIT_PREF_KEY = 'goal_drawer_fit';

type FitMode = 'width' | 'both';

export interface GoalScreenDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prototypeVersionId: string | undefined;
  /** Currently-committed goal frame ids on the block (`finish_frame_ids`). */
  goalIds: string[];
  /**
   * Toggle commitment for a single frame. `add`/`remove` is decided by the
   * caller (we tell which it is so the caller can also patch local state
   * before any debounced server write).
   */
  onCommit: (frameId: string, action: 'add' | 'remove') => void;
  /**
   * Optional initial frame index to anchor the drawer on open. Defaults to 0
   * (first frame) but the caller can pass the index of the starting frame so
   * the designer doesn't have to flip there manually.
   */
  initialFrameIndex?: number;
}

export function GoalScreenDrawer({
  open,
  onOpenChange,
  prototypeVersionId,
  goalIds,
  onCommit,
  initialFrameIndex = 0,
}: GoalScreenDrawerProps) {
  const framesQuery = useFrames(prototypeVersionId);
  const frames: Frame[] = useMemo(() => framesQuery.data ?? [], [framesQuery.data]);

  const [currentIndex, setCurrentIndex] = useState(initialFrameIndex);
  const [fitMode, setFitMode] = useState<FitMode>(() => readFitPref());
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  // Reset to initial frame each time the drawer opens.
  useEffect(() => {
    if (open) {
      setCurrentIndex(Math.min(initialFrameIndex, Math.max(frames.length - 1, 0)));
    }
  }, [open, initialFrameIndex, frames.length]);

  // Persist fit preference to localStorage.
  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(FIT_PREF_KEY, fitMode);
  }, [fitMode]);

  // Batch a single createSignedUrls call per drawer open + frames-arrived.
  useEffect(() => {
    if (!open || frames.length === 0) return;
    let cancelled = false;
    const paths = frames.map((f) => f.render_path_1x).filter(Boolean) as string[];
    if (paths.length === 0) return;
    void (async () => {
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
      if (cancelled || error || !data) return;
      const map: Record<string, string> = {};
      data.forEach((row) => {
        if (row.path && row.signedUrl) map[row.path] = row.signedUrl;
      });
      setSignedUrls(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, frames]);

  // ← / → keyboard navigation.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentIndex((i) => Math.min(frames.length - 1, i + 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, frames.length]);

  const currentFrame = frames[currentIndex];
  const isGoal = currentFrame ? goalIds.includes(currentFrame.frame_id) : false;
  const currentSignedUrl = currentFrame?.render_path_1x
    ? signedUrls[currentFrame.render_path_1x]
    : undefined;

  const handleCommit = useCallback(() => {
    if (!currentFrame) return;
    onCommit(currentFrame.frame_id, isGoal ? 'remove' : 'add');
    onOpenChange(false);
  }, [currentFrame, isGoal, onCommit, onOpenChange]);

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      side="right"
      ariaLabel="Выбор экрана цели"
      maxWidth={1040}
    >
      <DrawerHeader
        title="Выберите экран цели"
        meta={
          frames.length > 0 ? (
            <>
              <span style={{ font: '500 12px var(--font-mono)' }}>
                {currentIndex + 1} / {frames.length}
              </span>
              <span style={{ opacity: 0.5 }}>·</span>
              <span>{currentFrame?.name ?? 'screen'}</span>
            </>
          ) : null
        }
        onClose={() => onOpenChange(false)}
      />

      {/* Stage */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          margin: '24px 32px',
          background: 'var(--paper-2)',
          border: '1px solid var(--paper-3)',
          borderRadius: 'var(--radius)',
          overflow: 'hidden',
        }}
      >
        {/* Frame canvas */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            padding: '32px 56px',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          {framesQuery.isLoading ? (
            <StagePlaceholder text="Загружаю фреймы…" />
          ) : !currentFrame ? (
            <StagePlaceholder text="Импортируй прототип, чтобы выбрать экран цели." />
          ) : currentSignedUrl ? (
            <img
              src={currentSignedUrl}
              alt={currentFrame.name ?? 'frame'}
              style={{
                background: '#FFFFFF',
                borderRadius: 4,
                border: '1px solid var(--paper-3)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
                maxWidth: '100%',
                maxHeight: '100%',
                width: fitMode === 'width' ? '100%' : 'auto',
                height: fitMode === 'both' ? '100%' : 'auto',
                objectFit: 'contain',
              }}
            />
          ) : (
            <StagePlaceholder text="Подписываю URL рендера…" />
          )}
        </div>

        {/* Prev nav */}
        {frames.length > 1 ? (
          <NavBtn
            position="left"
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            ariaLabel="Предыдущий фрейм"
          >
            <ChevronLeft size={18} strokeWidth={1.5} />
          </NavBtn>
        ) : null}
        {frames.length > 1 ? (
          <NavBtn
            position="right"
            disabled={currentIndex === frames.length - 1}
            onClick={() => setCurrentIndex((i) => Math.min(frames.length - 1, i + 1))}
            ariaLabel="Следующий фрейм"
          >
            <ChevronRight size={18} strokeWidth={1.5} />
          </NavBtn>
        ) : null}

        {/* Bottom-right fit toggle */}
        <FitToggle value={fitMode} onChange={setFitMode} />
      </div>

      <DrawerFooter>
        <CommitButton isGoal={isGoal} onClick={handleCommit} disabled={!currentFrame} />
        <ThumbStrip
          frames={frames}
          signedUrls={signedUrls}
          currentIndex={currentIndex}
          goalIds={goalIds}
          onPick={setCurrentIndex}
        />
      </DrawerFooter>
    </Drawer>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────

function StagePlaceholder({ text }: { text: string }) {
  return (
    <p
      style={{
        font: '400 14px/20px var(--font-sans)',
        color: 'var(--text-2)',
        margin: 0,
        textAlign: 'center',
        maxWidth: 320,
      }}
    >
      {text}
    </p>
  );
}

function NavBtn({
  position,
  children,
  onClick,
  disabled,
  ariaLabel,
}: {
  position: 'left' | 'right';
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      style={{
        position: 'absolute',
        top: '50%',
        transform: 'translateY(-50%)',
        [position]: 12,
        width: 40,
        height: 40,
        borderRadius: '50%',
        background: '#FFFFFF',
        border: '1px solid var(--paper-3)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        color: 'var(--text-1)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        display: 'grid',
        placeItems: 'center',
        transition: 'background 120ms cubic-bezier(.2,.7,.3,1)',
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = 'var(--bg-chip)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = '#FFFFFF';
      }}
    >
      {children}
    </button>
  );
}

function FitToggle({ value, onChange }: { value: FitMode; onChange: (v: FitMode) => void }) {
  return (
    <div
      style={{
        position: 'absolute',
        right: 24,
        bottom: 24,
        display: 'flex',
        gap: 2,
        padding: 3,
        background: '#FFFFFF',
        border: '1px solid var(--paper-3)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {(['width', 'both'] as FitMode[]).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          style={{
            height: 26,
            padding: '0 10px',
            background: value === mode ? 'var(--color-accent)' : 'transparent',
            color: value === mode ? '#FFFFFF' : 'var(--text-2)',
            border: 0,
            borderRadius: 'var(--radius-sm)',
            font: '500 12px var(--font-sans)',
            cursor: 'pointer',
            transition:
              'background 120ms cubic-bezier(.2,.7,.3,1), color 120ms cubic-bezier(.2,.7,.3,1)',
          }}
        >
          {mode === 'width' ? 'По ширине' : 'По ширине и высоте'}
        </button>
      ))}
    </div>
  );
}

function CommitButton({
  isGoal,
  onClick,
  disabled,
}: {
  isGoal: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 40,
        padding: '0 18px',
        background: isGoal ? 'var(--color-warning)' : 'var(--color-accent)',
        color: '#FFFFFF',
        border: 0,
        borderRadius: 'var(--radius)',
        font: '500 14px var(--font-sans)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        transition: 'filter 120ms cubic-bezier(.2,.7,.3,1)',
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.filter = 'brightness(1.05)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.filter = 'none';
      }}
    >
      {isGoal ? (
        <>
          <Trash2 size={14} strokeWidth={1.5} />
          <span>Убрать из экранов цели</span>
        </>
      ) : (
        <>
          <Check size={14} strokeWidth={2} />
          <span>Выбрать этот экран в качестве экрана цели</span>
        </>
      )}
    </button>
  );
}

function ThumbStrip({
  frames,
  signedUrls,
  currentIndex,
  goalIds,
  onPick,
}: {
  frames: Frame[];
  signedUrls: Record<string, string>;
  currentIndex: number;
  goalIds: string[];
  onPick: (i: number) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Все фреймы прототипа"
      style={{
        display: 'flex',
        gap: 6,
        overflowX: 'auto',
        maxWidth: 480,
        padding: '2px 4px',
      }}
    >
      {frames.map((f, i) => {
        const active = i === currentIndex;
        const isGoal = goalIds.includes(f.frame_id);
        const url = f.render_path_1x ? signedUrls[f.render_path_1x] : undefined;
        return (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={`Фрейм ${i + 1}: ${f.name ?? 'без названия'}`}
            onClick={() => onPick(i)}
            style={{
              position: 'relative',
              width: 36,
              height: 28,
              padding: 0,
              flexShrink: 0,
              borderRadius: 4,
              border: active ? '2px solid var(--color-accent)' : '1px solid var(--paper-3)',
              background: '#FFFFFF',
              backgroundImage: url ? `url(${url})` : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'top center',
              boxShadow: active
                ? '0 0 0 2px color-mix(in oklab, var(--color-accent) 30%, transparent)'
                : 'none',
              cursor: 'pointer',
              transition: 'border-color 120ms cubic-bezier(.2,.7,.3,1)',
            }}
          >
            {/* Placeholder mock background when no signed URL yet */}
            {!url ? (
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'linear-gradient(180deg, var(--paper-2) 0 30%, var(--bg-card) 30% 100%)',
                  borderRadius: 2,
                }}
              />
            ) : null}
            {isGoal ? (
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: 'var(--color-success)',
                  color: '#FFFFFF',
                  display: 'grid',
                  placeItems: 'center',
                  border: '1.5px solid var(--bg-page)',
                }}
              >
                <Check size={8} strokeWidth={3} />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

function readFitPref(): FitMode {
  if (typeof localStorage === 'undefined') return 'width';
  const v = localStorage.getItem(FIT_PREF_KEY);
  return v === 'both' ? 'both' : 'width';
}
