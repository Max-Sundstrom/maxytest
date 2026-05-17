// apps/plugin/src/components/HelpPill.tsx — design-system v1 rewrite (2026-05-17).
//
// Source: handoff `.fp-help` + `.fp-footer-help` — rounded pill, 32px tall,
// 1px border, info-circle icon left of "Помощь" label, lives at the bottom
// of the plugin body via `margin-top: auto + padding-top: 16` so it pins
// to the footer regardless of body content height.

interface HelpPillProps {
  onClick: () => void;
}

export default function HelpPill({ onClick }: HelpPillProps) {
  return (
    <div style={{ marginTop: 'auto', paddingTop: 16 }}>
      <button
        type="button"
        onClick={onClick}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 12px',
          height: 32,
          borderRadius: 999,
          border: '1px solid #E5E7EB',
          background: '#FFFFFF',
          color: '#1F2328',
          font: '500 13px var(--font-sans, "IBM Plex Sans"), system-ui',
          cursor: 'pointer',
          transition: 'border-color 120ms cubic-bezier(.2,.7,.3,1)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-accent)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = '#E5E7EB';
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            border: '1.5px solid currentColor',
            display: 'grid',
            placeItems: 'center',
            color: '#6B7280',
          }}
        >
          <svg
            width="9"
            height="9"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 8v0M12 12v4" />
          </svg>
        </span>
        <span>Помощь</span>
      </button>
    </div>
  );
}
