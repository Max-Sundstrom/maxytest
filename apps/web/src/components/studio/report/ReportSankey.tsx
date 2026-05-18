/**
 * <ReportSankey /> — d3-sankey-layouted pan/zoom board for the prototype block report.
 *
 * Source: 03-RESEARCH.md §"Pattern 2: Sankey rendered as data-driven SVG via
 * d3-sankey layout" (lines 560-666) + Pitfall 1/2/3 (lines 933-999) + 03-PATTERNS.md §16.
 *
 * Phase 3 / Plan 03-02 refactor:
 *   - REMOVED stub `FlowPaths` component + column-distribute layout (was 277-390 / 66-81).
 *   - ADDED d3-sankey layout via `useMemo` (with clone-before-call discipline, Pitfall 1).
 *   - ADDED terminal-class nodes `TERMINAL_SUCCESS` («Цель», green accent) and
 *     `TERMINAL_GIVEUP` («Сдались», warning accent) — D-43.
 *   - ADDED standalone `OTHER` node for hidden rare paths — D-41.
 *   - ADDED self-loop overlay arcs rendered ONLY in `mode === 'all'` (Pitfall 3 —
 *     d3-sankey can't lay out self-loops).
 *   - ADDED `<ModeToggle />` top-left overlay — D-42, «Первое прохождение» (DAG) /
 *     «Все прохождения» (with cycles).
 *
 * Pan/zoom shell preserved verbatim (constants, fitToContainer, wheel/drag handlers,
 * bottom-left ZoomBtn group).
 *
 * Sankey data comes from parent `ReportShell` via `transitionGraph(...)` — see
 * `@/lib/analytics/transition-graph.ts`. The component is presentation-only; it
 * does NOT compute the graph itself.
 *
 * Pan/zoom — "FigJam-like":
 *   - Wheel/trackpad scroll → zoom (anchored at the cursor)
 *   - ⌘/Ctrl + wheel also zooms (mac trackpad pinch convention)
 *   - Drag (mousedown not on a button) → pan
 *   - Bottom-left zoom controls (+ / − / fit) for keyboard/no-trackpad users
 *   - Min scale 0.4, max 2.0; double-click background resets to fit
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';
import {
  sankey as d3Sankey,
  sankeyLinkHorizontal,
  sankeyJustify,
  type SankeyNode as D3SankeyNode,
  type SankeyLink as D3SankeyLink,
} from 'd3-sankey';
import type { Frame } from '@/lib/queries/prototypes';
import type {
  SankeyGraph,
  SankeyGraphNode,
  SankeyGraphEdge,
} from '@/lib/analytics/transition-graph';

const FRAME_W = 56;
const FRAME_H = 64;
const VIEWPORT_HEIGHT = 420;
const BOARD_WIDTH = 1320;
const MIN_SCALE = 0.4;
const MAX_SCALE = 2.0;
const ZOOM_STEP = 1.15;

export interface ReportSankeyProps {
  /** Pre-computed sankey graph from `transitionGraph(...)` (parent owns memoization). */
  sankey: SankeyGraph;
  /** D-42 mode toggle — 'first' = DAG, 'all' = cycles + self-loops visible. */
  mode: 'first' | 'all';
  /** Mode change handler (ReportShell holds the source-of-truth state). */
  onModeChange: (mode: 'first' | 'all') => void;
  /** Used to render frame thumbnails inside `kind='frame'` nodes. */
  frames: Frame[];
  /** Optional starting frame highlight (block.content.starting_frame_id). */
  startingFrameId?: string;
}

// d3-sankey type aliases — uses our domain shapes as the user-data N/L generics.
type LayoutNode = D3SankeyNode<SankeyGraphNode, SankeyGraphEdge>;
type LayoutLink = D3SankeyLink<SankeyGraphNode, SankeyGraphEdge>;

