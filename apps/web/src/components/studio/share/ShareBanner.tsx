/**
 * <ShareBanner /> — Plan 04-06 Task 6.
 *
 * Status banner shown at the top of <ReportShell /> main canvas (between
 * the topbar and the focused-block canvas) whenever a public-share
 * token exists and is active. Per CONTEXT.md §"Public report — explicit
 * banner": the designer should never lose track of the fact that this
 * report is publicly accessible.
 *
 * Click on the «Управление публикацией» button re-opens
 * <ShareSettingsDialog /> through the ReportShell-level state owner so
 * the designer reaches the same lifecycle UI from two entry points
 * (topbar primary button + banner secondary button).
 *
 * Returns null when `token.is_active` is false — revoked tokens stay in
 * the table for audit + REPORT-08 lifecycle guard, but the banner only
 * surfaces while the public surface is actually reachable.
 */
import { Eye } from 'lucide-react';
import type { ShareTokenRow } from '@/lib/queries/share-tokens';

export interface ShareBannerProps {
  token: ShareTokenRow;
  onOpenSettings: () => void;
}

export function ShareBanner({ token, onOpenSettings }: ShareBannerProps) {
  if (!token.is_active) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 16px',
        background: 'var(--bg-soft)',
        border: '1px solid var(--border-1)',
        borderRadius: 'var(--radius)',
        font: '400 13px/20px var(--font-sans)',
        color: 'var(--text-1)',
      }}
    >
      <Eye size={14} strokeWidth={1.5} aria-hidden="true" />
      <span>Этот отчёт виден всем, у кого есть ссылка.</span>
      <button
        type="button"
        onClick={onOpenSettings}
        style={{
          marginLeft: 'auto',
          height: 28,
          padding: '0 12px',
          background: 'transparent',
          border: '1px solid var(--border-1)',
          borderRadius: 'var(--radius)',
          font: '500 12px var(--font-sans)',
          color: 'var(--text-1)',
          cursor: 'pointer',
        }}
      >
        Управление публикацией
      </button>
    </div>
  );
}
