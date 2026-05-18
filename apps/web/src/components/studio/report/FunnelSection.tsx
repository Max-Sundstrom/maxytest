/**
 * <FunnelSection /> — success-path funnel UI (horizontal bars + drop-off).
 *
 * Plan: 03-prototype-analytics-depth / 03-04 / Task 2.
 *
 * Closes ANALYTICS-08 visual surface — renders the result of `funnelSteps`
 * (Plan 03-04 Task 1) as a vertical stack of rows: one row per step in the
 * designer-defined `success_path`. Between adjacent rows we render a
 * drop-off indicator per D-52 + Pitfall 8 — Forgiving funnels can be
 * non-monotonic, so the indicator is neutral when diff ≥ 0.
 *
 * Locked visual contract (03-CONTEXT.md §D-52 + §D-53):
 *   - One row per `FunnelStep` — 56×64 px thumbnail, step index + frame
 *     name, horizontal bar-fill (`var(--color-accent)`), right-aligned
 *     `{N} из {Total}` exact count.
 *   - Between rows: inline drop-off indicator. `diff < 0` → warning copy
 *     `−{|diff|} респ. (−{X}%)`. `diff ≥ 0` → neutral `± 0`.
 *   - `steps.length === 0` → return `null` (D-53 defensive; the parent
 *     ALSO guards via `successPath.length > 0`).
 *   - All copy in Russian. All colour through `var(--*)` tokens. No hex.
 *
 * The component does NOT fetch signed URLs — it expects the parent to pass
 * a `signedUrls: Record<path, url>` map (typically lifted to `ReportShell`
 * in Task 3). If a frame's render path isn't in the map (still loading or
 * un-resolvable) we render a token-coloured placeholder rectangle so the
 * row layout stays stable.
 */

import { useMemo } from 'react';

import type { FunnelStep } from '@/lib/analytics/funnel-steps';
import type { Frame } from '@/lib/queries/prototypes';

export interface FunnelSectionProps {
  /** Output of `funnelSteps(...)`; one entry per `success_path[i]`. */
  steps: FunnelStep[];
  /** Frame catalogue for thumbnail + name resolution by `frame_id`. */
  frames: Frame[];
  /** Pre-resolved storage-path → signed-URL map (parent provides). */
  signedUrls: Record<string, string>;
  /** Denominator for the exact `N из Total` text (matches `funnelSteps`'s denom). */
  validSessionCount: number;
}

export function FunnelSection({
  steps,
  frames,
  signedUrls,
  validSessionCount,
}: FunnelSectionProps) {
  // O(1) frame lookup by frame_id for thumbnail + name resolution.
  // Memo is unconditional (rules-of-hooks) — the D-53 guard happens AFTER.
  const framesById = useMemo(() => new Map(frames.map((f) => [f.frame_id, f] as const)), [frames]);

  // D-53 — defensive (parent should already guard, but keep it honest).
  if (steps.length === 0) return null;

  return (
    <section
      aria-label="Целевой путь — воронка по шагам success_path"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}
    >
      {steps.map((step, i) => (
        <div key={step.frameId + ':' + step.stepIndex}>
          <FunnelRow
            step={step}
            frame={framesById.get(step.frameId)}
            signedUrls={signedUrls}
            validSessionCount={validSessionCount}
          />
          {i < steps.length - 1 ? <DropOffBetween from={step} to={steps[i + 1]!} /> : null}
        </div>
      ))}
    </section>
  );
}

// ─── Row ────────────────────────────────────────────────────────────────

function FunnelRow({
  step,
  frame,
  signedUrls,
  validSessionCount,
}: {
  step: FunnelStep;
  frame: Frame | undefined;
  signedUrls: Record<string, string>;
  validSessionCount: number;
}) {
  const path = frame?.render_path_2x ?? frame?.render_path_1x ?? null;
  const src = path ? signedUrls[path] : undefined;
  const name = frame?.name ?? step.frameId;
  // Clamp width into [0, 100] so unexpected percentages (shouldn't happen,
  // but defensive) never overflow the track.
  const widthPercent = Math.max(0, Math.min(100, step.percentage));

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '12px 0',
      }}
    >
      {/* 56×64 thumbnail wrapper — fixed dimensions, object-fit:cover so the
          frame image fills the slot without distortion. */}
      <div
        style={{
          width: 56,
          height: 64,
          borderRadius: 'var(--radius)',
          background: 'var(--bg-page)',
          border: '1px solid var(--border-1)',
          overflow: 'hidden',
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {src ? (
          <img
            src={src}
            alt={name}
            loading="lazy"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
        ) : (
          <span
            aria-hidden="true"
            style={{
              font: '500 13px var(--font-sans)',
              color: 'var(--text-3)',
            }}
          >
            {step.stepIndex + 1}
          </span>
        )}
      </div>

      {/* Middle column — step index + name + bar */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <span
          style={{
            font: '500 13.5px/18px var(--font-sans)',
            color: 'var(--text-1)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {step.stepIndex + 1}. {name}
        </span>
        {/* Bar track — 8 px tall, 4 px radius, accent fill scaled to %. */}
        <div
          role="presentation"
          style={{
            position: 'relative',
            height: 8,
            borderRadius: 4,
            background: 'var(--bg-page)',
            border: '1px solid var(--border-1)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${widthPercent}%`,
              height: '100%',
              background: 'var(--color-accent)',
              transition: 'width 240ms cubic-bezier(.2, .7, .3, 1)',
            }}
          />
        </div>
      </div>

      {/* Right column — exact count */}
      <span
        style={{
          font: '500 13px var(--font-sans)',
          color: 'var(--text-1)',
          flexShrink: 0,
          minWidth: 96,
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {step.sessionsReached} из {validSessionCount}
      </span>
    </div>
  );
}

// ─── Drop-off ───────────────────────────────────────────────────────────

/**
 * Inline indicator between adjacent funnel rows. Drop-off (`diff < 0`) is
 * coloured `var(--color-warning)` per D-52; non-drop (`diff ≥ 0`, allowed
 * under Forgiving D-50 per Pitfall 8) renders a neutral `± 0` marker.
 *
 * Layout — a thin horizontal divider with the indicator label inline on
 * the right so the eye scans down the rows and only notices the inline
 * marker when there's something to flag.
 */
function DropOffBetween({ from, to }: { from: FunnelStep; to: FunnelStep }) {
  const diff = to.sessionsReached - from.sessionsReached;
  const isDrop = diff < 0;

  let label: string;
  let color: string;
  if (isDrop) {
    // Forgiving: from.sessionsReached can be 0 if step `from` was never
    // reached but step `to` somehow was (e.g., success_path reordered after
    // events landed). Guard against divide-by-zero — fall back to absolute
    // count only.
    if (from.sessionsReached === 0) {
      label = `${diff} респ.`;
    } else {
      const pct = (diff / from.sessionsReached) * 100;
      label = `${diff} респ. (${pct.toFixed(0)}%)`;
    }
    color = 'var(--color-warning)';
  } else {
    label = '± 0';
    color = 'var(--text-3)';
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '2px 0',
        marginLeft: 72, // align with the middle column (56 thumbnail + 16 gap)
      }}
    >
      <span
        aria-hidden="true"
        style={{
          flex: 1,
          height: 1,
          background: 'var(--border-1)',
        }}
      />
      <span
        style={{
          font: '500 12.5px var(--font-sans)',
          color,
          fontVariantNumeric: 'tabular-nums',
          minWidth: 120,
          textAlign: 'right',
        }}
      >
        {label}
      </span>
    </div>
  );
}
