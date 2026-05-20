/**
 * <ShareReportButton /> — Plan 04-06 Task 6.
 *
 * Primary moss-accent button «Поделиться отчётом» that lives in the
 * <ReportTopbar /> right cluster (next to <CsvDownloadButton />). Clicking
 * opens <ShareSettingsDialog />, which owns the lifecycle UI surface
 * (create / revoke / rotate / per-block toggles).
 *
 * Visual contract:
 *   - 32px height, --color-accent fill, --text-on-accent foreground
 *     (token shipped by Plan 04-04 Task 7).
 *   - Share2 lucide icon at 14px stroke 1.5.
 *   - Russian copy: «Поделиться отчётом».
 *
 * State scope: this component owns the dialog open/close state for the
 * topbar entry point. <ShareBanner /> below the topbar opens the SAME
 * dialog via ReportShell-level state; the two dialog instances are
 * functionally equivalent because they both query the same
 * `useShareToken(studyId)` row through TanStack cache.
 */
import { useState } from 'react';
import { Share2 } from 'lucide-react';
import type { Block } from '@/lib/blocks/types';
import { ShareSettingsDialog } from './ShareSettingsDialog';

export interface ShareReportButtonProps {
  studyId: string;
  studyTitle: string;
  blocks: readonly Block[];
}

export function ShareReportButton({ studyId, studyTitle, blocks }: ShareReportButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Поделиться отчётом"
        style={{
          height: 32,
          padding: '0 16px',
          background: 'var(--color-accent)',
          color: 'var(--text-on-accent)',
          border: 'none',
          borderRadius: 'var(--radius)',
          font: '500 13px var(--font-sans)',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          transition: 'filter 120ms cubic-bezier(.2,.7,.3,1)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.filter = 'brightness(0.95)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.filter = 'none';
        }}
      >
        <Share2 size={14} strokeWidth={1.5} />
        Поделиться отчётом
      </button>
      {open && (
        <ShareSettingsDialog
          open={open}
          onOpenChange={setOpen}
          studyId={studyId}
          studyTitle={studyTitle}
          blocks={blocks}
        />
      )}
    </>
  );
}
