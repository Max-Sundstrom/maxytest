// apps/plugin/src/components/ImportErrorView.tsx — handoff Screen 04 "Access error".
//
// Source: handoff `maxitest-plugin.jsx` <PluginError /> + .fp-result-error /
// .fp-error-box CSS.
//
// Distinct from the AUTH error (covered by <ErrorCard /> in SignInView) —
// this is for IMPORT-pipeline failures: restricted access, RPC error, parse
// error, etc. Plan 02.2-07 will populate the headline + body from the
// `error_code` / `error_message` envelope returned by
// publish_prototype_from_plugin.
//
// Layout:
//   - Title (the prototype name — or generic fallback)
//   - Red error box: icon + heading + body
//   - Centered "Попробовать снова" CTA (callback decides re-flow:
//     back to choose-prototype, or back to paste-url for restart).

interface ImportErrorViewProps {
  protoName?: string;
  errorHeading: string;
  errorBody: string;
  onRetry: () => void;
}

export default function ImportErrorView({
  protoName,
  errorHeading,
  errorBody,
  onRetry,
}: ImportErrorViewProps) {
  return (
    <main
      style={{
        flex: 1,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        background: '#FFFFFF',
        overflow: 'auto',
      }}
    >
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #E5E7EB',
          borderRadius: 12,
          padding: '20px 20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          alignItems: 'stretch',
        }}
      >
        <h3
          style={{
            font: '600 17px var(--font-sans, "IBM Plex Sans"), system-ui',
            color: '#1F2328',
            margin: 0,
            textAlign: 'center',
            borderBottom: '1px solid #E5E7EB',
            paddingBottom: 14,
          }}
        >
          {protoName ?? 'Ошибка импорта'}
        </h3>
        <div
          style={{
            background: '#FEE2E2',
            borderRadius: 10,
            padding: 16,
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
          }}
        >
          <div style={{ flexShrink: 0, paddingTop: 1 }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="8" stroke="#111" strokeWidth="1.5" />
              <path
                d="M10 5.5v5M10 13.5v.5"
                stroke="#111"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div
              style={{
                font: '600 14px/19px var(--font-sans, "IBM Plex Sans"), system-ui',
                color: '#1F2328',
              }}
            >
              {errorHeading}
            </div>
            <div
              style={{
                font: '400 13px/19px var(--font-sans, "IBM Plex Sans"), system-ui',
                color: '#1F2328',
              }}
            >
              {errorBody}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onRetry}
          style={{
            width: 'auto',
            padding: '0 24px',
            margin: '16px auto 0',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 44,
            background: 'var(--color-accent)',
            color: '#FFFFFF',
            border: 0,
            borderRadius: 999,
            font: '500 14px var(--font-sans, "IBM Plex Sans"), system-ui',
            cursor: 'pointer',
            transition: 'filter 120ms cubic-bezier(.2,.7,.3,1)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.05)')}
          onMouseLeave={(e) => (e.currentTarget.style.filter = 'none')}
        >
          Попробовать снова
        </button>
      </div>
    </main>
  );
}
