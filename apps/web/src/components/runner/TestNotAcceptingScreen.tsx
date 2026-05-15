/**
 * <TestNotAcceptingScreen> — Plan 01-05 Task 3 / UI-SPEC.md §"Runner block screens"
 *                          / D-19.
 *
 * Rendered by the runner route when the resolved study has a valid run_token
 * but a `status` that does not currently accept new sessions (archived or
 * — defensively — draft). The copy is LOCKED per UI-SPEC §Copy Lock.
 *
 * No CTA: the only escape route is a new URL. We deliberately don't suggest
 * "contact the test creator" with a mailto, etc., because anonymous respondents
 * shouldn't have to know that surface to abandon.
 */

import { CircleSlash2 } from 'lucide-react';

export function TestNotAcceptingScreen() {
  return (
    <div
      className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8"
      role="alert"
    >
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        <CircleSlash2 className="mb-4 size-12 text-muted-foreground" aria-hidden="true" />
        <h1 className="mb-2 text-h1 font-semibold">
          {"This test isn't accepting responses right now."}
        </h1>
        <p className="text-body text-muted-foreground">
          Contact the test creator for an updated link.
        </p>
      </div>
    </div>
  );
}