export function ReportSankey({
  sankey,
  mode,
  onModeChange,
  frames,
  startingFrameId,
}: ReportSankeyProps) {
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  // d3-sankey layout — clone inputs BEFORE passing (Pitfall 1: d3-sankey
  // mutates input arrays in-place; cloning protects TanStack Query cache).
  const layout = useMemo(() => {
    if (sankey.nodes.length === 0 || sankey.edges.length === 0) return null;
    const generator = d3Sankey<SankeyGraphNode, SankeyGraphEdge>()
      .nodeId((n) => n.id)
      .nodeWidth(FRAME_W)
      .nodePadding(12)
      .nodeAlign(sankeyJustify)
      .extent([
        [24, 24],
        [BOARD_WIDTH - 120, VIEWPORT_HEIGHT - 24],
      ]);

    const nodesClone = sankey.nodes.map((n) => ({ ...n }));
    const edgesClone = sankey.edges.map((e) => ({ ...e }));
    return generator({ nodes: nodesClone, links: edgesClone });
  }, [sankey]);

  // Build lookup for self-loop overlay (Pitfall 3) — d3-sankey can't lay out
  // A→A, so we render them as curved arcs over the laid-out nodes.
  const selfLoopOverlay = useMemo(() => {
    if (!layout || mode !== 'all' || sankey.selfLoops.length === 0) return [];
    const byId = new Map<string, LayoutNode>();
    for (const n of layout.nodes) byId.set(n.id, n);
    return sankey.selfLoops
      .map((sl) => {
        const node = byId.get(sl.frameId);
        if (!node || node.x0 == null || node.x1 == null || node.y0 == null) return null;
        return { node, count: sl.sessionsCount };
      })
      .filter((v): v is { node: LayoutNode; count: number } => v !== null);
  }, [layout, mode, sankey.selfLoops]);

  const fitToContainer = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = rect.width / BOARD_WIDTH;
    const scaleY = rect.height / VIEWPORT_HEIGHT;
    const scale = Math.max(MIN_SCALE, Math.min(scaleX, scaleY, 1));
    const cx = (rect.width - BOARD_WIDTH * scale) / 2;
    const cy = (rect.height - VIEWPORT_HEIGHT * scale) / 2;
    setTransform({ x: cx, y: cy, scale });
  }, []);

  // Fit once on mount and on resize.
  useEffect(() => {
    fitToContainer();
    if (typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(() => fitToContainer());
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [fitToContainer]);

  // Wheel zoom — cursor-anchored.
  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!containerRef.current) return;
    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    setTransform((prev) => {
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.scale * factor));
      const ratio = next / prev.scale;
      const x = cx - (cx - prev.x) * ratio;
      const y = cy - (cy - prev.y) * ratio;
      return { x, y, scale: next };
    });
  }, []);

  // Wheel listener attached non-passively so preventDefault works.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-sankey-control]')) return;
    draggingRef.current = {
      x: e.clientX,
      y: e.clientY,
      tx: transform.x,
      ty: transform.y,
    };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - draggingRef.current.x;
    const dy = e.clientY - draggingRef.current.y;
    setTransform((prev) => ({
      ...prev,
      x: draggingRef.current!.tx + dx,
      y: draggingRef.current!.ty + dy,
    }));
  };

  const endDrag = () => {
    draggingRef.current = null;
  };

  const zoom = (factor: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    setTransform((prev) => {
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.scale * factor));
      const ratio = next / prev.scale;
      const x = cx - (cx - prev.x) * ratio;
      const y = cy - (cy - prev.y) * ratio;
      return { x, y, scale: next };
    });
  };

  const empty = sankey.nodes.length === 0 || sankey.edges.length === 0;

  return (
    <div
      ref={containerRef}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('[data-sankey-control]')) return;
        fitToContainer();
      }}
      style={{
        position: 'relative',
        height: VIEWPORT_HEIGHT,
        background: 'var(--paper-1)',
        border: '1px solid var(--border-1)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        cursor: draggingRef.current ? 'grabbing' : 'grab',
        userSelect: 'none',
      }}
    >
      {/* Transform wrapper — board contents scale + translate together */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: BOARD_WIDTH,
          height: VIEWPORT_HEIGHT,
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: '0 0',
          transition: draggingRef.current ? 'none' : 'transform 120ms cubic-bezier(.2,.7,.3,1)',
        }}
      >
        {layout && (
          <svg
            style={{
              position: 'absolute',
              inset: 0,
              width: BOARD_WIDTH,
              height: VIEWPORT_HEIGHT,
              pointerEvents: 'none',
            }}
            viewBox={`0 0 ${BOARD_WIDTH} ${VIEWPORT_HEIGHT}`}
          >
            {/* Edges — sankeyLinkHorizontal generator */}
            {layout.links.map((link, i) => (
              <SankeyEdge
                key={`edge-${i}`}
                link={link}
                validSessionCount={sankey.validSessionCount}
              />
            ))}

            {/* Self-loop overlay arcs — only in 'all' mode (Pitfall 3) */}
            {selfLoopOverlay.map(({ node, count }, i) => (
              <SelfLoopArc key={`loop-${i}`} node={node} count={count} />
            ))}
          </svg>
        )}

        {/* Nodes — rendered as positioned absolute divs over the SVG */}
        {layout?.nodes.map((node) => {
          const x = node.x0 ?? 0;
          const y = node.y0 ?? 0;
          if (node.kind === 'frame') {
            const frame = frames.find((f) => f.frame_id === node.id);
            return (
              <FrameNode
                key={node.id}
                frame={frame}
                name={node.name}
                isStart={frame?.frame_id === startingFrameId}
                x={x}
                y={y}
              />
            );
          }
          if (node.kind === 'terminal') {
            return <TerminalNode key={node.id} id={node.id} name={node.name} x={x} y={y} />;
          }
          // kind === 'other'
          return <OtherNode key={node.id} name={node.name} x={x} y={y} />;
        })}
      </div>

      {/* Mode toggle — top-left overlay (NOT inside <svg>, NOT inside pan/zoom transform) */}
      <ModeToggle mode={mode} onChange={onModeChange} />

      {/* Zoom controls — bottom-left, stacked */}
      <div
        data-sankey-control
        style={{
          position: 'absolute',
          left: 16,
          bottom: 14,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-1)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow-sm)',
          overflow: 'hidden',
        }}
      >
        <ZoomBtn onClick={() => zoom(ZOOM_STEP)} ariaLabel="Приблизить">
          <Plus size={14} strokeWidth={1.5} />
        </ZoomBtn>
        <span style={{ height: 1, background: 'var(--border-2)' }} />
        <ZoomBtn onClick={() => zoom(1 / ZOOM_STEP)} ariaLabel="Отдалить">
          <Minus size={14} strokeWidth={1.5} />
        </ZoomBtn>
        <span style={{ height: 1, background: 'var(--border-2)' }} />
        <ZoomBtn onClick={fitToContainer} ariaLabel="По размеру">
          <Maximize2 size={12} strokeWidth={1.5} />
        </ZoomBtn>
      </div>

      {/* Empty state — no data to chart yet */}
      {empty ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            color: 'var(--text-3)',
            font: '400 14px/20px var(--font-sans)',
          }}
        >
          Импортируй прототип, чтобы увидеть пути респондентов.
        </div>
      ) : null}
    </div>
  );
}

