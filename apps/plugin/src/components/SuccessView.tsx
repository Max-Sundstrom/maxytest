// apps/plugin/src/components/SuccessView.tsx — Phase 02.2 Plan 07 Task 3.
//
// Screen S4 (UI-SPEC §"Screen S4 — Success" + Component Inventory #9).
// Replaces the design-system v1 paste-url stub of this component — the
// real Plan 07 success contract is a deep-link CTA, not a share code
// because the plugin path creates the study itself and hands the user
// a clickable link back into Maxytest.
//
// Layout:
//   - Top-right: SignOutMenu (still accessible per UI-SPEC §"Focus order").
//   - Top-left: "← Назад" SecondaryPill that resets to S2 picker.
//   - Card (8px radius lock):
//       - 50×50 outline check-circle (accent stroke).
//       - "Опубликовано" — 20/600 centered.
//       - "{flowName}" — 14/600 centered.
//       - "{framesCount} {frameWord(framesCount)} · {hotspotsCount} hotspots"
//         — 12/400 muted centered.
//       - PrimaryCta "Open in Maxytest →" inside card-inner-width.
//   - Replay note (if replayed): "Эта публикация уже была сохранена…"
//   - Warning paragraph: "! Важно: Если вы внесёте изменения в прототип
//     в Figma, нужно опубликовать заново — иначе респонденты увидят
//     прежнюю версию."
//
// Open-deeplink mechanism: clicking the CTA posts `open-external` IPC to
// the sandbox, which calls `figma.openExternal(deepLinkUrl)` synchronously
// (Pitfall 3 — the CTA click IS the user-gesture, so the IPC must fire
// before any await).

import { frameWord } from '../lib/ui/plural';

import PrimaryCta from './PrimaryCta';
import SignOutMenu from './SignOutMenu';

interface SuccessViewProps {
  flowName: string;
  framesCount: number;
  hotspotsCount: number;
  /** True when the RPC returned an existing prototype (idempotent replay).
   *  UI shows an extra "уже сохранена" note above the warning. */
  replayed: boolean;
  /** Full `${VIEWER_URL}/studies/${study_id}/edit` URL. */
  deepLinkUrl: string;
  onOpen: () => void;
  onBack: () => void;
  onSignOut: () => void;
}

export default function SuccessView({
  flowName,
  framesCount,
  hotspotsCount,
  replayed,
  onOpen,
  onBack,
  onSignOut,
}: SuccessViewProps) {
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
        position: 'relative',
      }}
    >
      <div style={{ position: 'absolute', top: 12, right: 12 }}>
        <SignOutMenu onSignOut={onSignOut} />
      </div>

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
          borderRadius: 8,
          border: '1px solid var(--border-1)',
          background: '#FFFFFF',
          color: 'var(--text-1)',
          font: '500 13px var(--font-sans, "IBM Plex Sans"), system-ui',
          cursor: 'pointer',
          transition: 'border-color 120ms cubic-bezier(.2,.7,.3,1)',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-1)')}
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
          aria-hidden="true"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
        <span>Назад</span>
      </button>

      <section
        role="region"
        aria-label="Публикация завершена"
        style={{
          background: 'var(--color-success-bg)',
          border: '1px solid var(--border-1)',
          borderRadius: 8,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        <svg width="50" height="50" viewBox="0 0 50 50" fill="none" aria-hidden="true">
          <circle
            cx="25"
            cy="25"
            r="23"
            stroke="var(--color-success)"
            strokeWidth="2.5"
            fill="none"
          />
          <path
            d="M15 26 L22 33 L36 17"
            stroke="var(--color-success)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
        <h2
          style={{
            font: '600 20px var(--font-sans, "IBM Plex Sans"), system-ui',
            color: 'var(--text-1)',
            margin: 0,
            marginTop: 8,
          }}
        >
          Опубликовано
        </h2>
        <div
          style={{
            font: '600 14px var(--font-sans, "IBM Plex Sans"), system-ui',
            color: 'var(--text-1)',
            textAlign: 'center',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: '100%',
            whiteSpace: 'nowrap',
          }}
        >
          {flowName}
        </div>
        <div
          style={{
            font: '400 12px var(--font-sans, "IBM Plex Sans"), system-ui',
            color: 'var(--text-2)',
            textAlign: 'center',
          }}
        >
          {framesCount} {frameWord(framesCount)} · {hotspotsCount} hotspots
        </div>
        <div style={{ marginTop: 16, width: '100%' }}>
          <PrimaryCta label="Open in Maxytest →" onClick={onOpen} />
        </div>
      </section>

      {replayed && (
        <p
          style={{
            font: '400 12px/18px var(--font-sans, "IBM Plex Sans"), system-ui',
            color: 'var(--text-2)',
            margin: 0,
            padding: '0 4px',
            textAlign: 'center',
          }}
        >
          Эта публикация уже была сохранена — повторение не создало дубликата.
        </p>
      )}

      <p
        role="note"
        style={{
          font: '400 12px/18px var(--font-sans, "IBM Plex Sans"), system-ui',
          color: 'var(--text-2)',
          margin: 0,
          padding: '0 4px',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            color: 'var(--color-warning-mark)',
            fontWeight: 700,
            marginRight: 4,
          }}
          aria-hidden="true"
        >
          !
        </span>
        <b style={{ color: 'var(--text-1)', fontWeight: 600 }}>Важно:</b> если вы внесёте изменения
        в прототип в Figma, нужно опубликовать заново — иначе респонденты увидят прежнюю версию.
      </p>
    </main>
  );
}
