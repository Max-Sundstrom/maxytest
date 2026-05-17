// apps/plugin/src/components/PluginHeader.tsx — design-system v1 rewrite (2026-05-17).
//
// Source: design-system handoff (`maxitest-plugin.jsx` <PluginFrame /> header +
// `.fp-hd*` rules). 48px tall, plum `--color-accent-5` (#9E5E72) background,
// 24×24 white square logo with dark M (inverse of the main-app M-logo, no
// accent dot — plugin-specific signal), "Maxytest" wordmark, 28×28 round X.
//
// Close button posts `{type:'close'}` via the parent IPC bridge; sandbox
// (code.ts) calls figma.closePlugin() on receipt — Plan 05 Task 1 contract
// preserved.
//
// A11y:
//   - <header role="banner" aria-label="Maxytest plugin">
//   - Close-X has aria-label="Закрыть плагин"

interface PluginHeaderProps {
  onClose: () => void;
}

export default function PluginHeader({ onClose }: PluginHeaderProps) {
  return (
    <header
      role="banner"
      aria-label="Maxytest plugin"
      style={{
        height: 48,
        flexShrink: 0,
        background: 'var(--color-accent-5)',
        color: '#FFFFFF',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 12px',
      }}
    >
      {/* 24×24 white square, dark "M" inside — handoff .fp-hd-logo */}
      <div
        aria-hidden="true"
        style={{
          width: 24,
          height: 24,
          background: '#FFFFFF',
          color: '#1F1F1F',
          borderRadius: 6,
          display: 'grid',
          placeItems: 'center',
          font: '600 13px var(--font-sans, "IBM Plex Sans"), system-ui',
          letterSpacing: '-0.02em',
          flexShrink: 0,
        }}
      >
        M
      </div>
      <span
        style={{
          flex: 1,
          font: '500 14px var(--font-sans, "IBM Plex Sans"), system-ui',
        }}
      >
        Maxytest
      </span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Закрыть плагин"
        style={{
          width: 28,
          height: 28,
          background: 'transparent',
          color: 'rgba(255,255,255,0.8)',
          border: 0,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
          transition:
            'background 120ms cubic-bezier(.2,.7,.3,1), color 120ms cubic-bezier(.2,.7,.3,1)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
          e.currentTarget.style.color = '#FFFFFF';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'rgba(255,255,255,0.8)';
        }}
      >
        <svg
          width="14"
          height="14"
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
