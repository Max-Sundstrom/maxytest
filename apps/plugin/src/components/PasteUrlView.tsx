// apps/plugin/src/components/PasteUrlView.tsx — handoff Screen 01 "Paste URL".
//
// Source: handoff `maxitest-plugin.jsx` <PluginUrl /> + .fp-instructions /
// .fp-figma-hint / .fp-field / .fp-input / .fp-cta CSS.
//
// Layout (top→bottom inside the white plugin body, 20px padding, 14px gaps):
//   - Stepper [1/2] active=1
//   - Ordered list of 2 instructions (14/20)
//   - Figma-hint mock — 110px decorative card with a "Copy link" cursor
//     overlay (cursor → light-blue card with paperclip + label + X). Pure CSS.
//   - Field group: bold label "Вставьте URL файла Figma" + URL input + hint
//     "Эта ссылка нужна только для импорта..."
//   - 44px primary CTA "Продолжить" — disabled until URL is non-empty (basic
//     trimmed check; real validation happens in the import pipeline / Plan 02.2-07).
//
// Validation philosophy: we deliberately don't enforce figma.com domain here.
// The handoff doesn't either, and Plan 02.2-07 will surface real errors
// (network / RPC / Figma file ID parse) via <ImportErrorView />.

import { useState } from 'react';

import PrimaryCta from './PrimaryCta';
import Stepper from './Stepper';

interface PasteUrlViewProps {
  onContinue: (url: string) => void;
}

const STEP_LABELS: [string, string] = ['Вставьте URL', 'Выберите прототип'];

export default function PasteUrlView({ onContinue }: PasteUrlViewProps) {
  const [url, setUrl] = useState('');
  const [focused, setFocused] = useState(false);

  const trimmed = url.trim();
  const canContinue = trimmed.length > 0;

  return (
    <main
      aria-labelledby="paste-url-title"
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
      <Stepper active={1} labels={STEP_LABELS} />

      <ol
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          font: '500 14px/20px var(--font-sans, "IBM Plex Sans"), system-ui',
          color: '#1F2328',
        }}
      >
        <li>1. Нажмите "Share" в правом верхнем углу Figma</li>
        <li>2. Скопируйте ссылку и вставьте её в поле ниже</li>
      </ol>

      <FigmaHintMock />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label
          htmlFor="paste-url-input"
          id="paste-url-title"
          style={{
            font: '600 14px var(--font-sans, "IBM Plex Sans"), system-ui',
            color: '#1F2328',
          }}
        >
          Вставьте URL файла Figma
        </label>
        <input
          id="paste-url-input"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://www.figma.com/file/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            padding: '11px 14px',
            background: '#FFFFFF',
            border: `1.5px solid ${focused ? 'var(--color-accent)' : '#E5E7EB'}`,
            borderRadius: 10,
            font: '400 14px var(--font-sans, "IBM Plex Sans"), system-ui',
            color: '#1F2328',
            outline: 'none',
            boxShadow: focused
              ? '0 0 0 3px color-mix(in oklab, var(--color-accent) 18%, transparent)'
              : 'none',
            transition:
              'border-color 120ms cubic-bezier(.2,.7,.3,1), box-shadow 120ms cubic-bezier(.2,.7,.3,1)',
          }}
        />
        <span
          style={{
            font: '400 12px/16px var(--font-sans, "IBM Plex Sans"), system-ui',
            color: '#9CA3AF',
          }}
        >
          Эта ссылка нужна только для импорта прототипа — мы не делимся ей ни с кем.
        </span>
      </div>

      <div style={{ marginTop: 4 }}>
        <PrimaryCta
          label="Продолжить"
          onClick={() => onContinue(trimmed)}
          disabled={!canContinue}
        />
      </div>
    </main>
  );
}

// ─── Figma share-link hint (decorative) ──────────────────────────────────

function FigmaHintMock() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'relative',
        height: 110,
        background: '#DCEBFE',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {/* "Card" pseudo */}
      <div
        style={{
          position: 'absolute',
          top: 30,
          left: 30,
          right: 60,
          bottom: 30,
          background: '#FFFFFF',
          borderRadius: 6,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}
      />
      {/* Cursor pill — "Copy link" */}
      <div
        style={{
          position: 'absolute',
          top: 36,
          right: 50,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: '#FFFFFF',
          padding: '5px 10px',
          borderRadius: 6,
          font: '500 12px var(--font-sans, "IBM Plex Sans"), system-ui',
          color: '#2B7FFF',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
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
        >
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
        </svg>
        <span>Copy link</span>
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#6B7280"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ marginLeft: 4 }}
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </div>
      {/* Cursor arrow */}
      <span
        style={{
          position: 'absolute',
          right: 28,
          top: 60,
          width: 0,
          height: 0,
          borderTop: '14px solid #1F1F1F',
          borderLeft: '8px solid transparent',
          borderRight: '8px solid transparent',
          transform: 'rotate(-15deg)',
        }}
      />
    </div>
  );
}