// ─── Sankey edge ────────────────────────────────────────────────────────

function SankeyEdge({ link, validSessionCount }: { link: LayoutLink; validSessionCount: number }) {
  const path = sankeyLinkHorizontal<SankeyGraphNode, SankeyGraphEdge>()(link) ?? '';
  // D-44 — clamp thickness 1..40 px.
  const thicknessPx = Math.max(1, Math.min(40, link.width ?? 1));
  // After layout, link.source/target are replaced by node references (Pitfall 2).
  const srcName = (link.source as SankeyGraphNode).name;
  const tgtName = (link.target as SankeyGraphNode).name;
  const value = link.value ?? 0;
  const percent = validSessionCount > 0 ? Math.round((value / validSessionCount) * 100) : 0;
  // D-45 verbatim — «A → B · N сессий · X% потока»
  const tooltip = `${srcName} → ${tgtName} · ${value} сессий · ${percent}% потока`;
  return (
    <path
      d={path}
      fill="none"
      stroke="var(--border-2)"
      strokeOpacity={0.55}
      strokeWidth={thicknessPx}
      style={{ pointerEvents: 'auto' }}
    >
      <title>{tooltip}</title>
    </path>
  );
}

// ─── Self-loop arc (Pitfall 3) ──────────────────────────────────────────

function SelfLoopArc({ node, count }: { node: LayoutNode; count: number }) {
  const x0 = node.x0 ?? 0;
  const x1 = node.x1 ?? 0;
  const y0 = node.y0 ?? 0;
  const r = 18;
  // Curved arc starting at right edge, going up + over, ending at left edge.
  const d = `M ${x1} ${y0 + 8} C ${x1 + r} ${y0 - r}, ${x0 - r} ${y0 - r}, ${x0} ${y0 + 8}`;
  const thickness = Math.max(1, Math.min(40, count));
  return (
    <path
      d={d}
      fill="none"
      stroke="var(--border-2)"
      strokeOpacity={0.5}
      strokeWidth={thickness}
      style={{ pointerEvents: 'auto' }}
    >
      <title>{`${node.name} → ${node.name} (повтор) · ${count} сессий`}</title>
    </path>
  );
}

// ─── Frame node ─────────────────────────────────────────────────────────

