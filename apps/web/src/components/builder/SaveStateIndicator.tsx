/**
 * <SaveStateIndicator> — Plan 01-03 Task 7 / UI-SPEC.md §"<SaveStateIndicator>".
 *
 * Six states, each with the locked copy + aria attributes per UI-SPEC.md:
 *   idle | dirty | saving | saved | conflict | error
 *
 * `saved` re-renders every 15s so the relative-time string ticks ("2s ago" →
 * "17s ago" → "1m ago"). After 1 hour `formatRelativeTime` collapses to
 * "Saved" only per UI-SPEC copy lock.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn, formatRelativeTime } from '@/lib/utils';

export type SaveState =
  | 'idle'
  | 'dirty'
  | 'saving'
  | 'saved'
  | 'conflict'
  | 'error';

export interface SaveStateIndicatorProps {
  state: SaveState;
  lastSavedAt?: Date | null;
  onRetry?: () => void;
  className?: string;
}

export function SaveStateIndicator({
  state,
  lastSavedAt,
  onRetry,
  className,
}: SaveStateIndicatorProps) {
  // Tick every 15s so the relative time string stays fresh.
  const [, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (state !== 'saved') return;
    const interval = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(interval);
  }, [state]);

  if (state === 'idle') {
    return null;
  }

  if (state === 'dirty') {
    return (
      <span
        aria-label="Unsaved changes"
        className={cn('flex items-center gap-1.5', className)}
      >
        <span className="size-1.5 rounded-full bg-slate-400" aria-hidden="true" />
      </span>
    );
  }

  if (state === 'saving') {
    return (
      <span
        role="status"
        aria-live="polite"
        className={cn(
          'flex items-center gap-2 text-caption text-muted-foreground',
          className,
        )}
      >
        <span
          className="size-1.5 animate-pulse rounded-full bg-slate-400"
          aria-hidden="true"
        />
        Saving…
      </span>
    );
  }

  if (state === 'saved') {
    const relative = lastSavedAt ? formatRelativeTime(lastSavedAt) : null;
    return (
      <span
        role="status"
        aria-live="polite"
        className={cn(
          'flex items-center gap-2 text-caption text-muted-foreground tabular-nums',
          className,
        )}
      >
        <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
        {relative === 'Saved' || !relative ? 'Saved' : `Saved ${relative}`}
      </span>
    );
  }

  if (state === 'conflict') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="status"
            className={cn(
              'flex items-center gap-2 text-caption text-warning',
              className,
            )}
          >
            <AlertTriangle aria-hidden="true" className="size-3.5" />
            Edited elsewhere
          </span>
        </TooltipTrigger>
        <TooltipContent>
          This block was edited in another window. Resolve to continue.
        </TooltipContent>
      </Tooltip>
    );
  }

  // error
  return (
    <span
      role="alert"
      aria-live="assertive"
      className={cn(
        'flex items-center gap-2 text-caption text-destructive',
        className,
      )}
    >
      <XCircle aria-hidden="true" className="size-3.5" />
      Couldn&rsquo;t save
      {onRetry && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 py-1 text-caption"
          onClick={onRetry}
        >
          <Loader2 className="mr-1 size-3" aria-hidden="true" />
          Retry
        </Button>
      )}
    </span>
  );
}
