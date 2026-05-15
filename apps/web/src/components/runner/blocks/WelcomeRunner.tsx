/**
 * <WelcomeRunner> — Plan 01-05 Task 4 / UI-SPEC.md §"Runner block screens"
 *                  / BLK-01 / D-22 / D-24.
 *
 * The first screen every respondent sees (D-22 — always shown FIRST regardless
 * of resume state). Renders the designer's title + body + CTA button. The CTA
 * label defaults to "Start" but uses the designer-set `cta_label` from
 * block.content (welcomeContentSchema).
 *
 * On press, `onStart()` fires. RunnerShell's handler jumps to the resume
 * target (D-22: resume jumps AFTER pressing Start, never before).
 *
 * Tap-target compliance (D-24 / RUNNER-03): `min-h-touch min-w-touch` on the
 * CTA — both axes ≥44×44px.
 */

import { Button } from '@/components/ui/button';
import type { Block } from '@/lib/blocks/types';
import type { WelcomeContent } from '@/lib/blocks/schemas';

export interface WelcomeRunnerProps {
  block: Block;
  onStart: () => void;
}

export function WelcomeRunner({ block, onStart }: WelcomeRunnerProps) {
  const content = block.content as WelcomeContent;
  const ctaLabel = content.cta_label || 'Start';

  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <h1 className="mb-4 text-h1 font-semibold text-foreground">{content.title}</h1>
      {content.body && <p className="mb-8 text-body text-muted-foreground">{content.body}</p>}
      <Button
        type="button"
        variant="default"
        size="lg"
        className="min-h-touch min-w-touch mt-6 w-full max-w-xs"
        onClick={onStart}
      >
        {ctaLabel}
      </Button>
    </div>
  );
}
