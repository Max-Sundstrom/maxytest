// apps/plugin/src/components/ChoosePrototypeView.tsx — handoff Screen 02 "Choose prototype".
//
// Source: handoff `maxitest-plugin.jsx` <PluginChoose /> + .fp-row-toggle /
// .fp-proto-row CSS.
//
// Layout (white plugin body, 20px padding, 14px gaps):
//   - Stepper [2/2] active=2, back-nav to screen 1 via onBack
//   - Optimize-images toggle row (title + helper sub-copy + Toggle right)
//   - "Выберите прототип для импорта" bold label + 1+ proto rows
//   - Footer help-pill via HelpPill (pinned at bottom via margin-top:auto)
//
// Proto rows: list of named prototype frames discovered from the share-link
// (Plan 02.2-07 will replace the placeholder array with real frames pulled
// from the worker REST or plugin sandbox). Each row has a name + 36px "sm"
// pill CTA "Импортировать".

import { useState } from 'react';

import HelpPill from './HelpPill';
import Stepper from './Stepper';
import Toggle from './Toggle';

interface PrototypeChoice {
  /** Stable id for the import RPC (Plan 02.2-07 contract). */
  id: string;
  /** Display name shown in the row — taken from the Figma file/page. */
  name: string;
}

interface ChoosePrototypeViewProps {
  prototypes: PrototypeChoice[];
  onBack: () => void;
  onImport: (proto: PrototypeChoice, optimizeImages: boolean) => void;
  onHelp: () => void;
}

const STEP_LABELS: [string, string] = ['Вставьте URL', 'Выберите прототип'];

export default function ChoosePrototypeView({
  prototypes,
  onBack,
  onImport,
  onHelp,
}: ChoosePrototypeViewProps) {
  const [optimize, setOptimize] = useState(true);

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
      <Stepper active={2} labels={STEP_LABELS} onBack={onBack} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 16,
          alignItems: 'flex-start',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div
            style={{
              font: '500 14px var(--font-sans, "IBM Plex Sans"), system-ui',
              color: '#1F2328',
            }}
          >
            Оптимизировать изображения
          </div>
          <div
            style={{
              font: '400 13px/18px var(--font-sans, "IBM Plex Sans"), system-ui',
              color: '#6B7280',
            }}
          >
            Когда включено, мы автоматически оптимизируем изображения, чтобы ускорить загрузку
            прототипа на устройстве респондента.
          </div>
        </div>
        <Toggle checked={optimize} onChange={setOptimize} aria-label="Оптимизировать изображения" />
      </div>

      <label
        style={{
          font: '600 14px var(--font-sans, "IBM Plex Sans"), system-ui',
          color: '#1F2328',
          marginTop: 6,
        }}
      >
        Выберите прототип для импорта
      </label>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {prototypes.length === 0 ? (
          <div
            style={{
              padding: '16px',
              background: '#F4F4F5',
              borderRadius: 12,
              font: '400 13.5px/19px var(--font-sans, "IBM Plex Sans"), system-ui',
              color: '#6B7280',
              textAlign: 'center',
            }}
          >
            В этом файле не нашёл готовых прототипов. Убедись, что в Figma проставлены связи между
            фреймами.
          </div>
        ) : (
          prototypes.map((p) => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                padding: '12px 16px',
                background: '#FFFFFF',
                border: '1px solid #E5E7EB',
                borderRadius: 12,
              }}
            >
              <span
                style={{
                  font: '500 15px var(--font-sans, "IBM Plex Sans"), system-ui',
                  color: '#1F2328',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.name}
              </span>
              <button
                type="button"
                onClick={() => onImport(p, optimize)}
                style={{
                  height: 36,
                  padding: '0 16px',
                  background: 'var(--color-accent)',
                  color: '#FFFFFF',
                  border: 0,
                  borderRadius: 999,
                  font: '500 13px var(--font-sans, "IBM Plex Sans"), system-ui',
                  cursor: 'pointer',
                  transition: 'filter 120ms cubic-bezier(.2,.7,.3,1)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.05)')}
                onMouseLeave={(e) => (e.currentTarget.style.filter = 'none')}
              >
                Импортировать
              </button>
            </div>
          ))
        )}
      </div>

      <HelpPill onClick={onHelp} />
    </main>
  );
}
