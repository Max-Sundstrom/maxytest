/**
 * `PlaybackPlayer` — RAF-driven per-respondent playback (Plan 03-06 Task 1).
 *
 * Closes the data-layer → user-visible gap for ANALYTICS-09 / ROADMAP SC5.
 * Composes the leaf components shipped in Plan 03-05:
 *   - `useSessionPlayback(sessionId, blockId)` — small per-session events query.
 *   - `playbackTimeline(events)` — pure-fn turning rows into a render-ready
 *     {totalMs, frameEnters, clicks} struct (D-62 wall-clock semantics).
 *   - `<ClickRingPulse>` — the green/red click overlay (D-63).
 *   - `transition-frame-dissolve` / `click-ring-pulse` keyframes from
 *     `tokens.css` (with `prefers-reduced-motion` overrides).
 *
 * Internal state:
 *   - `playheadMs` (default 0) — current playback position in ms.
 *   - `isPlaying` (default false) — RAF loop active when true.
 *   - `speed` (0.5 | 1 | 2, default 1) — multiplier on RAF delta (D-63).
 *   - `signedUrls` — { storage_path → signed URL } resolved at mount
 *     (Pitfall 6 — TTL 86 400 s; this component mounts on drawer-open and
 *     unmounts on drawer-close, so re-issue is per-open).
 *
 * RAF loop (Anti-pattern 5 — NEVER timer-based loops):
 *   - Each animation frame, `playheadMs += (now - lastTick) * speed`.
 *   - When `playheadMs >= totalMs` → setIsPlaying(false), clamp to totalMs.
 *   - `cancelAnimationFrame` on pause AND on unmount.
 *   - `lastTickRef = null` on pause so resume doesn't accumulate a giant delta.
 *
 * Scrubber (Pitfall 10 — pause-on-drag, automated grep gate enforces):
 *   - `<input type="range" min={0} max={totalMs} value={playheadMs}>`.
 *   - `onMouseDown={() => setIsPlaying(false)}` — load-bearing for no-jank.
 *   - Native browser throttling on `onChange` is ~60Hz; we accept that as
 *     the throttle window (16ms equivalent).
 *
 * Click overlay (D-63):
 *   - Active clicks = `timeline.clicks.filter(c => c.tsMs <= playheadMs &&
 *     c.frameId === currentFrame.frameId)`. Old-frame clicks don't bleed
 *     through after a transition. `<ClickRingPulse>` internally decides
 *     pulse-vs-footprint via `ageMs = playheadMs - startMs` so a single
 *     `.map()` over active clicks renders the full history correctly.
 *
 * Frame stage:
 *   - aspect-ratio derived from currentFrame.width / currentFrame.height.
 *   - `<img key={currentFrame.frameId}>` — the key forces a re-mount on
 *     frame change so the `transition-frame-dissolve` keyframe fires anew
 *     instead of being skipped by React's in-place src swap (mirrors the
 *     GoalScreenDrawer pattern at line 299).
 *
 * Accessibility (Russian copy, screen-reader parity):
 *   - aria-label on player root: «Воспроизведение сессии {id_8}».
 *   - aria-labels on Play/Pause, scrubber, speed pills.
 *   - Skeleton + empty states for loading / zero-events.
 *
 * Source: 03-RESEARCH.md §"Pattern 3: Playback player with
 * requestAnimationFrame" lines 668-758 (canonical RAF skeleton); 03-RESEARCH.md
 * §"Pitfall 6 / 10" lines 1052-1138 (signed URL + scrubber); 03-PATTERNS.md §14
 * lines 516-585 (GoalScreenDrawer signedUrls + key-on-frame analog).
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type JSX,
  type SetStateAction,
} from 'react';
import { Play, Pause } from 'lucide-react';

import type { Frame } from '@/lib/queries/prototypes';
import { useSessionPlayback } from '@/lib/queries/session-playback';
import {
  playbackTimeline,
  findFrameAt,
  type PlaybackTimeline,
} from '@/lib/analytics/playback-timeline';
import { supabase } from '@/lib/supabase/auth';
import { ClickRingPulse } from './ClickRingPulse';

const STORAGE_BUCKET = 'prototype-renders';
const SIGNED_URL_TTL_SECONDS = 86_400;

/** Allowed playback speeds — D-63. */
const SPEED_OPTIONS: ReadonlyArray<0.5 | 1 | 2> = [0.5, 1, 2] as const;
type PlaybackSpeed = (typeof SPEED_OPTIONS)[number];

