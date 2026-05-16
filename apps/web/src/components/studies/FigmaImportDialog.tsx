/**
 * <FigmaImportDialog> — Plan 02-04 Task 1.
 *
 * Controlled shadcn Dialog that drives the Figma-import flow end-to-end:
 *
 *   1. Designer pastes a Figma share link + Personal Access Token (PAT).
 *   2. Client-side validation runs against `parseFigmaShareLink` (Plan 02-01)
 *      so we never ping the Edge Function with garbage URLs.
 *   3. On Import: `useImportPrototype` (Plan 02-03) invokes the
 *      `figma-import-worker` Edge Function. The PAT crosses HTTPS exactly once
 *      and is NEVER persisted — it lives ONLY in this component's React state
 *      and is zeroed by the close `useEffect` (D-02b lifecycle, CONTEXT §4.3).
 *   4. After mutation success the dialog subscribes to
 *      `useImportJob(import_id)` for Realtime progress (frames_done /
 *      frames_total + status pill).
 *   5. On terminal `done|partial`, surfaces a "Use this prototype" CTA that
 *      passes `prototype_version_id` to the parent via `onComplete`.
 *
 * Soft-cap: a 50-frame warning is displayed BEFORE the import starts (D-04
 * acceptance copy). Larger files still run — the warning sets the user's
 * expectation that they may time out.
 *
 * The user-visible CHECKPOINT A→B that wires this dialog into the real
 * `PrototypeEditor` affordance is in Plan 02-06. Plan 02-04 ships the dialog
 * + a DEV-only `/dev/figma-import` route for standalone smoke testing (W-07
 * substitute for the previously-required temp button in BuilderShell).
 */

import { useEffect, useMemo, useState } from 'react';
import { uuidv7 } from 'uuidv7';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  useImportPrototype,
  ImportPrototypeError,
  type ImportPrototypeErrorCode,
} from '@/lib/queries/prototypes';
import { useImportJob, type PrototypeImport } from '@/lib/queries/imports';
import { parseFigmaShareLink } from '@/lib/figma/parse-share-link';

export interface FigmaImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studyId: string;
  /** Invoked when the user clicks "Use this prototype" after a successful
   *  import. Receives the new `prototype_versions.id` that Plan 02-06 will
   *  wire into the prototype block's `content.prototype_version_id`. */
  onComplete: (prototypeVersionId: string) => void;
}

/** Status values are tracked terminal vs in-flight for the disabled-state logic. */
const TERMINAL_STATUSES: ReadonlyArray<PrototypeImport['status']> = ['done', 'failed', 'partial'];

/** Render label for the status pill. Mirrors the Edge Function status enum. */
const STATUS_LABEL: Record<PrototypeImport['status'], string> = {
  pending: 'Pending',
  fetching: 'Fetching from Figma',
  rendering: 'Rendering frames',
  uploading: 'Uploading',
  done: 'Done',
  partial: 'Partial',
  failed: 'Failed',
};

/** Tailwind class for the status pill — green on done, amber on partial, red on
 *  failed, slate while running. */
