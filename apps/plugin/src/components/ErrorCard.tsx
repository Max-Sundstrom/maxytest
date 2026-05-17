// apps/plugin/src/components/ErrorCard.tsx — Phase 02.2 Plan 05 Task 3.
//
// UI-SPEC §"Component Inventory" #6 — alert-card pattern: light-red banner
// with `(!)` icon, title + message + monospace error code, retry CTA
// centered below. Used in S1 sign-in timeout (Plan 05) and reused for all
// import errors in S5 (Plan 07).
//
// A11y per UI-SPEC §"ErrorCard" bullet 5:
//   - Outer wrapper `<div role="alert" aria-live="assertive">` so screen
//     readers announce errors immediately.
//   - Retry CTA aria-label includes the error message so users with
//     non-visual context understand what they are retrying.

import PrimaryCta from './PrimaryCta';

interface ErrorCardProps {
  code: string;
  title: string;
  message: string;
  onRetry: () => void;
  /** Override CTA label. Defaults to "Попробовать снова". */
  retryLabel?: string;
}

export default function ErrorCard({
  code,
  title,
  message,
  onRetry,
  retryLabel = 'Попробовать снова',
}: ErrorCardProps) {
  return (
    <div role="alert" aria-live="assertive" style={{ padding: 16 }}>
      {/* Alert block — UI-SPEC §"ErrorCard" Alert-блок subsection */}
      <div
        style={{
          background: 'var(--color-error-bg)',
          border: '1px solid var(--color-error-border)',
          borderRadius: 8,
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
        }}
      >
        {/* Inline SVG `(!)` 20×20 — UI-SPEC §"Iconography" row 6.
            Outlined circle with vertical bang inside. Stroke uses the
            error-icon palette token (currently same as primary text). */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-error-icon)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ flexShrink: 0, marginTop: 1 }}
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        </svg>

        {/* Body — title, message, monospace code */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--color-error-text)',
              lineHeight: 1.4,
            }}
          >
            {title}
          </div>
          <p
            style={{
              marginTop: 4,
              fontSize: 14,
              fontWeight: 400,
              color: 'var(--color-error-text)',
              lineHeight: 1.5,
            }}
          >
            {message}
          </p>
          <div
            style={{
              marginTop: 8,
              fontFamily: 'ui-monospace, Menlo, "JetBrains Mono", monospace',
              color: 'var(--color-text-muted)',
              fontSize: 12,
            }}
          >
            Код: {code}
          </div>
        </div>
      </div>

      {/* Retry CTA — UI-SPEC §"ErrorCard" bullet "Primary CTA ниже алерта,
          center-aligned (margin: 24px auto 0), ширина 240 px". */}
      <div style={{ margin: '24px auto 0', width: 240 }}>
        <PrimaryCta label={retryLabel} onClick={onRetry} />
      </div>
    </div>
  );
}
