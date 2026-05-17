// apps/plugin/src/components/SuccessView.tsx — handoff Screen 03 "Import complete".
//
// Source: handoff `maxitest-plugin.jsx` <PluginSuccess /> + .fp-back /
// .fp-result / .fp-result-warn CSS.
//
// Layout (white plugin body, 20px padding, 14px gaps):
//   - Back pill (32px) to choose-prototype screen
//   - Result card:
//       big green checkmark SVG (56×56 circle + check stroke)
//       title "Импорт завершён"
//       mono code (e.g. "kMNN1o") — the short share code/run-token returned
//         by the publish RPC; user copies it into the test block in the web app
//       body copy explaining what to do with the code
//   - Warning paragraph with red ❗ mark — "Если меняешь прототип, надо
//     импортировать заново."
//
// The share code is the actual `run_token` (or short code) from
// `publish_prototype_from_plugin` RPC (Phase 02.2 Plan 02 contract).

interface SuccessViewProps {
  shareCode: string;
  onBack: () => void;
}

export default function SuccessView({ shareCode, onBack }: SuccessViewProps) {
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
      <button
        type="button"
        onClick={onBack}
        style={{
          alignSelf: 'flex-start',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '0 14px 0 10px',
          height: 32,
          borderRadius: 999,
          border: '1px solid #E5E7EB',
          background: '#FFFFFF',
          color: '#1F2328',
          font: '500 14px var(--font-sans, "IBM Plex Sans"), system-ui',
          cursor: 'pointer',
          transition: 'border-color 120ms cubic-bezier(.2,.7,.3,1)',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#E5E7EB')}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
        <span>Назад</span>
      </button>

      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #E5E7EB',
          borderRadius: 12,
          padding: '24px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div style={{ marginBottom: 8 }}>
          <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
            <circle cx="28" cy="28" r="26" stroke="#22C55E" strokeWidth="2.5" />
            <path
              d="M16 28 L25 36 L40 20"
              stroke="#22C55E"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </div>
        <h3
          style={{
            font: '600 17px var(--font-sans, "IBM Plex Sans"), system-ui',
            color: '#1F2328',
            margin: 0,
          }}
        >
          Импорт завершён
        </h3>
        <div
          style={{
            font: '600 22px var(--font-mono, "IBM Plex Mono"), monospace',
            color: '#1F2328',
            letterSpacing: '0.02em',
            userSelect: 'all',
          }}
        >
          {shareCode}
        </div>
        <p
          style={{
            font: '400 13.5px/19px var(--font-sans, "IBM Plex Sans"), system-ui',
            color: '#9CA3AF',
            margin: 0,
            textAlign: 'center',
            padding: '0 8px',
          }}
        >
          Вставь этот код в блок «Figma-прототип» внутри теста на Maxytest — прототип привяжется к
          блоку и появится в превью.
        </p>
      </div>

      <p
        style={{
          font: '400 13px/19px var(--font-sans, "IBM Plex Sans"), system-ui',
          color: '#9CA3AF',
          margin: 0,
          padding: '0 4px',
          textAlign: 'center',
        }}
      >
        <span style={{ color: '#DC2626', fontWeight: 600 }}>❗</span>{' '}
        <b style={{ color: '#1F2328', fontWeight: 600 }}>Важно:</b> если меняешь прототип в Figma —
        нужно импортировать заново, иначе результаты теста будут с устаревшей версией.
      </p>
    </main>
  );
}