function statusPillClass(status: PrototypeImport['status']): string {
  switch (status) {
    case 'done':
      return 'bg-emerald-100 text-emerald-900';
    case 'partial':
      return 'bg-amber-100 text-amber-900';
    case 'failed':
      return 'bg-red-100 text-red-900';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

/** Friendly copy for the typed error codes from `ImportPrototypeError`. */
function errorMessageFromCode(
  code: ImportPrototypeErrorCode | null,
  fallback: string | null,
): string {
  switch (code) {
    case 'workspace_membership_required':
      return "You don't have permission to import into this workspace.";
    case 'unauthenticated':
      return 'Sign in again to import a prototype.';
    case 'invalid_share_link':
      return 'That Figma share link is not recognized.';
    case 'study_not_found':
      return 'This test no longer exists.';
    case 'bad_request':
      return 'Missing or invalid import parameters.';
    case 'unknown':
    case null:
    default:
      return fallback ?? 'Import failed. Try again or check your token.';
  }
}

const SHARE_LINK_VALIDATION_ERROR =
  "That doesn't look like a Figma share link. Use a /proto/ or /design/ URL from File → Share.";

const SOFT_CAP_COPY =
  "Maxytest v1 supports prototypes up to 50 frames reliably. Larger files may time out — we'll show progress as we go.";

export function FigmaImportDialog({
  open,
  onOpenChange,
  studyId,
  onComplete,
}: FigmaImportDialogProps) {
  // PAT lives ONLY here. No localStorage, no sessionStorage, no cookie.
  // The close-effect below zeros it on `open=false` (D-02b).
  const [pat, setPat] = useState('');
  const [shareLink, setShareLink] = useState('');
  const [importId, setImportId] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  // Idempotency key is regenerated only on dialog open — so re-clicking
  // Import while a job is still in-flight is server-side idempotent per
  // UNIQUE (study_id, idempotency_key) on prototype_imports (T-02-04-06).
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => uuidv7());

  const importMutation = useImportPrototype();
  const importJob = useImportJob(importId);

  // D-02b — PAT zero-on-close. Also resets share-link, import_id, parse error,
  // and regenerates the idempotency key so the next session is fresh.
  useEffect(() => {
    if (!open) {
      setPat('');
      setShareLink('');
      setImportId(null);
      setParseError(null);
      setIdempotencyKey(uuidv7());
      importMutation.reset();
    }
    // Only run when `open` flips — `importMutation` is a stable ref from TanStack
    // Query; the lint config does not enforce exhaustive-deps so this is safe.
  }, [open]);

  // Mutation-level error (Edge Function returned non-2xx). Job-level error
  // (the worker failed mid-flight) comes from `importJob.data.error_message`.
  const mutationError = importMutation.error;
  // `useImportPrototype` declares its error as `ImportPrototypeError`, but be
  // defensive in case TanStack Query ever surfaces a different Error subclass.
  const mutationErrorMessage = mutationError
    ? mutationError instanceof ImportPrototypeError
      ? errorMessageFromCode(mutationError.code, mutationError.message)
      : ((mutationError as Error).message ?? 'Import failed. Try again.')
    : null;

  const handleShareLinkChange = (value: string) => {
    setShareLink(value);
    if (value === '') {
      setParseError(null);
      return;
    }
    const parsed = parseFigmaShareLink(value);
    setParseError(parsed === null ? SHARE_LINK_VALIDATION_ERROR : null);
  };

  const jobStatus = importJob.data?.status;
  const jobInFlight = !!jobStatus && !TERMINAL_STATUSES.includes(jobStatus);

  const importDisabled =
    pat === '' ||
    shareLink === '' ||
    parseError !== null ||
    importMutation.isPending ||
    jobInFlight;

  const handleImport = () => {
    importMutation.mutate(
      {
        share_link: shareLink,
        pat,
        study_id: studyId,
        idempotency_key: idempotencyKey,
      },
      {
        onSuccess: ({ import_id }) => {
          setImportId(import_id);
        },
      },
    );
  };

  const handleRetry = () => {
    // Drop the import_id so the form re-renders. The idempotency key is
    // intentionally NOT regenerated here — if the same PAT + share-link is
    // re-submitted, the server will dedupe to the existing import_id. The
    // user can also close the dialog to start over with a fresh key.
    setImportId(null);
    importMutation.reset();
  };

  const handleUseImported = () => {
    const pvId = importJob.data?.prototype_version_id;
    if (!pvId) return;
    onComplete(pvId);
    onOpenChange(false);
  };

  const showForm = importId === null;
  const job = importJob.data ?? null;
  const showSuccessCta = !!job && (job.status === 'done' || job.status === 'partial');
  const showRetryCta = !!job && job.status === 'failed';

  // Inline-compute the progress percentage. Guards against /0 and surfaces a
  // visible bar even at 0 of N so the user sees that the bar exists.
  const progressPct = useMemo(() => {
    if (!job || !job.frames_total) return 0;
    return Math.min(100, Math.round((job.frames_done / job.frames_total) * 100));
  }, [job]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import a Figma prototype</DialogTitle>
          <DialogDescription>
            Paste a share link and your Figma Personal Access Token.
          </DialogDescription>
        </DialogHeader>

        {showForm && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!importDisabled) handleImport();
            }}
          >
            <div className="space-y-1.5">
              <label htmlFor="figma-share-link" className="text-sm font-medium">
                Share link
              </label>
              <Input
                id="figma-share-link"
                type="url"
                value={shareLink}
                onChange={(e) => handleShareLinkChange(e.target.value)}
                placeholder="https://www.figma.com/proto/..."
                aria-invalid={parseError !== null}
                aria-describedby={parseError ? 'figma-share-link-error' : undefined}
                autoComplete="off"
              />
              {parseError && (
                <p id="figma-share-link-error" className="text-sm text-destructive">
                  {parseError}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="figma-pat" className="text-sm font-medium">
                Personal access token
              </label>
              <Input
                id="figma-pat"
                type="password"
                autoComplete="off"
                value={pat}
                onChange={(e) => setPat(e.target.value)}
                placeholder="figd_..."
              />
              <p className="text-xs text-muted-foreground">
                From figma.com/settings → Personal access tokens. Needs file_read scope.{' '}
                <strong>Stored only for this dialog session.</strong>
              </p>
            </div>

            <div
              role="note"
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
            >
              {SOFT_CAP_COPY}
            </div>

            {mutationErrorMessage && (
              <div
                role="alert"
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
              >
                {mutationErrorMessage}
              </div>
            )}
          </form>
        )}

        {!showForm && job && <ImportProgress job={job} progressPct={progressPct} />}

        <DialogFooter>
          {showForm && (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleImport} disabled={importDisabled}>
                {importMutation.isPending ? 'Starting…' : 'Import'}
              </Button>
            </>
          )}
          {!showForm && showSuccessCta && (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button
                type="button"
                onClick={handleUseImported}
                disabled={!job?.prototype_version_id}
              >
                Use this prototype
              </Button>
            </>
          )}
          {!showForm && showRetryCta && (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button type="button" onClick={handleRetry}>
                Retry
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ImportProgressProps {
  job: PrototypeImport;
  progressPct: number;
}

/**
 * Inline progress view. Driven by the Realtime broadcast from
 * `figma-import-worker` (Plan 02-03). When status flips to a terminal value,
 * `useImportJob` invalidates the query so warnings/error_message land from the
 * canonical DB row.
 */
function ImportProgress({ job, progressPct }: ImportProgressProps) {
  const warnings = Array.isArray(job.warnings) ? job.warnings : [];

  const errorBody = (() => {
    if (job.status !== 'failed') return null;
    if (job.error_message) return job.error_message;
    const code = job.error_code as ImportPrototypeErrorCode | null;
    return errorMessageFromCode(code, null);
  })();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusPillClass(
            job.status,
          )}`}
        >
          {STATUS_LABEL[job.status]}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {job.frames_done} / {job.frames_total} frames
        </span>
      </div>

      <Progress
        value={progressPct}
        aria-label="Import progress"
        aria-valuenow={job.frames_done}
        aria-valuemin={0}
        aria-valuemax={job.frames_total}
        role="progressbar"
      />

      {job.status === 'partial' && (
        <div
          role="alert"
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          We imported {job.frames_done} of {job.frames_total} frames — see warnings below.
        </div>
      )}

      {errorBody && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
        >
          {errorBody}
        </div>
      )}

      {warnings.length > 0 && (
        <details className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <summary className="cursor-pointer font-medium">
            {warnings.length} warning{warnings.length === 1 ? '' : 's'}
          </summary>
          <ul className="mt-2 space-y-1">
            {warnings.map((w, i) => {
              const code =
                w && typeof w === 'object' && 'code' in w
                  ? String((w as { code: unknown }).code)
                  : '';
              const message =
                w && typeof w === 'object' && 'message' in w
                  ? String((w as { message: unknown }).message)
                  : JSON.stringify(w);
              return (
                <li key={i} className="font-mono">
                  {code ? <strong>[{code}]</strong> : null} {message}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}
