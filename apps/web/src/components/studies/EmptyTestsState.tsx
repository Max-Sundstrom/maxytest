/**
 * <EmptyTestsState> — Plan 01-03 Task 4 / UI-SPEC.md §"Component Contracts".
 *
 * Centred empty state with locked CTA "Create your first test (60s)".
 * The CTA triggers `useCreateStudy` which seeds welcome + thanks via the
 * `create_study` RPC (BUILDER-01).
 */

import { ClipboardList, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface EmptyTestsStateProps {
  onCreate: () => void;
  isPending?: boolean;
}

export function EmptyTestsState({ onCreate, isPending }: EmptyTestsStateProps) {
  return (
    <section className="mx-auto max-w-[480px] py-16 text-center">
      <div className="mb-6 rounded-2xl bg-surface p-12">
        <ClipboardList
          aria-hidden="true"
          className="mx-auto size-12 text-muted-foreground"
        />
      </div>
      <h1 className="mb-2 text-display font-bold tracking-tight text-foreground">
        No tests yet
      </h1>
      <p className="mb-8 text-body text-muted-foreground">
        Start with a 3-block test and publish in under a minute.
      </p>
      <Button
        size="lg"
        variant="default"
        onClick={onCreate}
        disabled={isPending}
        aria-busy={isPending || undefined}
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Creating…
          </>
        ) : (
          'Create your first test (60s)'
        )}
      </Button>
    </section>
  );
}
