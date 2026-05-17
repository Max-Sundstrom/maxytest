/**
 * <AppTopbar /> — top bar shared by `/app` and other authenticated screens
 * that don't have the builder's 2-row crumb.
 *
 * Source: handoff `js/maxitest-list.jsx` header + index.html `.mx-top-list`
 * (lines 360-365). Padding 14px 32px, transparent over `--bg-page`, no
 * bottom border. Right cluster: optional Help button + 36px settings icon-btn.
 *
 * The builder/report 2-row variant with crumb + document tabs ships separately
 * as <BuilderTopbar /> in Plan 02.3-03.
 */

import { Info, Settings } from 'lucide-react';
import { MLogo } from './MLogo';
import { UserAvatarMenu } from './UserAvatarMenu';

export interface AppTopbarProps {
  onHelp?: () => void;
  onSettings?: () => void;
  /**
   * Slot for additional right-side controls before the avatar. Avatar always
   * pins at the far right via <UserAvatarMenu /> unless `hideAvatar` is set.
   */
  rightSlot?: React.ReactNode;
  hideAvatar?: boolean;
}

export function AppTopbar({ onHelp, onSettings, rightSlot, hideAvatar = false }: AppTopbarProps) {
  return (
    <header
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-page)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 32px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MLogo size={32} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {rightSlot}
          {onHelp ? (
            <button
              type="button"
              onClick={onHelp}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: 'transparent',
                border: 0,
                padding: '8px 10px',
                borderRadius: 'var(--radius)',
                color: 'var(--text-1)',
                fontSize: 13.5,
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  border: '1.5px solid currentColor',
                  display: 'grid',
                  placeItems: 'center',
                  color: 'var(--text-2)',
                }}
              >
                <Info size={11} strokeWidth={1.5} />
              </span>
              <span>Помощь</span>
            </button>
          ) : null}
          {onSettings ? (
            <button
              type="button"
              onClick={onSettings}
              aria-label="settings"
              style={{
                width: 36,
                height: 36,
                display: 'grid',
                placeItems: 'center',
                background: 'transparent',
                border: 0,
                borderRadius: 'var(--radius)',
                color: 'var(--text-2)',
                cursor: 'pointer',
                transition:
                  'background 120ms cubic-bezier(.2,.7,.3,1), color 120ms cubic-bezier(.2,.7,.3,1)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-chip)';
                e.currentTarget.style.color = 'var(--text-1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-2)';
              }}
            >
              <Settings size={16} strokeWidth={1.5} />
            </button>
          ) : null}
          {!hideAvatar ? <UserAvatarMenu /> : null}
        </div>
      </div>
    </header>
  );
}
