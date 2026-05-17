// apps/plugin/src/components/FlowCard.tsx — Phase 02.2 Plan 07 Task 3.
//
// Radiogroup of detected flow starting points. Shown on Screen S2 after
// the sandbox replies with `flows-result`. Per UI-SPEC §"Component
// Inventory" #5 + §"Screen S2 — Prototype / Flow Picker".
//
// Layout:
//   - Outer fieldset (border, 8px radius — design-system v1 lock).
//   - One row per FlowStart, separated by 1px top-border.
//   - Each row: custom radio circle (16×16) + title (page → frame) +
//     muted sub-line (page · N frame).
//   - If exactly one flow has source === 'flow-starting-point' it is the
//     "auto-detected" one — show an "Auto" badge on the right.
//
// A11y:
//   - role="radiogroup", aria-label="Select prototype flow"
//   - Native <input type="radio"> visually hidden (size 1, opacity 0) but
//     focusable — keyboard ↑/↓ + Space work natively. Custom 16×16 circle
//     is decorative (aria-hidden).

import type { FlowStart } from '../types';

interface FlowCardProps {
  flows: FlowStart[];
  selectedId: string | null;
  onSelect: (nodeId: string) => void;
  /** The single flow that came from Figma's native flowStartingPoints
   *  (CONTEXT D-05 step 3 → "Auto-detected"). null if none qualify. */
  autoDetectedNodeId: string | null;
}

export default function FlowCard({
  flows,
  selectedId,
  onSelect,
  autoDetectedNodeId,
}: FlowCardProps) {
  return (
    <fieldset
      role="radiogroup"
      aria-label="Выбор flow прототипа"
      style={{
        margin: 0,
        padding: 0,
        border: '1px solid var(--border-1)',
        borderRadius: 8,
        overflow: 'hidden',
        background: '#FFFFFF',
      }}
    >
      {flows.map((flow, i) => {
        const isSelected = selectedId === flow.nodeId;
        const isAuto = flow.nodeId === autoDetectedNodeId;
        return (
          <label
            key={flow.nodeId}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: '12px 14px',
              borderTop: i === 0 ? 'none' : '1px solid var(--border-1)',
              cursor: 'pointer',
              background: isSelected ? 'var(--bg-input)' : 'transparent',
              transition: 'background 120ms cubic-bezier(.2,.7,.3,1)',
            }}
          >
            {/* Visually-hidden native radio for a11y + keyboard. */}
            <input
              type="radio"
              name="flow"
              value={flow.nodeId}
              checked={isSelected}
              onChange={() => onSelect(flow.nodeId)}
              style={{
                position: 'absolute',
                width: 1,
                height: 1,
                padding: 0,
                margin: -1,
                overflow: 'hidden',
                clip: 'rect(0,0,0,0)',
                whiteSpace: 'nowrap',
                border: 0,
              }}
            />
            {/* Custom radio circle, mirrors the native state. */}
            <span
              aria-hidden="true"
              style={{
                width: 16,
                height: 16,
                marginTop: 2,
                borderRadius: '50%',
                border: `1.5px solid ${
                  isSelected ? 'var(--color-accent)' : 'var(--border-strong)'
                }`,
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              {isSelected && (
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: 'var(--color-accent)',
                  }}
                />
              )}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  font: '500 14px var(--font-sans, "IBM Plex Sans"), system-ui',
                  color: 'var(--text-1)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {flow.pageName} → {flow.nodeName}
              </div>
              <div
                style={{
                  marginTop: 2,
                  font: '400 12px var(--font-sans, "IBM Plex Sans"), system-ui',
                  color: 'var(--text-2)',
                }}
              >
                Page · {flow.pageName}
              </div>
            </div>
            {isAuto && (
              <span
                style={{
                  flexShrink: 0,
                  marginTop: 2,
                  padding: '2px 6px',
                  background: 'var(--bg-chip)',
                  color: 'var(--text-2)',
                  borderRadius: 4,
                  font: '500 10px var(--font-mono, "IBM Plex Mono"), monospace',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                Auto
              </span>
            )}
          </label>
        );
      })}
    </fieldset>
  );
}
