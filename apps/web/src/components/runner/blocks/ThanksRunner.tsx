/**
 * <ThanksRunner> — Plan 01-05 Task 4 / UI-SPEC.md §"Runner block screens"
 *                 + §"Copy Lock" Runner.
 *
 * The terminal screen. Renders the designer's title + body and a system-added
 * closing line ("You can close this window.") — the closing line is LOCKED
 * and not designer-editable in Phase 1 per UI-SPEC.
 *
 * On mount: useEffect fires `onMounted()` after a 100ms delay so the progress
 * bar has a frame to animate to 100% before the completion mutation hits the
 * network. The 100ms is perceptual, not load-bearing — the bar would
 * eventually reach 100% anyway, but visually it's nicer for the bar to fill
 * BEFORE the network request.
 *
 * No CTA: the test is done; there's nothing left to do but close.
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
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <Heart className="mb-4 size-12 text-accent" aria-hidden="true" fill="currentColor" />
      <h1 className="mb-4 text-h1 font-semibold text-foreground">{content.title}</h1>
      {content.body && <p className="mb-4 text-body text-muted-foreground">{content.body}</p>}
      <p className="text-body text-muted-foreground">You can close this window.</p>
    </div>
  );
}