function FrameNode({
  frame,
  name,
  isStart,
  x,
  y,
}: {
  frame: Frame | undefined;
  name: string;
  isStart: boolean;
  x: number;
  y: number;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: FRAME_W,
        height: FRAME_H,
        borderRadius: 4,
        border: isStart ? '1.5px solid var(--color-accent)' : '1px solid var(--paper-3)',
        background: 'var(--bg-card)',
        boxShadow: isStart ? '0 0 0 1.5px var(--color-accent)' : 'none',
        overflow: 'hidden',
      }}
      title={frame?.name ?? name}
    >
      <FrameThumbMock />
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: -14,
          textAlign: 'center',
          font: '500 9px var(--font-mono)',
          color: 'var(--text-3)',
          letterSpacing: '0.04em',
        }}
      >
        {(frame?.name ?? name).slice(0, 6) || 's…'}
      </span>
    </div>
  );
}

// ─── Terminal node («Цель» / «Сдались») ─────────────────────────────────

function TerminalNode({ id, name, x, y }: { id: string; name: string; x: number; y: number }) {
  const accent = id === 'TERMINAL_SUCCESS' ? 'var(--color-success)' : 'var(--color-warning)';
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: FRAME_W,
        height: FRAME_H,
        borderRadius: 4,
        border: '1px solid var(--border-2)',
        background: 'var(--bg-card)',
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
      }}
      title={name}
    >
      <span
        aria-hidden="true"
        style={{
          width: 4,
          height: '100%',
          background: accent,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          flex: 1,
          textAlign: 'center',
          font: '500 11px var(--font-sans)',
          color: 'var(--text-1)',
          padding: '0 4px',
          lineHeight: '14px',
        }}
      >
        {name}
      </span>
    </div>
  );
}

// ─── Other node ─────────────────────────────────────────────────────────

function OtherNode({ name, x, y }: { name: string; x: number; y: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: FRAME_W,
        height: FRAME_H,
        borderRadius: 4,
        border: '1px dashed var(--text-3)',
        background: 'var(--bg-card)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4px 6px',
        overflow: 'hidden',
      }}
      title={name}
    >
      <span
        style={{
          font: '500 10px/13px var(--font-sans)',
          color: 'var(--text-3)',
          textAlign: 'center',
        }}
      >
        {name}
      </span>
    </div>
  );
}

// Pure-CSS app-thumb mock (mirrors handoff ProtoSankeyMock — left rail +
// folder strip + row lines).
function FrameThumbMock() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: 'var(--bg-card)',
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: '8px 12px 1fr',
        gap: 1,
        padding: 2,
        boxSizing: 'border-box',
      }}
    >
      <span style={{ background: 'var(--paper-2)', borderRadius: 1 }} />
      <span style={{ background: 'var(--paper-1)', borderRadius: 1 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: 1 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            style={{
              height: 1.5,
              background: i === 0 ? 'var(--color-accent)' : 'var(--paper-2)',
              borderRadius: 1,
              width: `${100 - i * 8}%`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Mode toggle (D-42) ─────────────────────────────────────────────────

function ModeToggle({
  mode,
  onChange,
}: {
  mode: 'first' | 'all';
  onChange: (mode: 'first' | 'all') => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Режим прохождения"
      data-sankey-control
      style={{
        position: 'absolute',
        left: 16,
        top: 14,
        display: 'flex',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-1)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
        height: 32,
      }}
    >
      <ModeBtn active={mode === 'first'} onClick={() => onChange('first')}>
        Первое прохождение
      </ModeBtn>
      <span style={{ width: 1, background: 'var(--border-2)' }} />
      <ModeBtn active={mode === 'all'} onClick={() => onChange('all')}>
        Все прохождения
      </ModeBtn>
    </div>
  );
}

function ModeBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      data-sankey-control
      style={{
        height: '100%',
        padding: '0 12px',
        background: active ? 'var(--color-accent)' : 'transparent',
        color: active ? 'var(--ink-0)' : 'var(--text-2)',
        border: 0,
        font: '500 12px/14px var(--font-sans)',
        cursor: 'pointer',
        transition: 'background 120ms cubic-bezier(.2,.7,.3,1)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

function ZoomBtn({
  onClick,
  ariaLabel,
  children,
}: {
  onClick: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      data-sankey-control
      style={{
        width: 32,
        height: 32,
        background: 'transparent',
        border: 0,
        display: 'grid',
        placeItems: 'center',
        color: 'var(--text-2)',
        cursor: 'pointer',
        transition: 'background 120ms cubic-bezier(.2,.7,.3,1)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-chip)';
        e.currentTarget.style.color = 'var(--text-1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--text-2)';
      }}
    >
      {children}
    </button>
  );
}
