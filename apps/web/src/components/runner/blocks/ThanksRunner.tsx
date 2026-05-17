/**
 * <ThanksRunner> — design-system v1 rewrite (2026-05-17).
 *
 * Terminal screen. Renders designer's title + body + a system-locked
 * "You can close this window" line.
 *
 * Visual:
 *   - centered column
 *   - 56×56 moss-tinted heart circle
 *   - 28/34 h1 title
 *   - 15/22 body
 *   - 13.5/18 muted close-window hint
 *
 * Behaviour:
 *   - onMounted fires ~100ms after mount so the progress bar can animate to
 *     100% BEFORE the completion mutation hits the network (same perceptual
 *     delay as Phase 1).
 *   - No CTA — the test is done; the close-window hint is informational.
 */

import { useEffect } from 'react';
import { Heart } from 'lucide-react';
import type { Block } from '@/lib/blocks/types';
import type { ThanksContent } from '@/lib/blocks/schemas';

export interface ThanksRunnerProps {
  block: Block;
  /** Fired ~100ms after mount; used by RunnerShell to complete the session. */
  onMounted: () => void;
}

export function ThanksRunner({ block, onMounted }: ThanksRunnerProps) {
  const content = block.content as ThanksContent;

  useEffect(() => {
    const t = window.setTimeout(() => {
      onMounted();
    }, 100);
    return () => window.clearTimeout(t);
  }, [block.id]);

  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        minHeight: 0,
        padding: '32px 24px 48px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        textAlign: 'center',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'color-mix(in oklab, var(--color-accent) 18%, var(--bg-card))',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--color-accent)',
        }}
      >
        <Heart size={26} strokeWidth={1.5} fill="currentColor" />
      </span>
      <h1
        style={{
          font: '500 28px/34px var(--font-sans)',
          color: 'var(--text-1)',
          letterSpacing: '-0.005em',
          margin: 0,
        }}
      >
        {content.title}
      </h1>
      {content.body ? (
        <p
          style={{
            font: '400 15px/22px var(--font-sans)',
            color: 'var(--text-1)',
            margin: 0,
            maxWidth: 320,
          }}
        >
          {content.body}
        </p>
      ) : null}
      <p
        style={{
          font: '400 13.5px/18px var(--font-sans)',
          color: 'var(--text-3)',
          margin: '8px 0 0',
        }}
      >
        Можно закрыть вкладку — ответы уже сохранены.
      </p>
    </div>
  );
}
