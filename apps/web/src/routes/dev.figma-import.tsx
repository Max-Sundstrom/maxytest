/**
 * DEV-only route `/dev/figma-import` — Plan 02-04 Task 3 (W-07 substitute).
 *
 * Mounts `<FigmaImportDialog>` standalone so the dialog can be exercised
 * end-to-end without polluting `BuilderShell` with a throwaway button. The
 * real user-visible CHECKPOINT A→B (with the actual `PrototypeEditor`
 * affordance) lives in Plan 02-06; this route is for the dev smoke loop only.
 *
 * In production builds, `beforeLoad` redirects away — `import.meta.env.DEV`
 * is `false` once Vite builds with `--mode production` (T-02-04-07 mitigation).
 */

import { useState } from 'react';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FigmaImportDialog } from '@/components/studies/FigmaImportDialog';

export const Route = createFileRoute('/dev/figma-import')({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: '/' });
    }
  },
  component: DevFigmaImportRoute,
});

function DevFigmaImportRoute() {
  const [studyId, setStudyId] = useState('');
  const [open, setOpen] = useState(false);
  const [completed, setCompleted] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-xl font-semibold">FigmaImportDialog (DEV-only)</h1>
      <p className="text-sm text-muted-foreground">
        Paste a study UUID you own, hit Open, then Import. This route does NOT exist in production
        builds.
      </p>

      <label htmlFor="dev-study-id" className="block text-sm font-medium">
        Study UUID
      </label>
      <Input
        id="dev-study-id"
        placeholder="11111111-1111-7111-8111-111111111111"
        value={studyId}
        onChange={(e) => setStudyId(e.target.value.trim())}
        autoComplete="off"
      />

      <Button onClick={() => setOpen(true)} disabled={!studyId}>
        Open FigmaImportDialog
      </Button>

      {completed && (
        <p className="text-sm">
          Imported: <code className="rounded bg-muted px-1 py-0.5 font-mono">{completed}</code>
        </p>
      )}

      <FigmaImportDialog
        open={open}
        onOpenChange={setOpen}
        studyId={studyId}
        onComplete={(pvId) => {
          setCompleted(pvId);
        }}
      />
    </div>
  );
}
