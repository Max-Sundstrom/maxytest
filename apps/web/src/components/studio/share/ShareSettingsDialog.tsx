/**
 * <ShareSettingsDialog /> — Plan 04-06 Task 6 (D-100, D-101, REPORT-07).
 *
 * Modal dialog that owns the public-share lifecycle UI:
 *   - Status pill ( «Опубликовано» / «Не опубликовано» )
 *   - URL-copy field (only when a token has been created)
 *   - Per-block open-answer visibility toggles (REPORT-07; default OFF)
 *   - Two lifecycle buttons:
 *       «Отозвать» / «Активировать»  — toggles is_active
 *       «Снять и выдать новую»       — atomic revoke + create (rotate)
 *
 * "Open-answer-eligible" blocks (the list the visibility toggles render
 * for) per CONTEXT.md REPORT-07:
 *   - open_question — always eligible.
 *   - choice with hasOtherOption=true — the «Другое» free-form field.
 *   - context with role_question.enabled=true — free-form role label.
 *
 * All copy is Russian (CLAUDE.md user-language rule). All colors come from
 * CSS variables; --text-on-accent + --color-accent are shipped by Plan
 * 04-04 Task 7 and need no fallback.
 */
import { useMemo, useState } from 'react';
import { Ban, Copy, RotateCw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useCreateShareToken,
  useRevokeShareToken,
  useRotateShareToken,
  useShareToken,
  useUpdateShareTokenVisibility,
} from '@/lib/queries/share-tokens';
import type { Block } from '@/lib/blocks/types';

export interface ShareSettingsDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  studyId: string;
  studyTitle: string;
  blocks: readonly Block[];
}

/**
 * Predicate: does this block carry a free-text "open answer" surface that
 * the designer might want to hide from public viewers? Mirrors REPORT-07.
 */
function isOpenAnswerEligible(b: Block): boolean {
  if (b.type === 'open_question') return true;
  if (b.type === 'choice') {
    const content = b.content as { hasOtherOption?: boolean } | undefined;
    return content?.hasOtherOption === true;
  }
  if (b.type === 'context') {
    const content = b.content as { role_question?: { enabled?: boolean } } | undefined;
    return content?.role_question?.enabled === true;
  }
  return false;
}

/**
 * Russian label for the block type displayed in the toggle row. Stays in
 * sync with the BlockTypeChip vocabulary; if a new open-answer-eligible
 * type is added, drop a case here.
 */
function blockTypeLabelRu(type: Block['type']): string {
  switch (type) {
    case 'open_question':
      return 'Открытый вопрос';
    case 'choice':
      return 'Выбор';
    case 'context':
      return 'Контекст';
    default:
      return type;
  }
}