export interface PlaybackPlayerProps {
  sessionId: string;
  blockId: string;
  /** Frame catalogue (from `useFrames(prototypeVersionId)`) for render paths + aspect. */
  frames: Frame[];
}

export function PlaybackPlayer({ sessionId, blockId, frames }: PlaybackPlayerProps): JSX.Element {
  // ─── Data ────────────────────────────────────────────────────────────
  const eventsQuery = useSessionPlayback(sessionId, blockId);
  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);

  const timeline: PlaybackTimeline = useMemo(() => playbackTimeline(events), [events]);

  // Frame catalogue lookup keyed by Figma frame_id — pure derived data.
  const framesById = useMemo(() => new Map(frames.map((f) => [f.frame_id, f] as const)), [frames]);

  // ─── Internal state ──────────────────────────────────────────────────
  const [playheadMs, setPlayheadMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  // RAF refs — null when paused.
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);
  // `speed` is read inside the RAF callback; keep a ref so we don't have to
  // tear down + restart the loop every time the user picks a different pill.
  const speedRef = useRef<PlaybackSpeed>(speed);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  // ─── Signed-URL minting (Pitfall 6 — re-issue per mount = per drawer open) ───
  // Mounts when the drawer opens + the user picks a session; unmounts when
  // either changes. 24h TTL > typical analytics review window.
  useEffect(() => {
    if (frames.length === 0) return;
    let cancelled = false;
    const paths = frames
      .flatMap((f) => [f.render_path_1x, f.render_path_2x])
      .filter(Boolean) as string[];
    if (paths.length === 0) return;
    void (async () => {
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
      if (cancelled || error || !data) return;
      const map: Record<string, string> = {};
      for (const row of data) {
        if (row.path && row.signedUrl) {
          map[row.path] = row.signedUrl;
        }
      }
      setSignedUrls(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [frames]);

  // ─── Reset playhead when the session changes ─────────────────────────
  // PlaybackPlayer's `sessionId` prop is what flips between selected
  // respondents; resetting puts the new session at 00:00 + paused.
  useEffect(() => {
    setPlayheadMs(0);
    setIsPlaying(false);
    lastTickRef.current = null;
  }, [sessionId]);

  // ─── RAF loop (Anti-pattern 5 — only requestAnimationFrame is allowed) ─
  useEffect(() => {
    if (!isPlaying) {
      // Pause: cancel pending frame + clear lastTick so resume doesn't get
      // a multi-second delta jump.
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastTickRef.current = null;
      return;
    }

    const totalMs = timeline.totalMs;
    if (totalMs <= 0) {
      // Nothing to play — flip back to paused so the Play button is
      // re-enabled visually instead of looking stuck.
      setIsPlaying(false);
      return;
    }

    const tick = (now: number) => {
      const last = lastTickRef.current;
      if (last === null) {
        lastTickRef.current = now;
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const delta = (now - last) * speedRef.current;
      lastTickRef.current = now;
      setPlayheadMs((prev) => {
        const next = prev + delta;
        if (next >= totalMs) {
          // Stop the loop on the next tick by flipping isPlaying false.
          // Returning totalMs clamps the displayed playhead/scrubber.
          setIsPlaying(false);
          return totalMs;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      // Cleanup on isPlaying change + unmount: cancel the pending frame.
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastTickRef.current = null;
    };
  }, [isPlaying, timeline.totalMs]);

  // ─── Derived render data ─────────────────────────────────────────────
  const currentFrameEnter = useMemo(
    () => findFrameAt(timeline.frameEnters, playheadMs),
    [timeline.frameEnters, playheadMs],
  );
  const currentFrame = currentFrameEnter
    ? (framesById.get(currentFrameEnter.frameId) ?? null)
    : null;

  // Active clicks: tsMs <= playhead AND on the currently-visible frame
  // (Pitfall — old-frame click footprints must NOT bleed through after a
  // transition, even though ClickRingPulse uses absolute positioning).
  const activeClicks = useMemo(() => {
    if (!currentFrameEnter) return [];
    return timeline.clicks.filter(
      (c) => c.tsMs <= playheadMs && c.frameId === currentFrameEnter.frameId,
    );
  }, [timeline.clicks, playheadMs, currentFrameEnter]);

  const currentFrameIndex = currentFrameEnter
    ? timeline.frameEnters.findIndex((fe) => fe.frameId === currentFrameEnter.frameId)
    : -1;

  const currentSignedUrl =
    currentFrame && currentFrame.render_path_1x
      ? signedUrls[currentFrame.render_path_1x]
      : undefined;
  const currentSignedUrl2x =
    currentFrame && currentFrame.render_path_2x
      ? signedUrls[currentFrame.render_path_2x]
      : undefined;

  // ─── Empty / loading states ──────────────────────────────────────────
  if (eventsQuery.isLoading) {
    return <PlayerStatePlaceholder text="Загружается…" sessionId={sessionId} />;
  }

  if (events.length === 0 || timeline.frameEnters.length === 0) {
    return <PlayerStatePlaceholder text="Нет событий в этой сессии" sessionId={sessionId} />;
  }

  return (
    <section
      aria-label={`Воспроизведение сессии ${sessionId.slice(0, 8)}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        background: 'var(--bg-page)',
      }}
    >
      {/* Frame stage */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          margin: '16px',
          background: 'var(--paper-2)',
          border: '1px solid var(--paper-3)',
          borderRadius: 'var(--radius)',
          overflow: 'hidden',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {currentFrame && currentSignedUrl ? (
          <FrameStage
            frame={currentFrame}
            signedUrl={currentSignedUrl}
            signedUrl2x={currentSignedUrl2x}
            activeClicks={activeClicks}
            playheadMs={playheadMs}
          />
        ) : (
          <p
            style={{
              font: '400 13px var(--font-sans)',
              color: 'var(--text-3)',
              margin: 0,
            }}
          >
            {currentFrame ? 'Подписываю URL рендера…' : 'Кадр для текущей позиции не найден.'}
          </p>
        )}
      </div>

      {/* Controls bar */}
      <ControlsBar
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
        playheadMs={playheadMs}
        totalMs={timeline.totalMs}
        onScrub={setPlayheadMs}
        speed={speed}
        onSpeedChange={setSpeed}
        currentFrameIndex={currentFrameIndex}
        frameTotal={timeline.frameEnters.length}
      />
    </section>
  );
}

// ─── Frame stage with click overlay ─────────────────────────────────────

interface FrameStageProps {
  frame: Frame;
  signedUrl: string;
  signedUrl2x: string | undefined;
  activeClicks: Array<{
    eventId: string;
    tsMs: number;
    x: number;
    y: number;
    hit: boolean;
    frameId: string;
  }>;
  playheadMs: number;
}

function FrameStage({
  frame,
  signedUrl,
  signedUrl2x,
  activeClicks,
  playheadMs,
}: FrameStageProps): JSX.Element {
  // Aspect-ratio container so the click overlay's `${x*100}%` positions
  // resolve against the same box as the rendered <img>.
  const aspectRatio = frame.width && frame.height ? `${frame.width} / ${frame.height}` : undefined;

  return (
    <div
      style={{
        position: 'relative',
        maxWidth: '100%',
        maxHeight: '100%',
        aspectRatio,
        // If aspectRatio is unset for some reason, fall back to a width-only
        // bound so we don't collapse to 0px.
        width: aspectRatio ? 'auto' : '100%',
      }}
    >
      <picture>
        {signedUrl2x ? <source srcSet={signedUrl2x} media="(min-resolution: 1.5dppx)" /> : null}
        <img
          // `key` forces a fresh <img> on frame change so the dissolve
          // keyframe re-fires; without it React reuses the DOM node and
          // skips the animation for in-place src swaps.
          key={frame.frame_id}
          src={signedUrl}
          alt={frame.name ?? 'frame'}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--paper-3)',
            animation: 'transition-frame-dissolve 200ms cubic-bezier(.2,.7,.3,1)',
          }}
        />
      </picture>

      {/* Click overlay — absolute, pointerEvents:none in ClickRingPulse. */}
      {activeClicks.map((click) => (
        <ClickRingPulse
          key={click.eventId}
          x={click.x}
          y={click.y}
          hit={click.hit}
          startMs={click.tsMs}
          playheadMs={playheadMs}
        />
      ))}
    </div>
  );
}

// ─── Controls bar ───────────────────────────────────────────────────────

interface ControlsBarProps {
  isPlaying: boolean;
  setIsPlaying: Dispatch<SetStateAction<boolean>>;
  playheadMs: number;
  totalMs: number;
  onScrub: (ms: number) => void;
  speed: PlaybackSpeed;
  onSpeedChange: (s: PlaybackSpeed) => void;
  currentFrameIndex: number;
  frameTotal: number;
}

function ControlsBar({
  isPlaying,
  setIsPlaying,
  playheadMs,
  totalMs,
  onScrub,
  speed,
  onSpeedChange,
  currentFrameIndex,
  frameTotal,
}: ControlsBarProps): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '12px 16px',
        borderTop: '1px solid var(--border-1)',
        background: 'var(--bg-card)',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <button
          type="button"
          onClick={() => setIsPlaying((p) => !p)}
          aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}
          style={{
            width: 32,
            height: 32,
            background: 'var(--color-accent)',
            color: 'var(--text-on-accent)',
            border: 0,
            borderRadius: 'var(--radius)',
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          {isPlaying ? <Pause size={16} strokeWidth={1.5} /> : <Play size={16} strokeWidth={1.5} />}
        </button>

        <input
          type="range"
          min={0}
          max={Math.max(1, Math.floor(totalMs))}
          value={Math.min(Math.floor(playheadMs), Math.max(1, Math.floor(totalMs)))}
          step={1}
          aria-label="Прогресс воспроизведения"
          // Pitfall 10 — pause-on-drag. Load-bearing for no-jank
          // scrubbing; the grep gate in PLAN.md verify enforces this.
          onMouseDown={() => setIsPlaying(false)}
          onChange={(e) => onScrub(Number(e.currentTarget.value))}
          style={{
            flex: 1,
            height: 4,
            accentColor: 'var(--color-accent)',
            cursor: 'pointer',
          }}
        />

        <div
          role="group"
          aria-label="Скорость воспроизведения"
          style={{
            display: 'flex',
            gap: 2,
            padding: 2,
            background: 'var(--bg-chip)',
            border: '1px solid var(--border-1)',
            borderRadius: 'var(--radius)',
            height: 32,
            flexShrink: 0,
          }}
        >
          {SPEED_OPTIONS.map((s) => {
            const active = s === speed;
            return (
              <button
                key={s}
                type="button"
                aria-pressed={active}
                aria-label={`Скорость: ${s}x`}
                onClick={() => onSpeedChange(s)}
                style={{
                  height: 26,
                  padding: '0 10px',
                  border: 'none',
                  borderRadius: 6,
                  background: active ? 'var(--color-accent)' : 'transparent',
                  color: active ? 'var(--text-on-accent)' : 'var(--text-2)',
                  font: '500 12px var(--font-mono)',
                  cursor: 'pointer',
                  transition: 'background 120ms cubic-bezier(.2,.7,.3,1)',
                }}
              >
                {s}x
              </button>
            );
          })}
        </div>
      </div>

      {/* Position label — mono for fixed-width count display. */}
      <p
        aria-live="polite"
        style={{
          margin: 0,
          font: '400 12px var(--font-mono)',
          color: 'var(--text-3)',
        }}
      >
        фрейм {Math.max(1, currentFrameIndex + 1)} / {frameTotal} · {formatMmSs(playheadMs)} /{' '}
        {formatMmSs(totalMs)}
      </p>
    </div>
  );
}

// ─── Loading / empty placeholder ────────────────────────────────────────

function PlayerStatePlaceholder({
  text,
  sessionId,
}: {
  text: string;
  sessionId: string;
}): JSX.Element {
  return (
    <section
      aria-label={`Воспроизведение сессии ${sessionId.slice(0, 8)}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        minHeight: 0,
        padding: 24,
      }}
    >
      <p
        style={{
          margin: 0,
          font: '400 13px/18px var(--font-sans)',
          color: 'var(--text-3)',
          textAlign: 'center',
        }}
      >
        {text}
      </p>
    </section>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

/** Format milliseconds → "MM:SS" with zero-padding; guards negatives. */
function formatMmSs(ms: number): string {
  const safe = Math.max(0, ms);
  const totalS = Math.floor(safe / 1000);
  const mm = Math.floor(totalS / 60)
    .toString()
    .padStart(2, '0');
  const ss = (totalS % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}
