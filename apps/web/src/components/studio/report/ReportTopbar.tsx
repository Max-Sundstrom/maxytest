/**
 * <ReportTopbar /> — 2-row top bar for `/studies/$id/report`.
 *
 * Source: design-system handoff `js/maxitest-report.jsx` header + ADDENDUM-v3
 * §1 "Report screen". Same 2-row geometry as BuilderTopbar (M-logo + 2-line
 * crumb above; document-tabs Тест/Привлечь/Отчёт below) but:
 *   - Report tab is active (lifts forward via bg-page)
 *   - Crumb meta shows `N блоков · K ответов · обновлено только что`
 *   - Right cluster: Download + Share icon buttons (no Publish pill)
 *   - Report tab carries a sky-accent badge with the response count
 *
 * Re-uses MLogo + UserAvatarMenu from the shared shell so the visual lockstep
 * with /app and /studies/$id/edit holds.
 */

import { Download, Share2 } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { MLogo } from '@/components/shared/MLogo';
import { UserAvatarMenu } from '@/components/shared/UserAvatarMenu';
import { useStudy } from '@/lib/queries/studies';

type LooseNavigate = (opts: { to: string; params?: Record<string, string> }) => unknown;

export interface ReportTopbarProps {
  studyId: string;
  blockCount: number;
  responseCount: number;
}

export function ReportTopbar({ studyId, blockCount, responseCount }: ReportTopbarProps) {
  const studyQuery = useStudy(studyId);
  const study = studyQuery.data;
  const navigate = useNavigate() as unknown as LooseNavigate;

  return (
    <header
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-sidebar)',
      }}
    >
      {/* Row 1 — crumb + chrome (56px) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 56,
          padding: '0 20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          <button
            type="button"
            onClick={() => navigate({ to: '/app' })}
            aria-label="К списку тестов"
            style={{
              background: 'transparent',
              border: 0,
              padding: 0,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <MLogo size={32} />
          </button>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              minWidth: 0,
              paddingLeft: 4,
            }}
          >
            <span
              style={{
                font: '500 14px/18px var(--font-sans)',
                color: 'var(--text-1)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {study?.title ?? 'Untitled test'}
            </span>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                font: '400 12px/16px var(--font-sans)',
                color: 'var(--text-3)',
                whiteSpace: 'nowrap',
              }}
            >
              <span>{blockCount} блоков</span>
              <span style={{ opacity: 0.5 }}>·</span>
              <span>{responseCount} ответов</span>
              <span style={{ opacity: 0.5 }}>·</span>
              <span>обновлено только что</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconBtn aria-label="Скачать отчёт" onClick={() => toast.info('Экспорт CSV — Phase 4.')}>
            <Download size={15} strokeWidth={1.5} />
          </IconBtn>
          <IconBtn
            aria-label="Поделиться публичной ссылкой"
            onClick={() => toast.info('Публичные ссылки отчёта — Phase 4.')}
          >
            <Share2 size={15} strokeWidth={1.5} />
          </IconBtn>
          <UserAvatarMenu />
        </div>
      </div>

      {/* Row 2 — document tabs */}
      <div
        style={{
          display: 'flex',
          gap: 2,
          padding: '0 12px',
          alignItems: 'flex-end',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <DocTab
          active={false}
          onClick={() => navigate({ to: '/studies/$id/edit', params: { id: studyId } })}
        >
          Тест
        </DocTab>
        <DocTab active={false} onClick={() => toast.info('Привлечение респондентов — Phase 6.')}>
          Привлечь респондентов
        </DocTab>
        <DocTab active badge={responseCount > 0 ? String(responseCount) : undefined}>
          Отчёт
        </DocTab>
      </div>
    </header>
  );
}

// ─── Sub-components (kept inline since they're only used here + Builder) ──

interface DocTabProps {
  active?: boolean;
  badge?: string;
  onClick?: () => void;
  children: React.ReactNode;
}

function DocTab({ active, badge, onClick, children }: DocTabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 40,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 18px',
        background: active ? 'var(--bg-page)' : 'transparent',
        border: 0,
        borderRadius: 'var(--radius) var(--radius) 0 0',
        color: active ? 'var(--text-1)' : 'var(--text-2)',
        font: `${active ? 500 : 400} 13px var(--font-sans)`,
        cursor: 'pointer',
        position: 'relative',
        transition:
          'background 120ms cubic-bezier(.2,.7,.3,1), color 120ms cubic-bezier(.2,.7,.3,1)',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'color-mix(in oklab, var(--bg-page) 50%, transparent)';
          e.currentTarget.style.color = 'var(--text-1)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--text-2)';
        }
      }}
    >
      <span>{children}</span>
      {badge ? (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 16,
            minWidth: 16,
            padding: '0 5px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-accent-3)',
            color: '#fff',
            font: '500 10px var(--font-mono)',
          }}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

interface IconBtnProps {
  children: React.ReactNode;
  onClick?: () => void;
  'aria-label': string;
}

function IconBtn({ children, onClick, ...props }: IconBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 32,
        height: 32,
        display: 'grid',
        placeItems: 'center',
        background: 'transparent',
        border: 0,
        borderRadius: 'var(--radius)',
        color: 'var(--text-2)',
        cursor: 'pointer',
        transition: 'background 120ms cubic-bezier(.2,.7,.3,1)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-chip)';
        e.currentTarget.style.color = 'var(--text-1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--text-2)';
      }}
      {...props}
    >
      {children}
    </button>
  );
}