export function ShareSettingsDialog({
  open,
  onOpenChange,
  studyId,
  studyTitle: _studyTitle,
  blocks,
}: ShareSettingsDialogProps) {
  const tokenQ = useShareToken(studyId);
  const createT = useCreateShareToken();
  const revokeT = useRevokeShareToken();
  const rotateT = useRotateShareToken();
  const updateV = useUpdateShareTokenVisibility();

  const [copied, setCopied] = useState(false);

  const token = tokenQ.data ?? null;
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const shareUrl = token ? `${baseUrl}/share/${token.token}` : '';

  const openAnswerBlocks = useMemo(() => blocks.filter(isOpenAnswerEligible), [blocks]);
  const visibility = token?.open_answer_visibility ?? {};

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be denied in self-host / non-https; fall back to
      // select-on-click on the input below (browser default).
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ maxWidth: 560 }}>
        <DialogHeader>
          <DialogTitle>Поделиться отчётом</DialogTitle>
        </DialogHeader>

        {/* Status pill row */}
        <div
          style={{
            padding: '12px 0 4px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: token?.is_active ? 'var(--color-success)' : 'var(--text-3)',
            }}
          />
          <span style={{ font: '500 13px var(--font-sans)', color: 'var(--text-1)' }}>
            {token?.is_active ? 'Опубликовано' : 'Не опубликовано'}
          </span>
        </div>

        {/* Empty state — token has never been created */}
        {!token && (
          <div style={{ padding: '8px 0 16px' }}>
            <p
              style={{
                font: '400 14px/22px var(--font-sans)',
                color: 'var(--text-2)',
                marginBottom: 16,
              }}
            >
              Создайте публичную ссылку — её можно открыть в любом браузере без входа. В публичном
              виде показаны только сводные графики, без таблицы ответов и плеера.
            </p>
            <button
              type="button"
              onClick={() => createT.mutate({ studyId })}
              disabled={createT.isPending}
              style={{
                height: 32,
                padding: '0 16px',
                background: 'var(--color-accent)',
                color: 'var(--text-on-accent)',
                border: 'none',
                borderRadius: 'var(--radius)',
                font: '500 13px var(--font-sans)',
                cursor: createT.isPending ? 'wait' : 'pointer',
                opacity: createT.isPending ? 0.7 : 1,
              }}
            >
              {createT.isPending ? 'Создаём…' : 'Создать публичную ссылку'}
            </button>
          </div>
        )}

        {/* URL + Copy */}
        {token && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input
              readOnly
              value={shareUrl}
              onClick={(e) => e.currentTarget.select()}
              style={{
                flex: 1,
                height: 32,
                padding: '0 12px',
                background: 'var(--bg-soft)',
                border: '1px solid var(--border-1)',
                borderRadius: 'var(--radius)',
                font: '400 13px var(--font-mono)',
                color: 'var(--text-1)',
              }}
            />
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Скопировать ссылку"
              style={{
                height: 32,
                padding: '0 12px',
                background: 'transparent',
                border: '1px solid var(--border-1)',
                borderRadius: 'var(--radius)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                color: 'var(--text-1)',
                font: '500 12px var(--font-sans)',
              }}
            >
              <Copy size={14} strokeWidth={1.5} />
              {copied ? 'Скопировано' : 'Копировать'}
            </button>
          </div>
        )}

        {/* Per-block open-answer visibility toggles (REPORT-07) */}
        {token && openAnswerBlocks.length > 0 && (
          <section
            style={{
              marginTop: 20,
              paddingTop: 16,
              borderTop: '1px solid var(--border-1)',
            }}
          >
            <h4
              style={{
                font: '500 13px var(--font-sans)',
                color: 'var(--text-1)',
                marginBottom: 8,
              }}
            >
              Показывать открытые ответы публично
            </h4>
            <p
              style={{
                font: '400 13px/20px var(--font-sans)',
                color: 'var(--text-3)',
                marginBottom: 12,
              }}
            >
              По умолчанию открытые ответы скрыты для зрителей. Включайте только для блоков, где вы
              уверены, что в ответах нет личной информации.
            </p>
            {openAnswerBlocks.map((b) => (
              <label
                key={b.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px 0',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={visibility[b.id] === true}
                  onChange={(e) =>
                    updateV.mutate({
                      token: token.token,
                      studyId,
                      visibility: { ...visibility, [b.id]: e.target.checked },
                    })
                  }
                />
                <span style={{ font: '400 14px var(--font-sans)', color: 'var(--text-1)' }}>
                  {blockTypeLabelRu(b.type)} · #{b.position}
                </span>
              </label>
            ))}
          </section>
        )}

        {/* Lifecycle actions: Revoke/Reactivate + Rotate */}
        {token && (
          <DialogFooter
            style={{
              marginTop: 20,
              display: 'flex',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={() =>
                revokeT.mutate({
                  token: token.token,
                  studyId,
                  reactivate: !token.is_active,
                })
              }
              disabled={revokeT.isPending}
              style={{
                height: 32,
                padding: '0 16px',
                background: 'transparent',
                border: '1px solid var(--border-1)',
                borderRadius: 'var(--radius)',
                cursor: revokeT.isPending ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                color: 'var(--text-1)',
                font: '500 12px var(--font-sans)',
              }}
            >
              <Ban size={14} strokeWidth={1.5} />
              {token.is_active ? 'Отозвать' : 'Активировать'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    'Старая ссылка перестанет работать. Создать новую публичную ссылку?',
                  )
                ) {
                  rotateT.mutate({ oldToken: token.token, studyId });
                }
              }}
              disabled={rotateT.isPending}
              style={{
                height: 32,
                padding: '0 16px',
                background: 'var(--bg-soft)',
                border: '1px solid var(--border-1)',
                borderRadius: 'var(--radius)',
                cursor: rotateT.isPending ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                color: 'var(--text-1)',
                font: '500 12px var(--font-sans)',
              }}
            >
              <RotateCw size={14} strokeWidth={1.5} />
              Снять и выдать новую
            </button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
