/**
 * <MobileBuilderBlocked> — Plan 01-03 Task 5 / UI-SPEC.md §"Component Contracts".
 *
 * Fullscreen card shown by `<BuilderShell>` when viewport width < 1024px.
 * UI-SPEC copy is locked: "Open this on desktop to edit tests".
 */

import { Monitor } from 'lucide-react';

export function MobileBuilderBlocked() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4">
      <div className="mx-auto max-w-md text-center">
        <Monitor
          aria-hidden="true"
          className="mx-auto mb-6 size-12 text-muted-foreground"
        />
        <h1 className="mb-2 text-h1 font-semibold tracking-tight text-foreground">
          Open this on desktop to edit tests
        </h1>
        <p className="text-body text-muted-foreground">
          The test builder needs more room. Mobile is for taking tests, not
          building them.
        </p>
      </div>
    </div>
  );
}
