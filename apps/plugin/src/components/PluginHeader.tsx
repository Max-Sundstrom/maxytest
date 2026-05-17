// apps/plugin/src/components/PluginHeader.tsx — Phase 02.2 Plan 05 Task 3.
//
// UI-SPEC §"Component Inventory" #1 — fixed 52 px black header with logo,
// brand text, and close-X. Shared across every plugin screen (S1..S5 in
// Plan 07; for now only S1 + authenticated placeholder).
//
// Close button posts `{type:'close'}` via the parent IPC bridge. Sandbox
// (code.ts) calls figma.closePlugin() on receipt — see Plan 05 Task 1.
//
// A11y per UI-SPEC §"PluginHeader" bullet 5:
//   - `<header role="banner" aria-label="Maxytest plugin">`
//   - Close-X button has `aria-label="Close plugin"`

interface PluginHeaderProps {
  onClose: () => void;
}

export default function PluginHeader({ onClose }: PluginHeaderProps) {
  return (
    <header
      role="banner"
      aria-label="Maxytest plugin"
      style={{
        // Fixed 52 px to match UI-SPEC; flex row, brand on left, X on right.
        height: 52,
        flexShrink: 0,
        background: '#0E0E0E',
        color: 'var(--color-text-invert)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0 16px',
      }}
    >
      {/* Brand block — white square logo + "Maxytest" wordmark */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div
          aria-hidden="true"
          style={{
            width: 24,
            height: 24,
            background: '#FFFFFF',
            color: '#0E0E0E',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          М
        </div>
        <span
          style={{
            marginLeft: 8,
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--color-text-invert)',
          }}
        >
          Maxytest
        </span>
      </div>

      {/* Close button — 32×32 hit target, transparent bg, hover handled
          via inline state would require a state hook; we keep the styling
          minimal (Figma users mostly click rather than hover). */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close plugin"
        style={{
          width: 32,
          height: 32,
          background: 'transparent',
          color: 'var(--color-text-invert)',
          border: 'none',
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        {/* Inline SVG ×, 20×20 — UI-SPEC §"Iconography" row 1 */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 6L6 18" />
          <path d="M6 6l12 12" />
        </svg>
      </button>
    </header>
  );
}
