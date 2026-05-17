/**
 * <AuthShell /> — centered single-column container used by every screen in
 * the magic-link flow (`/auth/login`, `/auth/sent`, `/auth/callback`,
 * `/auth/plugin-callback`).
 *
 * Source: design-system v1 — paper-0 bg, M-logo at top, IBM Plex pair,
 * single-column ~400px with vertical centering. No topbar / sidebar / chrome.
 *
 * Why an explicit shell instead of repeating inline styles: every auth screen
 * shares the same vertical centering + M-logo treatment, and the SkinPicker
 * lands in the root layout — so each screen is just `<AuthShell>...form...</AuthShell>`.
 */

import { MLogo } from '@/components/shared/MLogo';

export interface AuthShellProps {
  children: React.ReactNode;
}

export function AuthShell({ children }: AuthShellProps) {
  return (
    <main
      style={{
        minHeight: '100dvh',
        background: 'var(--bg-page)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ marginBottom: 32 }}>
          <MLogo size={40} />
        </div>
        {children}
      </div>
    </main>
  );
}
